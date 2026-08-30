// Pageview beacon only — no persistent identifier, no DOM capture, no
// third-party origin. One envelope per pageview to our own /telemetry/ path,
// which nginx forwards to our own s10 tenant. See README's Analytics section.
//
// This file carries no credential on purpose: anything handed to a browser is
// world-readable, so nginx attaches the ingest key server-side on the way out
// (nginx.conf.template). It lives in public/ as a plain same-origin file
// rather than an inline element so the CSP can refuse inline script outright
// — Astro inlines small bundled scripts, which would have forced
// 'unsafe-inline' back into script-src and undone the point of having a CSP.
(() => {
	try {
		const envelope = {
			kind: "pageview",
			tenant: "automate-ethically",
			path: location.pathname,
			referrer: document.referrer || null,
			screen_bucket:
				innerWidth < 480 ? "mobile" : innerWidth < 1024 ? "tablet" : "desktop",
		};
		fetch("/telemetry/v2/envelopes", {
			method: "POST",
			headers: { "Content-Type": "application/x-ndjson" },
			body: `${JSON.stringify(envelope)}\n`,
			keepalive: true,
		}).catch(() => {});
	} catch {
		// analytics must never break the page
	}
})();
