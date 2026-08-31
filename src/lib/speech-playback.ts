// Plays the guide's voice as it arrives — the server hands back raw 24kHz
// mono PCM, and each chunk becomes an AudioBuffer scheduled onto a running
// clock the moment it lands, rather than waiting for the whole utterance.
// The orb then breathes on the guide's actual output amplitude via a real
// AnalyserNode; the pulse in guide-orb-state.ts is the fallback for when
// this isn't configured or fails, not the norm.
//
// Two things this module exists to get right, both learned from it being
// silently broken in production:
//
// 1. **The context must be unlocked by a real user gesture.** Safari (and
//    iOS in particular) starts every AudioContext suspended and will only
//    resume one inside a genuine user-initiated event. The old code built a
//    context after the reply had already streamed — long after any gesture —
//    so it stayed suspended and played nothing at all, while the UI happily
//    said "voice on". unlockAudio() is called from the voice toggle's click
//    handler, which is the one moment a gesture is guaranteed.
// 2. **One long-lived context, not one per utterance.** A context closed
//    after each reply throws away the unlock, so only the first utterance
//    could ever play. This keeps a single context for the page's lifetime.
//
// Also note the sample rate is NOT forced on the context. Requesting
// 24000 outright is rejected outright on some Safari versions; instead the
// context runs at whatever rate the device prefers and each AudioBuffer
// declares 24000, which the browser resamples on playback.

import { BANDS } from "./guide-orb-state";

const SAMPLE_RATE = 24000;
const LEAD_SECONDS = 0.08;

export class SpeechUnavailable extends Error {}

let configuredPromise: Promise<boolean> | null = null;

/** One quiet probe per page load, rather than a failing POST per utterance. */
export function speechConfigured(): Promise<boolean> {
	configuredPromise ??= fetch("/api/speech")
		.then((r) => (r.ok ? r.json() : { configured: false }))
		.then((j: { configured?: boolean }) => Boolean(j.configured))
		.catch(() => false);
	return configuredPromise;
}

let sharedCtx: AudioContext | null = null;

function audioContextCtor(): typeof AudioContext | null {
	return (
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
		null
	);
}

/**
 * MUST be called synchronously from inside a user-gesture handler (a click),
 * or Safari will refuse to resume and every later utterance is silent.
 * Safe to call repeatedly.
 */
export async function unlockAudio(): Promise<boolean> {
	const Ctx = audioContextCtor();
	if (!Ctx) return false;
	if (!sharedCtx) {
		try {
			sharedCtx = new Ctx();
		} catch {
			return false;
		}
	}
	try {
		if (sharedCtx.state === "suspended") await sharedCtx.resume();
	} catch {
		/* fall through — reported by state below */
	}
	// A silent one-sample blip: on some versions the context only truly
	// leaves "interrupted"/"suspended" once something has actually played.
	try {
		const buf = sharedCtx.createBuffer(1, 1, 22050);
		const src = sharedCtx.createBufferSource();
		src.buffer = buf;
		src.connect(sharedCtx.destination);
		src.start(0);
	} catch {
		/* non-fatal */
	}
	return sharedCtx.state === "running";
}

export interface SpeechSession {
	/** Queue a piece of text. Segments play strictly in the order queued. */
	enqueue: (text: string) => void;
	/** True once at least one buffer has actually been scheduled to play. */
	readonly audible: boolean;
	/** No more text is coming; resolves `done` once everything has played. */
	end: () => void;
	cancel: () => void;
	done: Promise<void>;
}

/**
 * Strips markdown so the voice reads prose rather than punctuation. The model
 * now answers in markdown (headings, lists, links), and reading "pound pound"
 * or a raw URL aloud is worse than useless.
 */
export function plainTextForSpeech(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/^\s{0,3}#{1,6}\s+/gm, "")
		.replace(/^\s{0,3}>\s?/gm, "")
		.replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "")
		.replace(/(\*\*|__)(.*?)\1/g, "$2")
		.replace(/(\*|_)(.*?)\1/g, "$2")
		.replace(/^\s*([-*_]\s*){3,}$/gm, " ")
		.replace(/https?:\/\/\S+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Starts a speech session that speaks text incrementally. Callers feed it
 * sentences as the model produces them, so the guide starts talking while it
 * is still writing rather than after it has finished — which is the whole
 * difference between "real time" and "a pause, then a monologue".
 */
export function startSpeech(
	sessionToken: () => Promise<string>,
	onLevel: (level: number, bands: Float32Array) => void,
	/**
	 * Fires once, the first time a buffer is actually scheduled onto the
	 * clock. Callers use it to show a "reading aloud" affordance only when
	 * something is really being read aloud: /api/speech can answer 503 (no
	 * key) or reject the session token, and both of those paths return
	 * quietly below — the reply is already on screen, so failing silently is
	 * right, but claiming to be speaking is not.
	 */
	onAudible?: () => void,
): SpeechSession {
	// Captured into a non-null local so the closures below (which outlive this
	// call) can't be narrowed away by a later reassignment of sharedCtx.
	if (!sharedCtx) throw new SpeechUnavailable("audio not unlocked");
	const ctx: AudioContext = sharedCtx;

	const gain = ctx.createGain();
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 512;
	gain.connect(analyser);
	analyser.connect(ctx.destination);

	let cursor = ctx.currentTime + LEAD_SECONDS;
	let cancelled = false;
	let ended = false;
	let audible = false;
	const sources: AudioBufferSourceNode[] = [];
	const controllers: AbortController[] = [];

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

	// Segments are fetched and scheduled strictly one after another. Doing
	// them concurrently would be faster to first byte but could interleave
	// audio out of order, which is worse than a few hundred milliseconds.
	let chain: Promise<void> = Promise.resolve();
	let resolveDone: () => void = () => {};
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});

	async function speakSegment(text: string) {
		if (cancelled) return;
		const spoken = plainTextForSpeech(text);
		if (!spoken) return;

		const controller = new AbortController();
		controllers.push(controller);

		let response: Response;
		try {
			response = await fetch("/api/speech", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: spoken, sessionToken: await sessionToken() }),
				signal: controller.signal,
			});
		} catch {
			return; // network or abort — the text is already on screen
		}
		if (!response.ok || !response.body || cancelled) return;

		const reader = response.body.getReader();
		let carry: Uint8Array | null = null;
		try {
			for (;;) {
				const { done: streamDone, value } = await reader.read();
				if (streamDone || cancelled) break;
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
				for (let i = 0; i < samples.length; i++) channel[i] = (samples[i] as number) / 32768;

				const source = ctx.createBufferSource();
				source.buffer = buffer;
				source.connect(gain);
				cursor = Math.max(cursor, ctx.currentTime + 0.02);
				source.start(cursor);
				cursor += buffer.duration;
				sources.push(source);

				if (!audible) {
					audible = true;
					onAudible?.();
				}
			}
		} catch {
			/* aborted or stream error — whatever was scheduled still plays */
		}
	}

	function settleIfFinished() {
		if (!ended || cancelled) return;
		void chain.then(async () => {
			const remaining = Math.max(0, cursor - ctx.currentTime);
			await new Promise((r) => setTimeout(r, cancelled ? 0 : remaining * 1000 + 80));
			cancelAnimationFrame(raf);
			bands.fill(0);
			onLevel(0, bands);
			try {
				gain.disconnect();
				analyser.disconnect();
			} catch {
				/* already torn down */
			}
			resolveDone();
		});
	}

	return {
		get audible() {
			return audible;
		},
		enqueue(text: string) {
			if (cancelled || ended) return;
			chain = chain.then(() => speakSegment(text));
		},
		end() {
			ended = true;
			settleIfFinished();
		},
		cancel() {
			cancelled = true;
			for (const c of controllers) c.abort();
			for (const s of sources) {
				try {
					s.stop();
				} catch {
					/* already finished */
				}
			}
			cancelAnimationFrame(raf);
			bands.fill(0);
			onLevel(0, bands);
			try {
				gain.disconnect();
				analyser.disconnect();
			} catch {
				/* already torn down */
			}
			resolveDone();
		},
		done,
	};
}
