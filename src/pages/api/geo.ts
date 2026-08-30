import type { APIRoute } from "astro";
import { clientIp } from "../../lib/api-limits";
import { initSentry } from "../../lib/sentry";

export const prerender = false;

initSentry();

/**
 * A rough, disclosed, throwaway location guess — for seeding /guide's
 * suggested-prompt chips, nothing else.
 *
 * Same technique as rust-blog's /who-are-you and /api/edge-detect: resolve
 * the visitor's IP from forwarded headers, then one lookup against ipapi.co
 * (public, keyless, no account needed — the same API rust-blog already
 * calls). Deliberately narrower than rust-blog's version: no lat/long, no
 * ISP, no VPN-detection heuristics, no "Origin Intelligence" — just enough
 * to say a city and region back to the visitor.
 *
 * Never stored. Not logged. Not sent to s10 or anywhere else. Cached
 * in-memory for a few minutes so a page reload doesn't re-hit ipapi.co, but
 * that cache holds an IP -> city mapping only in RAM, never on disk, and
 * evicts itself — it's a courtesy to ipapi.co's free tier, not a record of
 * who visited. The client always shows this as a guess with one click to
 * correct it (see guide.astro) — the site's whole argument is that a
 * guess presented as fact is the problem, so this one never is.
 */

interface GeoResult {
	city?: string;
	region?: string;
	country?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { result: GeoResult; expires: number }>();

async function lookup(ip: string): Promise<GeoResult> {
	const cached = cache.get(ip);
	if (cached && cached.expires > Date.now()) return cached.result;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3000);
	try {
		const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
			signal: controller.signal,
			headers: { "User-Agent": "automate-ethically.com (guide location guess)" },
		});
		if (!res.ok) return {};
		const data = (await res.json()) as {
			city?: string;
			region?: string;
			country_name?: string;
			error?: boolean;
		};
		if (data.error) return {};
		const result: GeoResult = { city: data.city, region: data.region, country: data.country_name };
		cache.set(ip, { result, expires: Date.now() + CACHE_TTL_MS });
		// Bound the cache — this is a courtesy TTL cache, not a store; it
		// should never grow into something that looks like a visitor log.
		if (cache.size > 500) {
			const oldestKey = cache.keys().next().value;
			if (oldestKey) cache.delete(oldestKey);
		}
		return result;
	} catch {
		// Deliberately not reported to Sentry: a timeout or rate limit against
		// a free third-party API is an expected, already-handled outcome (the
		// UI falls back to generic phrasing), not a bug to alert on. initSentry()
		// above still means a genuinely unexpected crash here is caught by the
		// process-level handlers in lib/sentry.ts.
		return {};
	} finally {
		clearTimeout(timeout);
	}
}

export const GET: APIRoute = async ({ request, clientAddress }) => {
	const ip = clientIp(request, clientAddress ?? "");
	// Private/local addresses (dev, or a misconfigured proxy hop) can't be
	// geolocated — fail quietly rather than sending a useless lookup.
	if (!ip || /^(127\.|10\.|192\.168\.|::1)/.test(ip)) {
		return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } });
	}
	const result = await lookup(ip);
	return new Response(JSON.stringify(result), {
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
};
