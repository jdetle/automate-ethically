import { expect, test } from "@playwright/test";

// The social cards were regenerated for the v2 redesign without any filename
// changing, so Meta went on serving the bitmap it had cached and a shared
// link still showed the old design. The og:image URL now carries the card's
// content hash, which makes a regenerated card a URL nobody has cached.

const PAGES = ["/", "/act", "/guide", "/about", "/toolkit", "/states", "/facts"];

test.describe("social cards", () => {
	for (const path of PAGES) {
		test(`${path} points at a versioned card that exists`, async ({ page, request }) => {
			await page.goto(path);

			const content = await page.locator('meta[property="og:image"]').getAttribute("content");
			expect(content, `${path} has no og:image`).toBeTruthy();

			const url = new URL(content as string);
			// Without this, a regenerated card is invisible to anything that
			// cached the old one.
			expect(url.searchParams.get("v"), `${path} og:image is not versioned`).toMatch(
				/^[0-9a-f]{10}$/,
			);

			const res = await request.get(url.pathname);
			expect(res.status(), `${url.pathname} does not resolve`).toBe(200);
			expect(res.headers()["content-type"]).toContain("image/png");
		});
	}

	test("the plain filename still resolves, for anyone linking straight to it", async ({
		request,
	}) => {
		const res = await request.get("/og/default.png");
		expect(res.status()).toBe(200);
	});
});
