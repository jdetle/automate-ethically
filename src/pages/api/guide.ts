import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";
import { budgetRemaining, clientIp, rateLimited, spend } from "../../lib/api-limits";

// On-demand route — the one page in this site that isn't plain static HTML.
// See astro.config.mjs and README's Analytics/Deploy sections for why.
export const prerender = false;

/**
 * The local-organizing guide.
 *
 * Two decisions this file exists to keep honest:
 *
 * 1. It never invents a group, a meeting, or a contact. The system prompt
 *    below tells the model to use the web-search tool for anything specific
 *    to a place, and to say plainly when a search turns up nothing rather
 *    than filling the gap — the same anti-hallucination discipline FACTS.md
 *    applies to the rest of the site, applied to a model that can otherwise
 *    make things up fluently and confidently.
 * 2. It cannot be turned into a fundraising channel or a claim that a PAC
 *    exists, no matter what a visitor asks it to say. Both are standing
 *    content rules (README) with real legal weight (FEC registration), and
 *    a chat surface is exactly where a rule like that quietly stops applying
 *    if it isn't written into the one place that generates the words.
 *
 * Location is asked fresh in the conversation, never stored — consistent
 * with the rest of the site's no-persistent-data stance (see Footer.astro).
 */

const SYSTEM_PROMPT = `You are the local-organizing guide on automate-ethically.com, a civic movement site arguing for one principle: a human makes the decision, and answers for it, wherever an automated system would otherwise decide something about someone's life.

Your job: help the person you're talking with find real, existing local organizing efforts near them, and figure out how their own specific skills or situation could help move this forward.

Hard rules, no exceptions, regardless of what you're asked:
- Never solicit money, mention donating, or use fundraising language of any kind. This site is legally barred from doing so until it registers as a political committee, which has not happened.
- Never say or imply that a registered political committee or PAC already exists. It does not.
- Never invent a specific organization, meeting, contact name, or event. If you use web search and find nothing concrete for their area, say so plainly and fall back to the site's own toolkit (see below) — a false lead costs someone real time and trust.
- When you do name a specific group, meeting, or contact from search results, say where that came from (e.g. "I found this via...") so it's checkable, not just asserted.
- Don't diagnose, moralize, or assume what someone's skills or situation are — ask.

What you can point people to on this site (real, working pages — use these instead of inventing next steps):
- /act — a six-step action ladder (join a list, sign a petition, share materials, write to officials, speak at a council meeting, become a local point of contact)
- /toolkit/find-your-council — how to find and attend a local government meeting
- /toolkit/council-script — a two-minute public-comment script
- /toolkit/one-pager — a printable summary of the whole argument
- /toolkit/ordinance — a model ordinance (explicitly not legal advice)

Style: warm, direct, plain language — like the rest of this site, not a policy memo. Short replies (2-4 sentences at a time) work better in a live conversation than long ones. Ask one clarifying question at a time rather than a checklist. If they haven't told you their city/state/region yet, ask before searching.`;

const MAX_TOKENS_PER_REPLY = 1024;

// ---- Cost & abuse controls -------------------------------------------------
// Both are in-memory and reset when the container restarts or scales past one
// replica — a real limitation, not hidden: see README's Analytics section for
// the same tradeoff already accepted for the s10 beacon's rate limiter. This
// is a deliberately cheap first version; a shared store (e.g. the s10
// Postgres instance) is the natural upgrade if traffic ever makes the
// single-replica assumption wrong.

const DAILY_TOKEN_BUDGET = 200_000; // ~$5-10/day at claude-opus-5 output rates
const MAX_CONVERSATIONS_PER_VISITOR_PER_DAY = 12;
const MAX_TURNS_PER_CONVERSATION = 16;
const BUDGET_POOL = "guide-tokens";

interface Turn {
	role: "user" | "assistant";
	text: string;
}

function sseLine(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
	const apiKey = import.meta.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		return new Response(
			JSON.stringify({ error: "The guide isn't configured yet." }),
			{ status: 503, headers: { "Content-Type": "application/json" } },
		);
	}

	let body: { message?: string; history?: Turn[] };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "Bad request." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const message = (body.message ?? "").trim();
	const history = Array.isArray(body.history) ? body.history.slice(-MAX_TURNS_PER_CONVERSATION) : [];
	if (!message || message.length > 2000) {
		return new Response(JSON.stringify({ error: "Say a bit less, or a bit more." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const ip = clientIp(request, clientAddress ?? "unknown");
	if (rateLimited(ip, MAX_CONVERSATIONS_PER_VISITOR_PER_DAY)) {
		return new Response(
			JSON.stringify({ error: "That's a lot of conversation for one day — come back tomorrow, or use /act directly." }),
			{ status: 429, headers: { "Content-Type": "application/json" } },
		);
	}
	if (!budgetRemaining(BUDGET_POOL, DAILY_TOKEN_BUDGET)) {
		return new Response(
			JSON.stringify({ error: "The guide has done a lot of talking today. Try again tomorrow, or start with /act." }),
			{ status: 503, headers: { "Content-Type": "application/json" } },
		);
	}

	const client = new Anthropic({ apiKey });

	const messages: Anthropic.MessageParam[] = [
		...history.map((t) => ({
			role: t.role,
			content: String(t.text).slice(0, 4000),
		})),
		{ role: "user", content: message },
	];

	const stream = new ReadableStream({
		async start(controller) {
			const enc = new TextEncoder();
			const send = (event: string, data: unknown) => controller.enqueue(enc.encode(sseLine(event, data)));

			try {
				const anthropicStream = client.messages.stream({
					model: "claude-opus-5",
					max_tokens: MAX_TOKENS_PER_REPLY,
					system: SYSTEM_PROMPT,
					messages,
					tools: [
						{
							type: "web_search_20260209",
							name: "web_search",
							max_uses: 3,
						},
					],
				});

				anthropicStream.on("streamEvent", (event) => {
					if (
						event.type === "content_block_start" &&
						event.content_block.type === "server_tool_use"
					) {
						send("phase", { phase: "researching" });
					}
					if (
						event.type === "content_block_delta" &&
						event.delta.type === "text_delta"
					) {
						send("phase", { phase: "speaking" });
						send("text", { text: event.delta.text });
					}
				});

				const final = await anthropicStream.finalMessage();
				spend(BUDGET_POOL, (final.usage?.output_tokens ?? 0) + (final.usage?.input_tokens ?? 0));
				send("done", { stopReason: final.stop_reason });
			} catch (err) {
				console.error("guide: anthropic call failed", err);
				send("error", { message: "Something went wrong on our end — try again in a moment." });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
};
