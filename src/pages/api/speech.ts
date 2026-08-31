import type { APIRoute } from "astro";
import { budgetRemaining, clientIp, spend, verifyTurnstile } from "../../lib/api-limits";
import { readSecret } from "../../lib/env";
import { verifySessionToken } from "../../lib/guide-session";
import { getCachedSpeech, putCachedSpeech, speechCacheKey } from "../../lib/speech-cache";
import { initSentry, Sentry } from "../../lib/sentry";

export const prerender = false;

initSentry();

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

const DAILY_CHARACTER_BUDGET = 300_000; // ~$3.60/day at gpt-4o-mini-tts rates ($12/1M chars)
const BUDGET_POOL = "speech-characters";
const MAX_CHARS_PER_CALL = 2000; // matches guide.ts's reply-length ceiling

// Named once so the request and the cache key can never disagree about which
// voice is stored. cedar is one of the two voices OpenAI recommends on
// gpt-4o-mini-tts; pcm is the only response_format the player can decode.
const TTS_MODEL = "gpt-4o-mini-tts";
const TTS_VOICE = "cedar";
const PCM_HEADERS = {
	"Content-Type": "audio/L16;rate=24000;channels=1",
	"Cache-Control": "no-store",
};

export const GET: APIRoute = async () => {
	// process.env, not import.meta.env — see the comment in guide.ts's
	// Turnstile check for why: import.meta.env.X for a non-PUBLIC_ var gets
	// statically inlined at build time in this adapter's server bundle, so it
	// would never see a value set only at container runtime.
	const configured = Boolean(readSecret("OPENAI_API_KEY"));
	return new Response(JSON.stringify({ configured }), {
		headers: { "Content-Type": "application/json" },
	});
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
	let body: { text?: string; turnstileToken?: string; sessionToken?: string };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "bad request" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Fail CLOSED, same rule as guide.ts: an unconfigured secret is refused,
	// not skipped. Speech is normally reached only after a guide reply
	// already passed this same check, but it keeps its own verification
	// rather than trusting that — a caller that skips /api/guide entirely
	// must still clear this bar before OpenAI gets a request.
	const ip = clientIp(request, clientAddress ?? "unknown");
	const turnstileSecret = readSecret("TURNSTILE_SECRET_KEY");
	if (!turnstileSecret) {
		return new Response(JSON.stringify({ error: "not configured" }), {
			status: 503,
			headers: { "Content-Type": "application/json" },
		});
	}
	// Session token first (see lib/guide-session.ts): speech runs after every
	// spoken reply, so requiring a fresh Turnstile token here was half of why
	// a visitor got challenged constantly.
	const verified =
		verifySessionToken(body.sessionToken, turnstileSecret) ||
		(await verifyTurnstile(body.turnstileToken, turnstileSecret, ip));
	if (!verified) {
		return new Response(JSON.stringify({ error: "verification failed" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}

	const apiKey = readSecret("OPENAI_API_KEY");
	if (!apiKey) {
		return new Response(JSON.stringify({ error: "not configured" }), {
			status: 503,
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

	// Before the budget check, not after: a cached sentence costs nothing to
	// serve, so it must neither be refused when the budget is exhausted nor
	// spend against it. Charging for audio we already have would make the
	// cache pointless.
	const cacheKey = speechCacheKey(text, TTS_MODEL, TTS_VOICE);
	const cached = getCachedSpeech(cacheKey);
	if (cached) {
		return new Response(new Uint8Array(cached), {
			headers: { ...PCM_HEADERS, "X-Speech-Cache": "hit" },
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
			// gpt-4o-mini-tts, not tts-1: cedar is only available on the newer
			// model (tts-1/tts-1-hd's voice roster tops out at 9 older voices
			// and doesn't include it) — same PCM output format either way.
			body: JSON.stringify({
				model: TTS_MODEL,
				voice: TTS_VOICE,
				input: text,
				response_format: "pcm",
			}),
		});
	} catch (err) {
		console.error("speech: openai request failed", err);
		Sentry.captureException(err);
		return new Response(JSON.stringify({ error: "upstream unreachable" }), {
			status: 503,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (upstream.status === 401 || upstream.status === 403) {
		console.error("speech: openai rejected the key");
		Sentry.captureMessage("speech: openai rejected the API key", "error");
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

	// Tee rather than buffer. The chunks reach the browser exactly as they
	// arrive, so audio still starts about as fast as the model can produce it;
	// a copy accumulates alongside and is stored only once the stream has
	// finished cleanly. A stream that errors or is abandoned half-way stores
	// nothing, because a truncated entry would serve a sentence that stops
	// mid-word for as long as it lived in the cache.
	const chunks: Uint8Array[] = [];
	let bytes = 0;

	const teed = upstream.body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				chunks.push(chunk);
				bytes += chunk.byteLength;
				controller.enqueue(chunk);
			},
			flush() {
				if (bytes > 0) putCachedSpeech(cacheKey, Buffer.concat(chunks, bytes));
			},
		}),
	);

	return new Response(teed, {
		headers: { ...PCM_HEADERS, "X-Speech-Cache": "miss" },
	});
};
