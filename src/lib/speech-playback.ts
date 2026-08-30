// Plays the guide's voice as it arrives — same technique as jacquard's Cedar
// (web/lib/cedar.ts): the server hands back raw 24kHz mono PCM, and each
// chunk is converted to an AudioBuffer and scheduled onto a running clock
// the moment it lands, rather than waiting for the whole utterance. The orb
// then breathes on the guide's actual output amplitude via a real
// AnalyserNode, not a simulated pulse — the pulse in guide-orb-state.ts is
// the fallback for when this isn't configured or fails, not the norm.

import { BANDS } from "./guide-orb-state";

const SAMPLE_RATE = 24000;
const LEAD_SECONDS = 0.12;

export interface SpeechHandle {
	done: Promise<void>;
	cancel: () => void;
}

export class SpeechUnavailable extends Error {}
export class SpeechBusy extends Error {}

let configuredPromise: Promise<boolean> | null = null;

/** One quiet probe per page load, rather than a failing POST per utterance. */
export function speechConfigured(): Promise<boolean> {
	configuredPromise ??= fetch("/api/speech")
		.then((r) => (r.ok ? r.json() : { configured: false }))
		.then((j: { configured?: boolean }) => Boolean(j.configured))
		.catch(() => false);
	return configuredPromise;
}

/**
 * Speaks `text`, reporting output level 0..1 and a BANDS-wide spectrum (low
 * frequency first, each 0..1) as it plays — read it per frame, don't retain
 * the array, it's reused every call.
 */
export async function speak(
	text: string,
	turnstileToken: string,
	onLevel: (level: number, bands: Float32Array) => void,
): Promise<SpeechHandle> {
	if (!(await speechConfigured())) throw new SpeechUnavailable("not configured");

	const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctx) throw new SpeechUnavailable("no Web Audio");

	const controller = new AbortController();

	const response = await fetch("/api/speech", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text, turnstileToken }),
		signal: controller.signal,
	});

	if (response.status === 503) throw new SpeechUnavailable("not configured");
	if (response.status === 429) throw new SpeechBusy("rate limited");
	if (!response.ok || !response.body) {
		const detail = await response.text().catch(() => "");
		throw new SpeechUnavailable(`tts ${response.status} ${detail.slice(0, 160)}`);
	}

	const ctx = new Ctx({ sampleRate: SAMPLE_RATE });
	await ctx.resume().catch(() => {});

	const gain = ctx.createGain();
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 512;
	gain.connect(analyser);
	analyser.connect(ctx.destination);

	let cursor = ctx.currentTime + LEAD_SECONDS;
	let cancelled = false;
	const sources: AudioBufferSourceNode[] = [];

	const meterBuf = new Float32Array(analyser.fftSize);
	const freqBuf = new Uint8Array(analyser.frequencyBinCount);
	const bands = new Float32Array(BANDS);
	let raf = 0;

	const meter = () => {
		analyser.getFloatTimeDomainData(meterBuf);
		let sum = 0;
		for (const v of meterBuf) sum += v * v;

		analyser.getByteFrequencyData(freqBuf);
		const top = Math.floor(freqBuf.length * 0.55);
		let from = 0;
		for (let b = 0; b < BANDS; b++) {
			const to = Math.max(from + 1, Math.round(top * ((b + 1) / BANDS) ** 2));
			let acc = 0;
			for (let i = from; i < to; i++) acc += freqBuf[i] as number;
			bands[b] = acc / (to - from) / 255;
			from = to;
		}

		onLevel(Math.min(1, Math.sqrt(sum / meterBuf.length) * 4.5), bands);
		raf = requestAnimationFrame(meter);
	};
	raf = requestAnimationFrame(meter);

	const cancel = () => {
		cancelled = true;
		controller.abort();
		for (const s of sources) {
			try {
				s.stop();
			} catch {
				/* already finished */
			}
		}
	};

	const pump = (async () => {
		const reader = response.body?.getReader();
		if (!reader) return;
		let carry: Uint8Array | null = null;
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done || cancelled) break;
				let bytes = value;
				if (carry) {
					const joined = new Uint8Array(carry.length + bytes.length);
					joined.set(carry);
					joined.set(bytes, carry.length);
					bytes = joined;
					carry = null;
				}
				if (bytes.length % 2 === 1) {
					carry = bytes.subarray(bytes.length - 1).slice();
					bytes = bytes.subarray(0, bytes.length - 1);
				}
				if (bytes.length === 0) continue;

				const samples = new Int16Array(
					bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
				);
				const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
				const channel = buffer.getChannelData(0);
				for (let i = 0; i < samples.length; i++) {
					channel[i] = (samples[i] as number) / 32768;
				}
				const source = ctx.createBufferSource();
				source.buffer = buffer;
				source.connect(gain);
				cursor = Math.max(cursor, ctx.currentTime + 0.02);
				source.start(cursor);
				cursor += buffer.duration;
				sources.push(source);
			}
		} catch {
			/* aborted or stream error — whatever was scheduled still plays */
		}

		const remaining = Math.max(0, cursor - ctx.currentTime);
		await new Promise((r) => setTimeout(r, cancelled ? 0 : remaining * 1000 + 60));
		cancelAnimationFrame(raf);
		bands.fill(0);
		onLevel(0, bands);
		await ctx.close().catch(() => {});
	})();

	return { done: pump, cancel };
}
