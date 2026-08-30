// Shared between GuideOrb.astro (the renderer) and guide.astro (the chat
// logic that drives it) — both import this module, so both see the same
// object. No framework, no store library: one mutable record is the whole
// state management this needs.

export const BANDS = 12;

// "searching" is distinct from "thinking" on purpose: the visitor should be
// able to tell, at a glance, when the guide has left the page to look
// something up versus when it is composing from what it already knows.
export type OrbConversationState = "idle" | "listening" | "thinking" | "searching" | "speaking";

export interface OrbState {
	state: OrbConversationState;
	/** 0..1 smoothed amplitude. */
	level: number;
	/** BANDS-wide, low frequency first, each 0..1 — reused every frame. */
	spectrum: Float32Array;
}

export const orbState: { current: OrbState } = {
	current: {
		state: "idle",
		level: 0,
		spectrum: new Float32Array(BANDS),
	},
};

export function setOrbConversationState(state: OrbConversationState) {
	orbState.current.state = state;
}

/**
 * There is no real audio here — no TTS provider, no cost beyond the Claude
 * call itself. What drives the figure is the actual text arriving from the
 * model: each chunk produces one pulse, sized by how much text just landed
 * and shaped by that text's own characters, so a short reply moves less than
 * a long one and different words genuinely produce different shapes rather
 * than a canned loop. It is not a waveform of real sound — it is honestly a
 * text-arrival pulse, not a claim of synthesized speech.
 */
export function pulseFromText(chunk: string) {
	const level = Math.min(1, 0.35 + chunk.length / 40);
	orbState.current.level = level;

	const bands = orbState.current.spectrum;
	for (let b = 0; b < BANDS; b++) {
		let acc = 0;
		for (let i = b; i < chunk.length; i += BANDS) {
			acc += chunk.charCodeAt(i) % 97;
		}
		const sample = chunk.length > 0 ? (acc % 97) / 97 : 0;
		bands[b] = 0.15 + sample * 0.75;
	}
}

/**
 * Fed by real audio analysis (speech-playback.ts) when text-to-speech is
 * configured and working — the actual driver when it's available, with
 * pulseFromText/decayOrb as the fallback when it isn't.
 */
export function setLevelAndSpectrum(level: number, bands: Float32Array) {
	orbState.current.level = level;
	const dest = orbState.current.spectrum;
	for (let b = 0; b < BANDS; b++) dest[b] = bands[b] ?? 0;
}

export function decayOrb(dt: number) {
	orbState.current.level = Math.max(0, orbState.current.level - dt * 0.6);
	const bands = orbState.current.spectrum;
	for (let b = 0; b < BANDS; b++) {
		bands[b] = Math.max(0, (bands[b] ?? 0) - dt * 0.5);
	}
}
