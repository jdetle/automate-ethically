import { describe, expect, test } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildGuideRequest } from "../../src/pages/api/guide";

/**
 * Pins the guide's prompt-caching arrangement to the bytes on the wire.
 *
 * Prompt caching is a prefix match: the request renders as tools, then
 * system, then messages, and one changed byte invalidates everything after
 * it. That makes a caching regression the quietest failure this codebase can
 * have — the replies keep coming, nothing errors, nothing is logged, and the
 * only symptom is a bigger bill some weeks later. The usual cause is not a
 * bad first implementation but an ordinary later edit to prompt assembly: a
 * "current date" line added to the system prompt, a conditional section, a
 * tool list built from something that varies.
 *
 * guide.ts logs `cache_read` and `cache_write` per reply, which is how a
 * regression would eventually be *noticed*. This is how it gets caught.
 */

const stableSystem = (req: Anthropic.MessageStreamParams) =>
	(req.system as Anthropic.TextBlockParam[])[0];

function turns(count: number): Anthropic.MessageParam[] {
	return Array.from({ length: count }, (_, i) => ({
		role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
		content: `turn ${i}`,
	}));
}

describe("the guide's prompt cache", () => {
	test("the stable prefix carries a breakpoint and clears the minimum", () => {
		const req = buildGuideRequest({ messages: turns(1), injectionSuspected: false });

		const first = stableSystem(req);
		expect(first.cache_control).toEqual({ type: "ephemeral" });

		// Claude Opus 5 needs a 512-token prefix before it will cache at all,
		// and under that the marker is ignored silently — no error, no cache,
		// nothing to notice. Four characters per token is deliberately
		// conservative; the real prompt is around 900 tokens.
		expect(first.text.length / 4).toBeGreaterThan(512);
	});

	test("the conversation tail is cached too, not just the system prompt", () => {
		const req = buildGuideRequest({ messages: turns(6), injectionSuspected: false });

		// Automatic caching: the API places this on the last cacheable block
		// and moves it forward as the conversation grows, so turn N+1 reads
		// turns 1..N rather than reprocessing them at full price. Without it
		// only the ~900-token system prefix was ever cached, and a long
		// conversation re-paid for its whole history on every single reply.
		expect(req.cache_control).toEqual({ type: "ephemeral" });
	});

	test("what a visitor typed never reaches the cached prefix", () => {
		// The regression that would cost the most and show the least: one
		// adversarial visitor evicting the shared entry every other turn, so
		// every conversation after theirs pays to rebuild it.
		const ordinary = buildGuideRequest({ messages: turns(1), injectionSuspected: false });
		const suspicious = buildGuideRequest({ messages: turns(1), injectionSuspected: true });

		expect(stableSystem(suspicious).text).toBe(stableSystem(ordinary).text);
		expect(JSON.stringify(suspicious.tools)).toBe(JSON.stringify(ordinary.tools));
		expect(suspicious.model).toBe(ordinary.model);

		// The reinforcement is real, and sits after the breakpoint.
		const blocks = suspicious.system as Anthropic.TextBlockParam[];
		expect(blocks).toHaveLength(2);
		expect(blocks[1].cache_control).toBeUndefined();
		expect((ordinary.system as Anthropic.TextBlockParam[])).toHaveLength(1);
	});

	test("the prefix is the same bytes on every request", () => {
		// A timestamp, a visitor id, or a tool list assembled from anything
		// per-request would all show up here. Everything ahead of the
		// breakpoint has to be a constant.
		const prefix = (req: Anthropic.MessageStreamParams) =>
			JSON.stringify({ model: req.model, tools: req.tools, system: stableSystem(req) });

		expect(prefix(buildGuideRequest({ messages: turns(1), injectionSuspected: false }))).toBe(
			prefix(buildGuideRequest({ messages: turns(9), injectionSuspected: false })),
		);
	});

	test("the breakpoint count stays under the API's limit of four", () => {
		const req = buildGuideRequest({ messages: turns(6), injectionSuspected: true });
		const explicit = (req.system as Anthropic.TextBlockParam[]).filter(
			(b) => b.cache_control,
		).length;
		// Automatic caching consumes a slot of its own; going over four is a
		// 400 from the API, not a silent degradation.
		expect(explicit + (req.cache_control ? 1 : 0)).toBeLessThanOrEqual(4);
	});
});
