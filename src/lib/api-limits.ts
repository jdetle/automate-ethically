// Shared cost/abuse controls for the two /api/guide* routes. In-memory,
// per-process — resets on restart or above one replica. A real limitation,
// documented in README, not a hidden one; a shared store (e.g. the s10
// Postgres instance) is the natural upgrade if traffic ever makes the
// single-replica assumption wrong.

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/** One counter per named pool (e.g. "guide-tokens", "speech-characters"). */
const budgets = new Map<string, { day: string; spent: number }>();

export function budgetRemaining(pool: string, dailyLimit: number): boolean {
	const d = today();
	const entry = budgets.get(pool);
	if (!entry || entry.day !== d) {
		budgets.set(pool, { day: d, spent: 0 });
		return dailyLimit > 0;
	}
	return entry.spent < dailyLimit;
}

export function spend(pool: string, amount: number): void {
	const d = today();
	const entry = budgets.get(pool);
	if (!entry || entry.day !== d) {
		budgets.set(pool, { day: d, spent: amount });
		return;
	}
	entry.spent += amount;
}

/** Per-visitor daily count, keyed by IP. Used by /api/guide only — /api/speech
 * is always downstream of a guide turn, so gating guide already gates speech
 * indirectly; speech still keeps its own character budget above for defense
 * in depth against someone calling it directly. */
const conversationCounts = new Map<string, { day: string; count: number }>();

export function rateLimited(ip: string, maxPerDay: number): boolean {
	const d = today();
	const entry = conversationCounts.get(ip);
	if (!entry || entry.day !== d) {
		conversationCounts.set(ip, { day: d, count: 1 });
		return false;
	}
	entry.count += 1;
	return entry.count > maxPerDay;
}

export function clientIp(request: Request, fallback: string): string {
	const xff = request.headers.get("x-forwarded-for");
	if (xff) return (xff.split(",")[0] ?? fallback).trim();
	return fallback;
}

/**
 * Verifies a Cloudflare Turnstile token server-side. Both API routes that
 * spend real money (guide.ts, speech.ts) gate on this — and gate *closed*:
 * if TURNSTILE_SECRET_KEY isn't set, callers must treat that as "refuse the
 * request," not "skip the check." Rate limits and IP-based caps only slow
 * down a scripted abuser; a passed human-verification challenge is the
 * actual bar this site wants in front of anything that costs money per call.
 */
export async function verifyTurnstile(
	token: string | undefined,
	secretKey: string,
	remoteIp: string,
): Promise<boolean> {
	if (!token) return false;
	try {
		const params = new URLSearchParams({
			secret: secretKey,
			response: token,
			remoteip: remoteIp,
		});
		const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: params,
		});
		if (!res.ok) return false;
		const data = (await res.json()) as { success?: boolean };
		return data.success === true;
	} catch (err) {
		console.error("turnstile: verification request failed", err);
		return false;
	}
}
