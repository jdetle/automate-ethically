// A byte-bounded LRU for synthesised speech.
//
// Every spoken reply is billed per character, and the guide repeats itself a
// lot: the opening line, the standing caveats, "I couldn't find anything
// concrete for your town", and whole sentences that recur across visitors
// asking the same question. Re-synthesising identical text produces
// byte-identical audio, so paying for it twice buys nothing.
//
// In-memory and per-process, the same shape as the budget counters in
// api-limits.ts and with the same honest limitation: it resets on restart and
// is not shared across replicas. That is the right trade here. The cache is an
// optimisation, never a correctness requirement, so a cold process is slower
// and costs more but is never wrong. A shared store is the natural upgrade if
// traffic makes the single-replica assumption wrong.
//
// Bounded by total bytes rather than entry count, because entries vary by
// three orders of magnitude: PCM at 24kHz mono 16-bit is 48KB per second, so
// one sentence is ~150KB and a maximum-length utterance is several MB. An
// entry-count cap would let a handful of long ones eat every byte a container
// has.

import { createHash } from "node:crypto";

/** 24kHz mono 16-bit PCM: 48KB per second of audio. */
const BYTES_PER_SECOND = 24_000 * 2;

/** Roughly twelve minutes of audio, which is a lot of repeated sentences. */
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

/**
 * Anything longer than this is a one-off worth streaming but not worth
 * holding: a single such entry would evict dozens of common sentences.
 */
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;

/**
 * Audio does not go stale, but a long-lived process should not keep holding a
 * sentence nobody has asked for in hours.
 */
const TTL_MS = 6 * 60 * 60 * 1000;

interface Entry {
	audio: Buffer;
	storedAt: number;
}

// Map preserves insertion order, so re-inserting on read gives LRU eviction
// without a second data structure.
const entries = new Map<string, Entry>();
let totalBytes = 0;

const stats = { hits: 0, misses: 0, stored: 0, evicted: 0 };

/**
 * Keyed on the voice parameters as well as the text: changing model or voice
 * makes every stored entry wrong, and a key that ignored them would go on
 * serving the old voice until the process restarted.
 */
export function speechCacheKey(text: string, model: string, voice: string): string {
	return createHash("sha256").update(`${model} ${voice} ${text}`).digest("hex");
}

function drop(key: string): void {
	const entry = entries.get(key);
	if (!entry) return;
	entries.delete(key);
	totalBytes -= entry.audio.byteLength;
}

export function getCachedSpeech(key: string): Buffer | null {
	const entry = entries.get(key);
	if (!entry) {
		stats.misses++;
		return null;
	}
	if (Date.now() - entry.storedAt > TTL_MS) {
		drop(key);
		stats.misses++;
		return null;
	}
	// Re-insert to move it to the freshest position.
	entries.delete(key);
	entries.set(key, entry);
	stats.hits++;
	return entry.audio;
}

export function putCachedSpeech(key: string, audio: Buffer): void {
	if (audio.byteLength === 0 || audio.byteLength > MAX_ENTRY_BYTES) return;

	drop(key); // replacing, not duplicating
	entries.set(key, { audio, storedAt: Date.now() });
	totalBytes += audio.byteLength;
	stats.stored++;

	// Evict oldest-first until the budget holds again.
	for (const oldest of entries.keys()) {
		if (totalBytes <= MAX_TOTAL_BYTES) break;
		drop(oldest);
		stats.evicted++;
	}
}

export function speechCacheStats() {
	return {
		...stats,
		entries: entries.size,
		bytes: totalBytes,
		seconds: Math.round(totalBytes / BYTES_PER_SECOND),
	};
}

/** Tests only. */
export function resetSpeechCache(): void {
	entries.clear();
	totalBytes = 0;
	stats.hits = 0;
	stats.misses = 0;
	stats.stored = 0;
	stats.evicted = 0;
}
