// Short-lived proof that a visitor already cleared Turnstile.
//
// Why this exists: the guide used to mint a fresh Turnstile token for every
// single API call — one per message sent, plus another for every
// text-to-speech call. Cloudflare's managed widget treats that repetition as
// exactly what it looks like (a script hammering the endpoint) and escalates
// to interactive challenges, so a real person got a checkbox in front of
// every message and the conversation never got anywhere. Turnstile is built
// around one token per human action, not one per HTTP request.
//
// So: verify once, then carry a signed token that says "this browser cleared
// a challenge at time T." The security bar is unchanged — nothing reaches a
// paid API without a real Turnstile pass first — but a visitor is challenged
// once per session instead of once per sentence.
//
// The token is an HMAC over its own expiry, so it is unforgeable without the
// server secret and self-expiring. Deliberately NOT bound to the client IP:
// phones move between cells and Wi-Fi mid-conversation, and an IP-bound
// token would log those people out at random. The per-IP rate limits and
// daily budgets in api-limits.ts are what bound abuse; this only proves a
// human was here recently.
import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Derives a distinct signing key from the Turnstile secret rather than using
 * it directly — one secret, two purposes, but never the same bytes for both.
 */
function signingKey(secret: string): Buffer {
	return createHmac("sha256", "automate-ethically:guide-session:v1").update(secret).digest();
}

export function createSessionToken(secret: string): { token: string; expiresAt: number } {
	const expiresAt = Date.now() + SESSION_TTL_MS;
	const sig = createHmac("sha256", signingKey(secret)).update(String(expiresAt)).digest("base64url");
	return { token: `${expiresAt}.${sig}`, expiresAt };
}

export function verifySessionToken(token: string | undefined, secret: string): boolean {
	if (!token) return false;
	const dot = token.indexOf(".");
	if (dot <= 0) return false;

	const expPart = token.slice(0, dot);
	const sigPart = token.slice(dot + 1);
	const expiresAt = Number(expPart);
	if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

	const expected = createHmac("sha256", signingKey(secret)).update(expPart).digest("base64url");
	const given = Buffer.from(sigPart);
	const want = Buffer.from(expected);
	// Length check first: timingSafeEqual throws on a length mismatch.
	if (given.length !== want.length) return false;
	return timingSafeEqual(given, want);
}
