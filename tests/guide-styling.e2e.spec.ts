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
		expect(rect?.height ?? 0).toBeGreaterThanOrEqual(160);

		// On dark, a box painted the same colour as the page reads as a hole.
		const [boxBg, pageBg] = await page.evaluate(() => {
			const box = document.querySelector(".ae-guide-input");
			if (!box) throw new Error("missing .ae-guide-input");
			return [getComputedStyle(box).backgroundColor, getComputedStyle(document.body).backgroundColor];
		});
		expect(boxBg).not.toBe(pageBg);
	});

	test("the page runs the full width of the window, chrome included", async ({ page }) => {
		await page.setViewportSize({ width: 1900, height: 900 });
		await page.goto("/guide");
		const widths = await page.evaluate(() => ({
			header: document.querySelector(".ae-header")?.getBoundingClientRect().width,
			viewport: window.innerWidth,
		}));
		// The 1280px page cap is lifted here; a capped header above a
		// full-width hero is what made this look broken.
		expect(widths.header).toBe(widths.viewport);
	});

	test("the orb sits beside the headline on desktop and below it on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/guide");
		const orb = page.locator(".ae-orb");
		await expect(orb).toBeVisible();

		const wide = await page.evaluate(() => {
			const rect = (sel: string) => {
				const el = document.querySelector(sel);
				if (!el) throw new Error(`missing ${sel}`);
				return el.getBoundingClientRect();
			};
			const o = rect(".ae-orb");
			const h1 = rect("#guide-title");
			return { orbLeft: o.left, headingRight: h1.right, orbTop: o.top, headingTop: h1.top };
		});
		expect(wide.orbLeft).toBeGreaterThan(wide.headingRight);
		expect(Math.abs(wide.orbTop - wide.headingTop)).toBeLessThan(200);

		await page.setViewportSize({ width: 600, height: 900 });
		const narrow = await page.evaluate(() => {
			const rect = (sel: string) => {
				const el = document.querySelector(sel);
				if (!el) throw new Error(`missing ${sel}`);
				return el.getBoundingClientRect();
			};
			return { orbTop: rect(".ae-orb").top, headingBottom: rect("#guide-title").bottom };
		});
		expect(narrow.orbTop).toBeGreaterThan(narrow.headingBottom);
	});
});
