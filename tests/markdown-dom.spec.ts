import { expect, test } from "@playwright/test";

// The guide renders untrusted model output — shaped by whatever a visitor
// typed and by web pages the model read — into a first-party origin. These
// cover both halves of that: it must render real markdown properly, and it
// must be structurally incapable of injecting markup.
//
// Driven through the real UI with a stubbed /api/guide stream rather than by
// importing the module, so this exercises the shipped bundle and the actual
// SSE → render path, not a version of the code that only exists in tests.

function sseFor(text: string): string {
	const chunks = [
		`event: phase\ndata: ${JSON.stringify({ phase: "speaking" })}\n\n`,
		`event: text\ndata: ${JSON.stringify({ text })}\n\n`,
		`event: trace\ndata: ${JSON.stringify({ searches: [] })}\n\n`,
		`event: done\ndata: ${JSON.stringify({ stopReason: "end_turn" })}\n\n`,
	];
	return chunks.join("");
}

async function replyWith(page: import("@playwright/test").Page, markdown: string) {
	await page.route("**/api/guide", (route) =>
		route.fulfill({
			status: 200,
			headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
			body: sseFor(markdown),
		}),
	);
	await page.goto("/guide");
	const input = page.locator("#guide-input");
	await expect(input).toBeEnabled({ timeout: 20_000 });
	await input.fill("render this");
	await page.locator("#guide-send").click();

	const reply = page.locator(".ae-guide-turn:not(.ae-guide-turn--you)").last();
	await expect(reply).toBeVisible();
	return reply;
}

test.describe("markdown rendering in replies", () => {
	test("renders headings, lists and emphasis as real elements", async ({ page }) => {
		const reply = await replyWith(page, "## Where to start\n\n- **Council** meetings\n- *County* board\n");
		await expect(reply.locator("h3")).toHaveText("Where to start");
		await expect(reply.locator("ul li")).toHaveCount(2);
		await expect(reply.locator("strong")).toHaveText("Council");
		await expect(reply.locator("em")).toHaveText("County");
		// The literal syntax must not survive as text.
		await expect(reply).not.toContainText("##");
	});

	test("links this site's own paths written as prose", async ({ page }) => {
		const reply = await replyWith(page, "Start with /toolkit/find-your-council and then /act today.");
		await expect(reply.locator('a[href="/toolkit/find-your-council"]')).toBeVisible();
		await expect(reply.locator('a[href="/act"]')).toBeVisible();
	});

	test("external links open in a new tab and carry rel protection", async ({ page }) => {
		const reply = await replyWith(page, "Found via https://www.sanmarcostx.gov/149/City-Council here.");
		const link = reply.locator('a[href*="sanmarcostx.gov"]');
		await expect(link).toHaveAttribute("target", "_blank");
		await expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	test("does not execute or emit raw HTML from model output", async ({ page }) => {
		const reply = await replyWith(
			page,
			'Hello <img src=x onerror="window.__pwned=1"> and <script>window.__pwned=1</script> done',
		);
		await expect(reply.locator("script")).toHaveCount(0);
		await expect(reply.locator("img")).toHaveCount(0);
		expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
	});

	test("drops javascript: links but keeps their text", async ({ page }) => {
		const reply = await replyWith(page, "[click me](javascript:alert(1))");
		await expect(reply).toContainText("click me");
		await expect(reply.locator('a[href^="javascript:"]')).toHaveCount(0);
	});

	test("leaves code spans alone rather than linkifying inside them", async ({ page }) => {
		const reply = await replyWith(page, "Use `/act` as a path, not a link.");
		await expect(reply.locator("code")).toHaveText("/act");
		await expect(reply.locator("code a")).toHaveCount(0);
	});
});
