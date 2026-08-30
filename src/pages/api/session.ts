import type { APIRoute } from "astro";
import { clientIp, verifyTurnstile } from "../../lib/api-limits";
import { readSecret } from "../../lib/env";
import { createSessionToken } from "../../lib/guide-session";
import { initSentry } from "../../lib/sentry";

export const prerender = false;

initSentry();

/**
 * Trades one real Turnstile token for a short-lived session token.
 *
 * This is the only place a Turnstile token is redeemed. /api/guide and
 * /api/speech accept the session token it returns, so a visitor clears one
 * challenge per session rather than one per message — see lib/guide-session.ts
 * for why the old per-request design made the guide unusable.
 *
 * Fails closed exactly like the routes it protects: no configured secret
 * means no session, which means neither paid route will run.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
	const secret = readSecret("TURNSTILE_SECRET_KEY");
	if (!secret) {
		return new Response(JSON.stringify({ error: "Human verification isn't configured yet." }), {
			status: 503,
			headers: { "Content-Type": "application/json" },
		});
	}

	let body: { turnstileToken?: string };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: "Bad request." }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const ip = clientIp(request, clientAddress ?? "unknown");
	if (!(await verifyTurnstile(body.turnstileToken, secret, ip))) {
		return new Response(JSON.stringify({ error: "Verification failed — reload the page and try again." }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}

	const { token, expiresAt } = createSessionToken(secret);
	return new Response(JSON.stringify({ sessionToken: token, expiresAt }), {
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
};
