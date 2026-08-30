// Blanket server-side error coverage for every on-demand route (guide,
// speech, geo — the only three that ever run this Node process at request
// time; every other page is static and served directly by nginx, never
// touching this file). The three routes already have their own targeted
// try/catch around the specific calls likely to fail (Anthropic, OpenAI,
// Turnstile) — this middleware exists for everything else: a bug in request
// parsing, a bad assumption in shared code, an Astro-internal render error.
// Without it, that class of error would just become a generic 500 with zero
// Sentry visibility, since it never reaches any of the routes' own catch
// blocks.
import { defineMiddleware } from "astro:middleware";
import { initSentry, Sentry } from "./lib/sentry";

initSentry();

export const onRequest = defineMiddleware(async (_context, next) => {
	try {
		return await next();
	} catch (err) {
		Sentry.captureException(err);
		throw err;
	}
});
