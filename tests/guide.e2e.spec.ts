import { expect, test } from "@playwright/test";

// Regression test for a real production incident: a visitor reported "no
// good responses from the guide, nothing related to turnstile." Root cause
// was two-fold — a client-side UX bug (Turnstile rendered lazily, so a
// person could type a whole message before any verification UI existed),
// found and fixed by manual testing; and, worse, that manual testing was
// done by driving a real Chrome browser through the *real* production
// Turnstile widget, which almost certainly poisoned that widget's risk
// score for real visitors sharing the same browser/network. This suite is
// the fix for both: it runs against Cloudflare's official test keys (see
// scripts/e2e-server.sh), so it can never touch or damage the real widget's
// reputation again, and it asserts the specific UI states the incident
// showed were broken.

test.describe("/guide — verify-then-chat flow", () => {
	test("input starts disabled, unlocks after Turnstile clears, and sending a message never hangs", async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		page.on("console", (msg) => {
			// The s10 telemetry beacon has no proxy in this bare-Node test
			// setup (only nginx.conf.template provides /telemetry/, which
			// isn't part of this harness) — a 404 here is expected noise,
			// unrelated to anything this test checks.
			if (msg.type() === "error" && !msg.text().includes("404")) consoleErrors.push(msg.text());
		});
		page.on("pageerror", (err) => consoleErrors.push(String(err)));

		await page.goto("/guide");

		const input = page.locator("#guide-input");
		const sendBtn = page.locator("#guide-send");
		const status = page.locator("#guide-status");

		// The exact bug: the old flow left this enabled from page load, so a
		// person could type — and hit Send — before Turnstile had rendered at
		// all, with nothing on screen explaining why nothing then happened.
		await expect(input).toBeDisabled();
		await expect(sendBtn).toBeDisabled();
		await expect(input).toHaveAttribute("placeholder", "Verifying you're human…");
		await expect(status).toHaveText("Verifying you're human…");

		// Cloudflare's test sitekey always passes, but it's still a real round
		// trip to challenges.cloudflare.com — give it a real window.
		await expect(input).toBeEnabled({ timeout: 20_000 });
		await expect(sendBtn).toBeEnabled();
		await expect(status).toHaveText("Ready when you are.");
		await expect(input).toHaveAttribute("placeholder", "Your town, what you're good at, or just say hi");

		await input.fill("hi, I'm testing the guide");
		await sendBtn.click();

		await expect(page.locator(".ae-guide-turn--you", { hasText: "hi, I'm testing the guide" })).toBeVisible();

		// Whatever the model does next — a real reply, or a clean failure
		// because this run has no real ANTHROPIC_API_KEY — the UI must
		// recover within a bounded time. A hang here, with the send button
		// stuck disabled and the status stuck on "Thinking…", was exactly
		// what "no good responses" looked like from a visitor's side.
		await expect(sendBtn).toBeEnabled({ timeout: 30_000 });
		await expect(status).toHaveText("Ready when you are.", { timeout: 30_000 });

		const hasRealKey = Boolean(process.env.ANTHROPIC_API_KEY) && process.env.ANTHROPIC_API_KEY !== "test-fake-key";
		const replyLocator = page.locator(".ae-guide-turn:not(.ae-guide-turn--you) p").last();
		const replyText = (await replyLocator.textContent())?.trim() ?? "";

		// This assertion holds with or without a real model key, and it is the
		// one that matters most. The *send* path mints its own second token,
		// separate from the page-load check above — a bug there fails only on
		// the second call, so the page looks fully verified ("Ready when you
		// are.", input enabled) right up until the first message is sent and
		// comes back "Couldn't verify you're human." That is exactly the
		// production report this suite was written for, and an earlier version
		// of this test missed it by accepting any non-empty reply.
		//
		// The test secret key (1x0000…AA) always passes server-side
		// verification, so a Turnstile error here is never Cloudflare's
		// verdict — it can only be this page's own token handling.
		expect(replyText.length).toBeGreaterThan(0);
		expect(replyText).not.toMatch(/Couldn't verify|Verification failed/);

		if (hasRealKey) {
			// The full end-to-end assertion: a real key must produce a real
			// reply, not a silent failure dressed up as success.
			expect(replyText).not.toMatch(/isn't configured|Something went wrong/);
		}

		expect(consoleErrors, `Unexpected browser console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
	});

	test("the widget is visible whenever a token is being minted, including on send", async ({ page }) => {
		// The production bug this catches: #guide-turnstile lives inside
		// #guide-verify, which the page-load check hides once it clears. Every
		// later token request (each send mints its own) then ran against a
		// widget sealed inside a `hidden` ancestor — fine for an invisible
		// always-pass key, fatal for a real "managed" widget that may need to
		// show a checkbox. The visitor saw "Ready when you are.", typed, sent,
		// and got "Couldn't verify you're human" from a challenge that had
		// nowhere to render.
		//
		await page.goto("/guide");

		const input = page.locator("#guide-input");
		const verifyWrap = page.locator("#guide-verify");

		// Let the page-load check finish normally. The old code hid the
		// wrapper permanently at this point.
		await expect(input).toBeEnabled({ timeout: 20_000 });
		await expect(verifyWrap).toBeHidden();

		// Make the *next* token request hang instead of resolving, so the
		// in-flight state is observable rather than a race. A real managed
		// widget waiting on a human to click its checkbox is in exactly this
		// state — pending, and useless unless it is on screen.
		await page.evaluate(() => {
			const w = window as unknown as { turnstile?: { execute: (id: string) => void } };
			if (w.turnstile) w.turnstile.execute = () => {};
		});

		await input.fill("hi");
		await page.locator("#guide-send").click();

		// The regression: this must be visible while the send's token request
		// is outstanding, or a challenge that needs a click can never get one.
		await expect(verifyWrap).toBeVisible({ timeout: 10_000 });
	});

	test("a Turnstile failure is shown as a fail-closed message, never a silent hang", async ({ page }) => {
		// Blocks Cloudflare's script entirely, so window.turnstile never
		// exists — the same end state as a real error/expired-callback firing
		// on the very first check. Verifies the fail-closed contract: the
		// gate must show an explicit failure and keep the input locked, never
		// leave it stuck on "Verifying…" forever or, worse, fail open.
		await page.route("https://challenges.cloudflare.com/**", (route) => route.abort());

		await page.goto("/guide");

		const input = page.locator("#guide-input");
		const status = page.locator("#guide-status");

		await expect(status).toHaveText("Couldn't verify you're human — reload the page to try again.", {
			timeout: 10_000,
		});
		await expect(input).toBeDisabled();
	});
});
