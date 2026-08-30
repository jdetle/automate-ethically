import type { APIRoute } from "astro";
import { budgetRemaining, spend } from "../../lib/api-limits";

export const prerender = false;

/**
 * Text-to-speech for the guide, proxying OpenAI with the key on the server
 * side — a browser cannot keep a secret, so it is never given one.
 *
 * There is no second speaking engine and no fallback to the browser's own
 * `speechSynthesis`: platform voices are dated formant synths, and having
 * the guide read civic organizing advice in one of those would undercut the
 * page more than staying silent. When this route is unconfigured or the
 * upstream call fails, the client falls back to the text-arrival pulse
 * already in guide-orb-state.ts — the conversation stays fully usable
 * without sound either way.
 *
 * This is always called downstream of a /api/guide reply, so guide.ts's
 * per-visitor daily conversation cap already gates how often this runs in
 * the normal flow. It still keeps its own character budget below, for
 * defense in depth against someone calling it directly.
 */

const DAILY_CHARACTER_BUDGET = 300_000; // ~$4.50/day at tts-1 rates
const BUDGET_POOL = "speech-characters";
const MAX_CHARS_PER_CALL = 2000; // matches guide.ts's reply-length ceiling

export const GET: APIRoute = async () => {
	const configured = Boolean(import.meta.env.OPENAI_API_KEY);
	return new Response(JSON.stringify({ configured }), {
		headers: { "Content-Type": "application/json" },
	});
};

export const POST: APIRoute = async ({ request }) => {
	const apiKey = import.meta.env.OPENAI_API_KEY;
	if (!apiKey) {
		return new Response(JSON.stringify({ error: "not configured" }), {
			status: 503,
			headers: { "Content-Type": "application/json" },
		});
	}

	let body: { text?: string };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "bad request" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const text = (body.text ?? "").trim().slice(0, MAX_CHARS_PER_CALL);
	if (!text) {
		return new Response(JSON.stringify({ error: "nothing to say" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!budgetRemaining(BUDGET_POOL, DAILY_CHARACTER_BUDGET)) {
		return new Response(JSON.stringify({ error: "rate limited" }), {
			status: 429,
			headers: { "Content-Type": "application/json" },
		});
	}
	spend(BUDGET_POOL, text.length);

	let upstream: Response;
	try {
		upstream = await fetch("https://api.openai.com/v1/audio/speech", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			// 24kHz mono 16-bit PCM — matches the sample rate the client
			// schedules AudioBuffers at (see src/lib/speech-playback.ts).
			body: JSON.stringify({
				model: "tts-1",
				voice: "alloy",
				input: text,
				response_format: "pcm",
			}),
		});
	} catch (err) {
		console.error("speech: openai request failed", err);
		return new Response(JSON.stringify({ error: "upstream unreachable" }), {
			status: 503,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (upstream.status === 401 || upstream.status === 403) {
		console.error("speech: openai rejected the key");
		return new Response(JSON.stringify({ error: "not configured" }), {
			status: 503,
			headers: { "Content-Type": "application/json" },
		});
	}
	if (upstream.status === 429) {
		return new Response(JSON.stringify({ error: "rate limited" }), {
			status: 429,
			headers: { "Content-Type": "application/json" },
		});
	}
	if (!upstream.ok || !upstream.body) {
		const detail = await upstream.text().catch(() => "");
		console.error("speech: openai error", upstream.status, detail.slice(0, 200));
		return new Response(JSON.stringify({ error: "tts failed" }), {
			status: 502,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Pass the PCM stream straight through — no buffering, so audio starts
	// playing about as fast as the model can produce it.
	return new Response(upstream.body, {
		headers: {
			"Content-Type": "audio/L16;rate=24000;channels=1",
			"Cache-Control": "no-store",
		},
	});
};
