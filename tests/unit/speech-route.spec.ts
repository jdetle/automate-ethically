import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSessionToken } from "../../src/lib/guide-session";

/**
 * Pins what the guide's voice actually asks for.
 *
 * The client half is covered end to end by tests/speech-audio.e2e.spec.ts:
 * PCM in, AudioBuffers scheduled on a running context. What that cannot see
 * is which service produced the bytes, because it stubs the route. This
 * covers the other half by calling the real route with fetch stubbed, so the
 * outgoing OpenAI request is inspected directly.
 *
 * It matters because the failure is silent and total. Ask for a voice the
 * model does not offer and OpenAI answers 400, the route turns that into a
 * 502, the client returns quietly (the reply is already on screen), and the
 * page simply never makes a sound. Nothing about that is visible in a build,
 * a type check, or the client tests.
 *
 * cedar is one of the two voices OpenAI recommends on gpt-4o-mini-tts, and
 * pcm is the one response_format the player can decode: it schedules signed
 * 16-bit little-endian samples at 24kHz straight into AudioBuffers, so an
 * mp3 or wav body here would decode to noise or to nothing.
 */

const SECRET = "test-turnstile-secret";
const OPENAI_KEY = "sk-test-not-a-real-key";

function speechRequest(text = "Start at your city council.") {
	const { token } = createSessionToken(SECRET);
	return new Request("https://example.test/api/speech", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text, sessionToken: token }),
	});
}

/** A second of silence, in the format the player expects. */
function pcmBody() {
	return new Response(new Uint8Array(24_000 * 2), {
		status: 200,
		headers: { "Content-Type": "audio/pcm" },
	});
}

describe("the guide's voice", () => {
	let calls: { url: string; init: RequestInit }[];

	beforeEach(() => {
		calls = [];
		process.env.TURNSTILE_SECRET_KEY = SECRET;
		process.env.OPENAI_API_KEY = OPENAI_KEY;
		vi.stubGlobal("fetch", (url: string | URL | Request, init: RequestInit) => {
			calls.push({ url: String(url), init });
			return Promise.resolve(pcmBody());
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		process.env.TURNSTILE_SECRET_KEY = undefined;
		process.env.OPENAI_API_KEY = undefined;
		vi.resetModules();
	});

	async function post(text?: string) {
		const { POST } = await import("../../src/pages/api/speech");
		return POST({
			request: speechRequest(text),
			clientAddress: "203.0.113.7",
		} as unknown as Parameters<typeof POST>[0]);
	}

	test("comes from OpenAI's cedar voice, as streamable PCM", async () => {
		const res = await post();

		expect(calls, "the route never called OpenAI").toHaveLength(1);
		const call = calls[0];
		expect(call?.url).toBe("https://api.openai.com/v1/audio/speech");

		const sent = JSON.parse(String(call?.init.body));
		// cedar is not on tts-1 or tts-1-hd; asking for it there is a 400 and
		// therefore silence.
		expect(sent.model).toBe("gpt-4o-mini-tts");
		expect(sent.voice).toBe("cedar");
		// The player decodes raw s16le at 24kHz. Any other format is noise.
		expect(sent.response_format).toBe("pcm");
		expect(sent.input).toContain("city council");

		expect(res.status).toBe(200);
		// Declared at the rate speech-playback.ts builds its AudioBuffers with.
		expect(res.headers.get("Content-Type")).toBe("audio/L16;rate=24000;channels=1");
	});

	test("sends the key as a bearer header and never in the body", async () => {
		await post();
		const call = calls[0];
		const headers = call?.init.headers as Record<string, string>;
		expect(headers.Authorization).toBe(`Bearer ${OPENAI_KEY}`);
		expect(String(call?.init.body)).not.toContain(OPENAI_KEY);
	});

	test("refuses without a verified session, before OpenAI is ever called", async () => {
		const { POST } = await import("../../src/pages/api/speech");
		const res = await POST({
			request: new Request("https://example.test/api/speech", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "hello", sessionToken: "forged" }),
			}),
			clientAddress: "203.0.113.7",
		} as unknown as Parameters<typeof POST>[0]);

		expect(res.status).toBe(403);
		expect(calls, "spent an OpenAI call on an unverified request").toHaveLength(0);
	});

	test("an upstream refusal becomes a clean failure, not a broken audio stream", async () => {
		vi.stubGlobal("fetch", (url: string | URL | Request, init: RequestInit) => {
			calls.push({ url: String(url), init });
			// What an unsupported voice would actually return.
			return Promise.resolve(
				new Response(JSON.stringify({ error: { message: "Invalid value: 'cedar'" } }), {
					status: 400,
				}),
			);
		});

		const res = await post();
		expect(res.status).toBe(502);
		expect(res.headers.get("Content-Type")).toBe("application/json");
	});
});
