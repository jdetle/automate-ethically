// Pageview beacon, plus a named-event hook for the guide — no persistent
// identifier, no DOM capture, no third-party origin. Envelopes go to our own
// /telemetry/ path, which nginx forwards to our own s10 tenant. See README's
// Analytics section and /privacy, which lists every field by name.
//
// This file carries no credential on purpose: anything handed to a browser is
// world-readable, so nginx attaches the ingest key server-side on the way out
// (nginx.conf.template). It lives in public/ as a plain same-origin file
// rather than an inline element so the CSP can refuse inline script outright
// — Astro inlines small bundled scripts, which would have forced
// 'unsafe-inline' back into script-src and undone the point of having a CSP.
//
// The envelope shape is s10's `SignalEnvelope` (schema `s10/2`), not a shape
// of our own invention. The first version of this file posted
// `{kind: "pageview", tenant, path, …}`, which s10 rejects outright — `page`
// is a kind, `pageview` is not, and `signal_id`/`occurred_at` are required.
// Every envelope this site ever sent was refused with a parse error, and
// because analytics is fire-and-forget nothing anywhere said so. Anything
// added here must be checked against services/s10/s10-schema/src/envelope.rs.
(() => {
	const ENDPOINT = "/telemetry/v2/envelopes";
	const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

	/**
	 * A ULID for `signal_id`, which s10 requires and uses as its idempotency
	 * key — a retried or duplicated envelope collapses to one row instead of
	 * being counted twice.
	 *
	 * It identifies the *message*, not the sender: a fresh one is minted per
	 * envelope, nothing is stored, and two envelopes from the same visitor
	 * share nothing that could join them back together.
	 */
	function signalId() {
		let ts = Date.now();
		let out = "";
		for (let i = 0; i < 10; i++) {
			out = CROCKFORD[ts % 32] + out;
			ts = Math.floor(ts / 32);
		}
		const rand = new Uint8Array(16);
		if (globalThis.crypto?.getRandomValues) {
			crypto.getRandomValues(rand);
		} else {
			for (let i = 0; i < 16; i++) rand[i] = Math.floor(Math.random() * 256);
		}
		for (let i = 0; i < 16; i++) out += CROCKFORD[rand[i] % 32];
		return out;
	}

	function send(fields) {
		try {
			const envelope = {
				schema_version: "s10/2",
				signal_id: signalId(),
				occurred_at: new Date().toISOString(),
				...fields,
			};
			fetch(ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/x-ndjson" },
				body: `${JSON.stringify(envelope)}\n`,
				keepalive: true,
			}).catch(() => {});
		} catch {
			// analytics must never break the page
		}
	}

	const deviceType = () =>
		innerWidth < 480 ? "mobile" : innerWidth < 1024 ? "tablet" : "desktop";

	/**
	 * One named event, for behaviour the server cannot see.
	 *
	 * This exists because of a specific failure: the guide's spoken replies
	 * were reported broken, and the only evidence available was the nginx
	 * access log, which can say "no audio was ever requested" but not whether
	 * anyone asked for any. Four fixes were shipped on inference. The
	 * attributes here are deliberately a closed set of our own short strings —
	 * never a message, a reply, a URL, or anything typed.
	 */
	globalThis.aeSignal = (name, attributes) =>
		send({
			kind: "event",
			name,
			category: "guide",
			attributes: attributes || {},
			context: { pathname: location.pathname },
		});

	send({
		kind: "page",
		name: location.pathname,
		context: {
			pathname: location.pathname,
			referrer: document.referrer || undefined,
			device_type: deviceType(),
		},
	});
})();
