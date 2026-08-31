import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	getCachedSpeech,
	putCachedSpeech,
	resetSpeechCache,
	speechCacheKey,
	speechCacheStats,
} from "../../src/lib/speech-cache";
import { createSessionToken } from "../../src/lib/guide-session";

const SECRET = "test-turnstile-secret";
const OPENAI_KEY = "sk-test-not-a-real-key";

describe("the speech cache", () => {
	beforeEach(() => resetSpeechCache());

	test("returns the same audio for the same text, and misses on different text", () => {
		const key = speechCacheKey("hello there", "gpt-4o-mini-tts", "cedar");
		expect(getCachedSpeech(key)).toBeNull();

		const audio = Buffer.from([1, 2, 3, 4]);
		putCachedSpeech(key, audio);
		expect(getCachedSpeech(key)).toEqual(audio);

		const other = speechCacheKey("something else", "gpt-4o-mini-tts", "cedar");
		expect(getCachedSpeech(other)).toBeNull();
	});

	test("changing the voice or model changes the key", () => {
		const base = speechCacheKey("hello", "gpt-4o-mini-tts", "cedar");
		// Otherwise a voice change would keep serving the old voice until the
		// process restarted.
		expect(speechCacheKey("hello", "gpt-4o-mini-tts", "marin")).not.toBe(base);
		expect(speechCacheKey("hello", "tts-1", "cedar")).not.toBe(base);
	});

	test("refuses entries too large to be worth holding", () => {
		const key = speechCacheKey("very long", "gpt-4o-mini-tts", "cedar");
		putCachedSpeech(key, Buffer.alloc(5 * 1024 * 1024)); // over the 4MB cap
		expect(getCachedSpeech(key)).toBeNull();
		expect(speechCacheStats().bytes).toBe(0);
	});

	test("never stores an empty body", () => {
		const key = speechCacheKey("empty", "gpt-4o-mini-tts", "cedar");
		putCachedSpeech(key, Buffer.alloc(0));
		expect(getCachedSpeech(key)).toBeNull();
	});

	test("evicts the least recently used once the byte budget is exceeded", () => {
		const oneMb = 1024 * 1024;
		const keys = Array.from({ length: 40 }, (_, i) =>
			speechCacheKey(`sentence ${i}`, "gpt-4o-mini-tts", "cedar"),
		);
		// 40MB into a 32MB budget.
		for (const key of keys) putCachedSpeech(key, Buffer.alloc(oneMb, 7));

		expect(speechCacheStats().bytes).toBeLessThanOrEqual(32 * oneMb);
		expect(speechCacheStats().evicted).toBeGreaterThan(0);
		// The newest survived; the oldest did not.
		expect(getCachedSpeech(keys[keys.length - 1] as string)).not.toBeNull();
		expect(getCachedSpeech(keys[0] as string)).toBeNull();
	});

	test("a read makes an entry fresh, so it outlives newer ones", () => {
		const oneMb = 1024 * 1024;
		const first = speechCacheKey("first", "gpt-4o-mini-tts", "cedar");
		putCachedSpeech(first, Buffer.alloc(oneMb, 1));
		for (let i = 0; i < 20; i++) {
			putCachedSpeech(speechCacheKey(`filler ${i}`, "gpt-4o-mini-tts", "cedar"), Buffer.alloc(oneMb));
		}

		expect(getCachedSpeech(first)).not.toBeNull(); // touch it
		for (let i = 20; i < 40; i++) {
			putCachedSpeech(speechCacheKey(`filler ${i}`, "gpt-4o-mini-tts", "cedar"), Buffer.alloc(oneMb));
		}

		expect(getCachedSpeech(first), "a recently read entry was evicted").not.toBeNull();
	});
});

describe("the speech route's use of the cache", () => {
	let calls: number;

	beforeEach(() => {
		resetSpeechCache();
		calls = 0;
		process.env.TURNSTILE_SECRET_KEY = SECRET;
		process.env.OPENAI_API_KEY = OPENAI_KEY;
		vi.stubGlobal("fetch", () => {
			calls++;
			// A short, valid PCM body.
			return Promise.resolve(new Response(new Uint8Array(4800), { status: 200 }));
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		process.env.TURNSTILE_SECRET_KEY = undefined;
		process.env.OPENAI_API_KEY = undefined;
		vi.resetModules();
	});

	async function speak(text: string) {
		const { POST } = await import("../../src/pages/api/speech");
		const { token } = createSessionToken(SECRET);
		return POST({
			request: new Request("https://example.test/api/speech", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text, sessionToken: token }),
			}),
			clientAddress: "203.0.113.7",
		} as unknown as Parameters<typeof POST>[0]);
	}

	test("synthesises once, then serves the same sentence from memory", async () => {
		const first = await speak("Start at your city council.");
		expect(first.headers.get("X-Speech-Cache")).toBe("miss");
		// Drain it: the entry is only stored once the stream finishes.
		await first.arrayBuffer();
		expect(calls).toBe(1);

		const second = await speak("Start at your city council.");
		expect(second.headers.get("X-Speech-Cache")).toBe("hit");
		expect(calls, "paid OpenAI twice for identical text").toBe(1);

		const audio = await second.arrayBuffer();
		expect(audio.byteLength).toBe(4800);
	});

	test("a different sentence still costs a call", async () => {
		await (await speak("first sentence")).arrayBuffer();
		await (await speak("second sentence")).arrayBuffer();
		expect(calls).toBe(2);
	});

	test("an abandoned stream is not stored, so no one hears a truncated sentence", async () => {
		const res = await speak("half a sentence");
		expect(res.headers.get("X-Speech-Cache")).toBe("miss");
		await res.body?.cancel(); // never drained to completion

		const again = await speak("half a sentence");
		expect(again.headers.get("X-Speech-Cache")).toBe("miss");
	});
});
