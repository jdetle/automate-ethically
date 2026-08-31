import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, test } from "vitest";
import ActionMatcher from "../../src/components/ui/ActionMatcher.astro";
import Button from "../../src/components/ui/Button.astro";
import Callout from "../../src/components/ui/Callout.astro";
import Card from "../../src/components/ui/Card.astro";
import Chip from "../../src/components/ui/Chip.astro";
import Signature from "../../src/components/ui/Signature.astro";
import Stat from "../../src/components/ui/Stat.astro";
import { ACTIONS, EMPTY_COMBOS, TIMES } from "../../src/data/actions";

// Rendered through Astro's Container API, so these exercise the same
// components the site ships rather than a re-implementation of them.
let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

describe("Button", () => {
	test("renders an anchor when given an href and a button otherwise", async () => {
		const link = await container.renderToString(Button, {
			props: { href: "/act" },
			slots: { default: "Take action" },
		});
		expect(link).toContain('<a href="/act"');
		expect(link).toContain("Take action");

		const button = await container.renderToString(Button, {
			props: { type: "submit" },
			slots: { default: "Send" },
		});
		expect(button).toContain("<button");
		expect(button).not.toContain("<a ");
	});

	test("carries the hover-lift primitive, and only the requested variant", async () => {
		const html = await container.renderToString(Button, {
			props: { href: "#", variant: "secondary" },
			slots: { default: "Read" },
		});
		expect(html).toContain("ae-lift");
		expect(html).toContain("ae-btn--secondary");
		expect(html).not.toContain("ae-btn--primary");
	});
});

describe("Chip", () => {
	// The regression this exists for: the role chip declined to set a
	// background, inherited the sun fill from the global .ae-chip fallback in
	// site.css, and every audience tag rendered as a time chip.
	test("a role chip is visually distinct from a time chip", async () => {
		const time = await container.renderToString(Chip, {
			props: { variant: "time" },
			slots: { default: "30 sec" },
		});
		const role = await container.renderToString(Chip, {
			props: { variant: "role" },
			slots: { default: "Neighbor" },
		});
		expect(time).toContain("ae-chip--time");
		expect(role).toContain("ae-chip--role");
		expect(role).not.toContain("ae-chip--time");
	});
});

describe("Stat", () => {
	test("a figure cannot render without its source", async () => {
		const html = await container.renderToString(Stat, {
			props: {
				value: "6,000",
				label: "communities under one company's plate cameras",
				source: { href: "https://example.org/report", label: "EFF, ALPR" },
			},
		});
		expect(html).toContain("6,000");
		expect(html).toContain('href="https://example.org/report"');
		expect(html).toContain("Source: EFF, ALPR");
	});
});

describe("Card", () => {
	test("carries the punch by default and drops it on request", async () => {
		const withPunch = await container.renderToString(Card, { slots: { default: "x" } });
		expect(withPunch).toContain("ae-card-punch");

		const without = await container.renderToString(Card, {
			props: { punch: false },
			slots: { default: "x" },
		});
		expect(without).not.toContain("ae-card-punch");
	});
});

describe("Callout", () => {
	test("banner layout promotes the title out of the body copy", async () => {
		const stacked = await container.renderToString(Callout, {
			props: { tone: "warn", title: "Drafted, not lawyered." },
			slots: { default: "<p>Not legal advice.</p>" },
		});
		expect(stacked).toContain("ae-callout-title");
		expect(stacked).not.toContain("ae-callout-claim");

		const banner = await container.renderToString(Callout, {
			props: { tone: "sun", layout: "banner", title: "This is winnable." },
			slots: { default: "<p>Fifty communities.</p>" },
		});
		expect(banner).toContain("ae-callout-claim");
		expect(banner).toContain("ae-callout--banner");
	});
});

describe("the gold rule", () => {
	// Gold marks human accountability and nothing else. Signature is the
	// component that exists to do it; if a second component starts painting
	// itself gold, that rule has quietly stopped being true.
	test("Signature is what wears gold", async () => {
		const html = await container.renderToString(Signature, {
			props: { name: "R. Alvarez, maintainer" },
			slots: { default: "Every release is approved by a person." },
		});
		expect(html).toContain("ae-signature-name");
		expect(html).toContain("R. Alvarez, maintainer");
	});

	test("only the action a named person answers for gets the gold rail", async () => {
		const html = await container.renderToString(ActionMatcher, { props: { name: "t" } });
		const railed = html.match(/ae-tile--accountable/g) ?? [];
		const accountable = ACTIONS.filter((a) => a.accountable);
		expect(accountable.length).toBeGreaterThan(0);
		expect(railed).toHaveLength(accountable.length);
	});
});

describe("ActionMatcher", () => {
	test("renders every action, so filtering only ever hides what is already there", async () => {
		const html = await container.renderToString(ActionMatcher, { props: { name: "t" } });
		for (const a of ACTIONS) {
			expect(html).toContain(a.title);
			expect(html).toContain(a.href);
			// The honest time cost ships with the action, never separately.
			expect(html).toContain(a.time);
		}
	});

	test("generates a hide rule for exactly the buckets each time filter excludes", async () => {
		const html = await container.renderToString(ActionMatcher, { props: { name: "t" } });
		for (const t of TIMES) {
			for (const bucket of ["b1", "b2", "b3", "b4", "b5", "b6"] as const) {
				const rule = `.ae-matcher:has(.ae-matcher-time:checked[value="${t.value}"]) .ae-tile[data-bucket="${bucket}"]`;
				expect(html.includes(rule)).toBe(!t.keeps.includes(bucket));
			}
		}
	});

	test("the empty state is claimed only for combinations that really are empty", async () => {
		for (const combo of EMPTY_COMBOS) {
			const time = TIMES.find((t) => t.value === combo.time);
			expect(time, `unknown time filter ${combo.time}`).toBeDefined();
			const matches = ACTIONS.filter(
				(a) => a.audience === combo.audience && time?.keeps.includes(a.bucket),
			);
			expect(matches, `${combo.audience} × ${combo.time} is not actually empty`).toHaveLength(0);
		}
	});

	test("no audience/time pair is silently empty without being declared", async () => {
		const audiences = [...new Set(ACTIONS.map((a) => a.audience))];
		for (const audience of audiences) {
			for (const time of TIMES) {
				const matches = ACTIONS.filter(
					(a) => a.audience === audience && time.keeps.includes(a.bucket),
				);
				if (matches.length > 0) continue;
				const declared = EMPTY_COMBOS.some(
					(c) => c.audience === audience && c.time === time.value,
				);
				expect(declared, `${audience} × ${time.value} yields nothing and says nothing`).toBe(true);
			}
		}
	});

	test("namespaces its radio groups so two matchers can share a page", async () => {
		const a = await container.renderToString(ActionMatcher, { props: { name: "home" } });
		const b = await container.renderToString(ActionMatcher, { props: { name: "act" } });
		expect(a).toContain('name="home-time"');
		expect(b).toContain('name="act-time"');
		expect(a).not.toContain('name="act-time"');
	});
});
