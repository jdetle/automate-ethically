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

		if (hasRealKey) {
			// The actual regression this test exists to catch: a real key
			// configured end to end must produce a real, non-empty reply, not
			// a silent failure dressed up as success.
			expect(replyText.length).toBeGreaterThan(0);
			expect(replyText).not.toMatch(/Couldn't verify|isn't configured|Something went wrong/);
		} else {
			// No real key in this run (the common case — CI never holds one):
			// still demand a clean, worded failure rather than a blank bubble
			// or a raw error the visitor can't do anything with.
			expect(replyText.length).toBeGreaterThan(0);
		}

		expect(consoleErrors, `Unexpected browser console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
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
