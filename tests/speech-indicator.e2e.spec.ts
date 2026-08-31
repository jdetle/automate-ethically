import { expect, test } from "@playwright/test";

// "It says reading aloud but I don't hear anything."
//
// The pill appeared the moment a speech session was constructed — before a
// single byte of audio had been requested — and two exits from the send
// handler returned without ever settling that session, so its `done` never
// resolved and the pill stayed up permanently under a silent reply. The
// worst case was the one a visitor is most likely to hit: session
// verification fails, the reply bubble says "couldn't verify you're human",
// and underneath it sits "Reading aloud — stop", reading nothing.
//
// Speech is meant to fail quietly — the reply is already on screen, which is
// the part that matters. Failing quietly and claiming to speak are different
// things, and only the first one is acceptable.

const SSE = [
	`event: phase\ndata: ${JSON.stringify({ phase: "speaking" })}\n\n`,
	`event: text\ndata: ${JSON.stringify({ text: "Start at your city council. They meet monthly." })}\n\n`,
	`event: done\ndata: ${JSON.stringify({ stopReason: "end_turn" })}\n\n`,
].join("");

/** Turn voice on, which is also the user gesture that unlocks audio. */
async function enableVoice(page: import("@playwright/test").Page) {
	const voice = page.locator("#guide-voice");
	if ((await voice.count()) === 0) return false;
	if (await voice.isHidden()) return false;
	await voice.click();
	return true;
}

async function send(page: import("@playwright/test").Page, message: string) {
	const input = page.locator("#guide-input");
	await expect(input).toBeEnabled({ timeout: 20_000 });
	await enableVoice(page);
	await input.fill(message);
	await page.locator("#guide-send").click();
}

test.describe("the reading-aloud indicator tells the truth", () => {
	test("stays hidden when speech is unavailable", async ({ page }) => {
		// /api/speech answers 503 when no key is configured; nothing can play.
		await page.route("**/api/speech", (route) =>
			route.fulfill({ status: 503, body: JSON.stringify({ configured: false }) }),
		);
		await page.route("**/api/guide", (route) =>
			route.fulfill({
				status: 200,
				headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
				body: SSE,
			}),
		);

		await page.goto("/guide");
		await send(page, "where do I start?");

		const reply = page.locator(".ae-guide-turn:not(.ae-guide-turn--you)").last();
		await expect(reply).toContainText("city council");

		// Give the old code every chance to show the pill it used to show
		// immediately on session construction.
		await page.waitForTimeout(1500);
		await expect(page.locator(".ae-guide-turn-speaking:visible")).toHaveCount(0);
	});

	test("stays hidden when the session can't be re-verified mid-conversation", async ({ page }) => {
		// The exact bubble from the report. It is reached by a session lapsing
		// rather than by a cold failure: the page verifies normally at load
		// (otherwise the composer never unlocks), then /api/guide answers 403,
		// the client drops its token and re-verifies — and that re-verify is
		// what fails. No reply, no audio, and previously a "Reading aloud"
		// pill sitting under the apology.
		await page.route("**/api/speech", (route) =>
			route.fulfill({ status: 503, body: JSON.stringify({ configured: false }) }),
		);
		await page.route("**/api/guide", (route) => route.fulfill({ status: 403, body: "{}" }));

		await page.goto("/guide");
		await expect(page.locator("#guide-input")).toBeEnabled({ timeout: 20_000 });
		await enableVoice(page);

		// Only now does verification start failing.
		await page.route("**/api/session", (route) => route.fulfill({ status: 403, body: "{}" }));

		await page.locator("#guide-input").fill("where do I start?");
		await page.locator("#guide-send").click();

		const reply = page.locator(".ae-guide-turn:not(.ae-guide-turn--you)").last();
		await expect(reply).toContainText(/couldn't verify|couldn't reach/i);

		await page.waitForTimeout(1500);
		await expect(page.locator(".ae-guide-turn-speaking:visible")).toHaveCount(0);
	});

	test("stays hidden when the guide can't be reached at all", async ({ page }) => {
		await page.route("**/api/guide", (route) => route.abort());
		await page.route("**/api/speech", (route) =>
			route.fulfill({ status: 503, body: JSON.stringify({ configured: false }) }),
		);

		await page.goto("/guide");
		await send(page, "where do I start?");

		const reply = page.locator(".ae-guide-turn:not(.ae-guide-turn--you)").last();
		await expect(reply).toContainText(/couldn't reach|couldn't verify/i);

		await page.waitForTimeout(1500);
		await expect(page.locator(".ae-guide-turn-speaking:visible")).toHaveCount(0);
	});
});
