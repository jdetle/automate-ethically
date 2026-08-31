import { expect, test } from "@playwright/test";

// The conversation UI is built in JavaScript — chips, turns, traces, the
// working indicator. JS-created nodes never receive Astro's data-astro-cid-*
// attribute, so a *scoped* <style> block in guide.astro matched none of them
// and the whole transcript rendered as unstyled browser defaults: grey system
// buttons, Arial, square corners. The page looked broken while every
// behavioural test still passed, which is exactly why this asserts on
// computed style rather than on markup.

test.describe("/guide styling reaches JS-created elements", () => {
	test("suggestion chips are styled, not raw buttons", async ({ page }) => {
		await page.goto("/guide");

		const chip = page.locator(".ae-guide-chip").first();
		await expect(chip).toBeVisible();

		const style = await chip.evaluate((el) => {
			const cs = getComputedStyle(el);
			return {
				radius: cs.borderTopLeftRadius,
				font: cs.fontFamily,
				background: cs.backgroundColor,
			};
		});

		// A raw <button> is square, system-font, and button-face grey.
		expect(style.radius).not.toBe("0px");
		expect(style.font).toContain("DM Sans");
		expect(style.background).not.toBe("rgb(107, 107, 107)");
	});

	test("the message box is a real field, sized to be typed into", async ({ page }) => {
		await page.goto("/guide");
		const box = page.locator(".ae-guide-input");
		await expect(box).toBeVisible();

		const rect = await box.boundingBox();
		expect(rect?.height ?? 0).toBeGreaterThanOrEqual(100);

		// On dark, a box painted the same colour as the page reads as a hole.
		const [boxBg, pageBg] = await page.evaluate(() => [
			getComputedStyle(document.querySelector(".ae-guide-input") as Element).backgroundColor,
			getComputedStyle(document.body).backgroundColor,
		]);
		expect(boxBg).not.toBe(pageBg);
	});

	test("the orb sits beside the headline on desktop and below it on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/guide");
		const orb = page.locator(".ae-orb");
		await expect(orb).toBeVisible();

		const wide = await page.evaluate(() => {
			const o = document.querySelector(".ae-orb")!.getBoundingClientRect();
			const h1 = document.querySelector("#guide-title")!.getBoundingClientRect();
			return { orbLeft: o.left, headingRight: h1.right, orbTop: o.top, headingTop: h1.top };
		});
		expect(wide.orbLeft).toBeGreaterThan(wide.headingRight);
		expect(Math.abs(wide.orbTop - wide.headingTop)).toBeLessThan(200);

		await page.setViewportSize({ width: 600, height: 900 });
		const narrow = await page.evaluate(() => {
			const o = document.querySelector(".ae-orb")!.getBoundingClientRect();
			const h1 = document.querySelector("#guide-title")!.getBoundingClientRect();
			return { orbTop: o.top, headingBottom: h1.bottom };
		});
		expect(narrow.orbTop).toBeGreaterThan(narrow.headingBottom);
	});
});
