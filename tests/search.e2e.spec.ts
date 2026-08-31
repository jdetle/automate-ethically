import { expect, test } from "@playwright/test";

// Search is the one page that cannot work without JavaScript and without a
// Pagefind index built by `astro build`. It broke silently — the index 404'd
// and the page rendered an empty box with no explanation — so these cover
// both halves: it really searches when the index is there, and it says
// something useful when it isn't.

test.describe("/search", () => {
	test("indexes the site and returns real results", async ({ page }) => {
		await page.goto("/search");

		const input = page.locator("input.pagefind-ui__search-input");
		await expect(input).toBeVisible();

		await input.fill("ordinance");
		await expect(page.locator(".pagefind-ui__result").first()).toBeVisible();

		const results = page.locator(".pagefind-ui__result");
		expect(await results.count()).toBeGreaterThan(0);

		// A result has to actually go somewhere on this site.
		const href = await results.first().locator("a").first().getAttribute("href");
		expect(href).toBeTruthy();
		const res = await page.request.get(href as string);
		expect(res.status()).toBe(200);
	});

	test("finds content from a toolkit page, not just the top-level routes", async ({ page }) => {
		await page.goto("/search");
		await page.locator("input.pagefind-ui__search-input").fill("council");
		await expect(page.locator(".pagefind-ui__result").first()).toBeVisible();
		await expect(page.locator(".pagefind-ui__results")).toContainText(/council/i);
	});

	test("drops the fallback list once search has really mounted", async ({ page }) => {
		await page.goto("/search");
		await expect(page.locator("input.pagefind-ui__search-input")).toBeVisible();
		await expect(page.locator("#search-fallback")).toHaveCount(0);
	});

	test("keeps the fallback list when the index is unavailable", async ({ page }) => {
		// The exact failure that made search look broken: /pagefind 404s.
		await page.route("**/pagefind/**", (route) => route.fulfill({ status: 404, body: "" }));
		await page.goto("/search");

		const fallback = page.locator("#search-fallback");
		await expect(fallback).toBeVisible();

		// And it is a way out, not an apology: every link resolves.
		const links = fallback.locator("a");
		const count = await links.count();
		expect(count).toBeGreaterThan(5);
		for (let i = 0; i < count; i++) {
			const href = await links.nth(i).getAttribute("href");
			const res = await page.request.get(href as string);
			expect(res.status(), `${href} is listed on /search but does not resolve`).toBe(200);
		}
	});

	test("ships the fallback list in the HTML, so it survives no JavaScript", async ({ request }) => {
		const html = await (await request.get("/search")).text();
		expect(html).toContain('id="search-fallback"');
		expect(html).toContain('href="/toolkit/one-pager"');
	});
});
