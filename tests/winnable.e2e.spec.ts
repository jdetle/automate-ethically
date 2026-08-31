import { expect, test } from "@playwright/test";

// Two bugs on the "This is winnable" banner, both invisible to a build.
//
// The margin rule was written in the home page's scoped <style>, but the
// class reaches the banner as a prop on <Callout>, so the element carries
// that component's scope attribute and never matched. The banner sat flush
// against the stats above it with margin: 0.
//
// And the selection highlight is sun yellow site-wide, which vanishes on a
// sun yellow background: dragging across the banner's text looked like
// selecting nothing.

test.describe("the winnable banner", () => {
	test("is not flush against the stats above it", async ({ page }) => {
		await page.goto("/");

		const gap = await page.evaluate(() => {
			const el = document.querySelector(".ae-winnable");
			if (!el) throw new Error("missing .ae-winnable");
			const prev = el.previousElementSibling;
			if (!prev) throw new Error("nothing above the banner");
			return Math.round(el.getBoundingClientRect().top - prev.getBoundingClientRect().bottom);
		});

		expect(gap).toBeGreaterThanOrEqual(16);
	});

	test("highlights in blue, because its background is yellow", async ({ page }) => {
		await page.goto("/");

		// ::selection can't be read off an element, so ask the document which
		// rules actually match the banner and its descendants.
		const rules = await page.evaluate(() => {
			const found: string[] = [];
			for (const sheet of Array.from(document.styleSheets)) {
				let list: CSSRuleList;
				try {
					list = sheet.cssRules;
				} catch {
					continue; // cross-origin
				}
				for (const rule of Array.from(list)) {
					const text = rule.cssText;
					if (text.includes("::selection") && text.includes("ae-callout--sun")) found.push(text);
				}
			}
			return found;
		});

		expect(rules.length, "no selection rule targets the sun callout").toBeGreaterThan(0);
		// It must not repaint yellow on yellow.
		expect(rules.join(" ")).toContain("--ae-cobalt");
		expect(rules.join(" ")).not.toContain("--ae-sun");
	});
});
