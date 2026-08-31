import { expect, test } from "@playwright/test";

/**
 * The `hidden` attribute only hides an element while nothing gives it a
 * `display`. The UA stylesheet's `[hidden] { display: none }` is a plain
 * one-class rule, so any author rule that sets `display` on the same element
 * silently outranks it and the element stays on screen.
 *
 * This has now caused three separate user-visible bugs on /guide:
 *
 *  - the "Reading aloud" pill appeared under every reply, including error
 *    bubbles where nothing was ever spoken;
 *  - the voice button painted before its click listener existed, so pressing
 *    it did nothing at all and audio was never requested;
 *  - and it would have hit the location editor too, had that not been
 *    guarded by hand.
 *
 * Rather than remembering to add a `[hidden]` guard each time, this walks
 * every element the page ships with the attribute and asserts the browser
 * actually hides it. A new control with a `display` fails here immediately.
 */

const PAGES = ["/guide", "/", "/act", "/search"];

for (const path of PAGES) {
	test(`every hidden element on ${path} is really hidden`, async ({ page }) => {
		await page.goto(path);

		const offenders = await page.evaluate(() => {
			const bad: { tag: string; id: string; cls: string; display: string }[] = [];
			for (const el of Array.from(document.querySelectorAll("[hidden]"))) {
				const display = getComputedStyle(el).display;
				if (display !== "none") {
					bad.push({
						tag: el.tagName.toLowerCase(),
						id: el.id,
						cls: typeof el.className === "string" ? el.className : "",
						display,
					});
				}
			}
			return bad;
		});

		expect(
			offenders,
			`these carry [hidden] but are still displayed; give each a \`.selector[hidden] { display: none }\` guard:\n${JSON.stringify(offenders, null, 2)}`,
		).toEqual([]);
	});
}

test("the voice control is never on screen before it works", async ({ page }) => {
	// Hold the probe open, which is the window the bug lived in.
	await page.route("**/api/speech", async (route) => {
		if (route.request().method() === "GET") {
			await new Promise((r) => setTimeout(r, 2000));
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: '{"configured":true}',
			});
		}
		return route.fulfill({
			status: 200,
			headers: { "Content-Type": "audio/L16;rate=24000;channels=1" },
			body: Buffer.alloc(24_000 * 2),
		});
	});

	await page.goto("/guide");
	await page.waitForTimeout(600);

	// Either hidden, or already working. Visible-and-inert is the failure.
	const voice = page.locator("#guide-voice");
	if (await voice.isVisible()) {
		await voice.click();
		await expect(
			voice,
			"the button was on screen and pressing it did nothing",
		).toHaveAttribute("aria-pressed", "true");
	}

	// Once the probe lands it must be usable.
	await expect(voice).toBeVisible({ timeout: 15_000 });
	if ((await voice.getAttribute("aria-pressed")) === "false") await voice.click();
	await expect(voice).toHaveAttribute("aria-pressed", "true");
});
