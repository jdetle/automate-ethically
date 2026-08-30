// Server-side error tracking for the three API routes (guide, speech,
// geo) — @sentry/node directly, not the @sentry/astro integration.
//
// @sentry/astro's integration auto-injects a browser SDK into every page's
// client bundle, which would break this site's zero-JS-by-default policy
// site-wide (README's JS policy) just to get server-side coverage of three
// small routes. Sentry.init() here runs only in the Node process — nothing
// ships to any browser, on /guide or anywhere else.
//
// Optional and fails silent, like the rest of this site's third-party keys:
// no SENTRY_DSN means no reporting, not a broken route. Privacy defaults
// match rust-blog's own Rust-side posture (its more conservative half, not
// its browser-replay exception, which doesn't apply here — there's no UI
// on these routes to replay): 0% trace sampling and no default PII unless
// explicitly turned up via env vars.
import * as Sentry from "@sentry/node";
import { readSecret } from "./env";

let initialized = false;

export function initSentry(): void {
	if (initialized) return;
	initialized = true;

	// process.env, not import.meta.env — see guide.ts's Turnstile check for
	// why: a non-PUBLIC_ import.meta.env.X read gets statically inlined at
	// build time in this adapter's server bundle, so a DSN set only at
	// container runtime would never be seen.
	const dsn = readSecret("SENTRY_DSN");
	if (!dsn) return;

	Sentry.init({
		dsn,
		environment: readSecret("SENTRY_ENVIRONMENT") || "production",
		tracesSampleRate: Number(readSecret("SENTRY_TRACES_SAMPLE_RATE") || "0"),
		sendDefaultPii: false,
	});

	// Broader net than the three routes' own try/catches: a genuinely
	// uncaught error anywhere in the Node process still gets reported
	// instead of just crashing the replica silently.
	process.on("unhandledRejection", (reason) => {
		Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
	});
	process.on("uncaughtException", (err) => {
		Sentry.captureException(err);
	});
}

export { Sentry };
