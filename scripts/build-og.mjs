// Generates every social card in public/og/ from one definition list.
//
// These used to be ten hand-maintained SVG files, which is why they were all
// still on the v1 cloth palette and the old tagline a full redesign later.
// Now the palette, the type and the wording live here once, and `bun run
// og` rewrites both the .svg source and the .png that actually ships.
//
// Fonts are vendored as static instances in scripts/og-fonts/ rather than
// pulled from node_modules: resvg needs TTF (it will not read the woff2
// fontsource ships), and it renders a variable font at its default instance,
// so a "bold" headline came out at weight 400. Instancing the weights up
// front means what you see here is what the card looks like. Both faces are
// OFL; see the licence in each upstream package.
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public/og");
const fontFiles = [
	join(root, "scripts/og-fonts/SpaceGrotesk-Bold.ttf"),
	join(root, "scripts/og-fonts/DMSans-Regular.ttf"),
	join(root, "scripts/og-fonts/DMSans-Bold.ttf"),
];

const W = 1200;
const H = 630;

// v2 "pop", the same tokens the site ships (src/styles/tokens.css).
const GROUND = "#f6f8fe";
const INK = "#101733";
const COBALT = "#2b4bf2";
const CORAL = "#ff5440";
const SUN = "#ffc531";
const MUTED = "#5b6474";
const DISPLAY = "Space Grotesk";
const SANS = "DM Sans";

const esc = (s) =>
	String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The weave, faint, behind everything. Decoration only, like on the site. */
function weave() {
	const lines = [];
	for (let x = 0; x <= W; x += 60) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`);
	for (let y = 0; y <= H; y += 60) lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`);
	return `<g stroke="${COBALT}" stroke-width="1" opacity="0.07">${lines.join("")}</g>`;
}

/** A punched card: the hole a person made. */
function punchCard({ x, y, cols, rows, fill, rotate }) {
	const cell = 26;
	const pad = 12;
	const w = cols * cell + pad * 2;
	const h = rows * cell + pad * 2;
	const holes = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			holes.push(
				`<circle cx="${pad + cell * c + cell / 2}" cy="${pad + cell * r + cell / 2}" r="6" fill="${GROUND}"/>`,
			);
		}
	}
	return `<g transform="translate(${x} ${y}) rotate(${rotate})"><rect width="${w}" height="${h}" rx="16" fill="${fill}"/>${holes.join("")}</g>`;
}

function stitch(y, x1 = 72, x2 = 1128, color = CORAL) {
	return `<g stroke="${color}" stroke-width="3" stroke-linecap="round">
		<circle cx="${x1}" cy="${y}" r="5" fill="${color}" stroke="none"/>
		<line x1="${x1 + 14}" y1="${y}" x2="${x2 - 14}" y2="${y}" stroke-dasharray="16 12"/>
		<circle cx="${x2}" cy="${y}" r="5" fill="${color}" stroke="none"/>
	</g>`;
}

function wordmark(x, y) {
	return `<text x="${x}" y="${y}" font-family="${DISPLAY}" font-size="26" font-weight="700" fill="${INK}" letter-spacing="1.2">Automate, Ethically.</text>`;
}

function domain(x, y, anchor = "start") {
	return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${SANS}" font-size="24" fill="${MUTED}">automate-ethically.com</text>`;
}

/** Headline block. Lines are explicit: a card is a poster, not a paragraph. */
function headline(lines, { x = 72, top = 250, size = 76, lead = 88, anchor = "start", fill = INK }) {
	return lines
		.map(
			(line, i) =>
				`<text x="${x}" y="${top + i * lead}" text-anchor="${anchor}" font-family="${DISPLAY}" font-size="${size}" font-weight="700" fill="${fill}" letter-spacing="-1.5">${esc(line)}</text>`,
		)
		.join("");
}

function eyebrow(text, x, y, color = CORAL, anchor = "start") {
	return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${SANS}" font-size="20" font-weight="700" fill="${color}" letter-spacing="3.4">${esc(text.toUpperCase())}</text>`;
}

/** The standard page card: eyebrow, headline, stitch, domain. */
function pageCard({ kicker, lines, size = 72, lead = 84, sub }) {
	return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
	<rect width="${W}" height="${H}" fill="${GROUND}"/>
	${weave()}
	${punchCard({ x: 928, y: 96, cols: 4, rows: 2, fill: SUN, rotate: -6 })}
	${punchCard({ x: 1010, y: 236, cols: 3, rows: 2, fill: CORAL, rotate: 9 })}
	${wordmark(72, 92)}
	${eyebrow(kicker, 72, 168)}
	${headline(lines, { top: 268, size, lead })}
	${sub ? `<text x="72" y="${268 + lines.length * lead + 6}" font-family="${SANS}" font-size="26" fill="${MUTED}">${esc(sub)}</text>` : ""}
	${stitch(508)}
	${domain(72, 566)}
</svg>`;
}

/** The quote cards people save and post: centred, no chrome. */
function quoteCard({ lines, size = 62, lead = 76, attribution, accent = CORAL }) {
	const top = 630 / 2 - ((lines.length - 1) * lead) / 2 - (attribution ? 34 : 0);
	return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
	<rect width="${W}" height="${H}" fill="${GROUND}"/>
	${weave()}
	${stitch(96, 72, 1128, accent)}
	${headline(lines, { x: 600, top, size, lead, anchor: "middle" })}
	${
		attribution
			? `<text x="600" y="${top + (lines.length - 1) * lead + 68}" text-anchor="middle" font-family="${SANS}" font-size="24" fill="${MUTED}">${esc(attribution)}</text>`
			: ""
	}
	${stitch(534, 72, 1128, accent)}
	${domain(600, 582, "middle")}
</svg>`;
}

// The tagline, in one place. Everything else on the site quotes it.
const TAGLINE = ["A human should", "make the decision."];

const cards = {
	default: pageCard({ kicker: "A civic demand", lines: TAGLINE, size: 82, lead: 96 }),
	act: pageCard({
		kicker: "Take action",
		lines: ["Pick the step you", "can reach today."],
		sub: "Thirty seconds, or an hour. Every bit counts.",
	}),
	toolkit: pageCard({
		kicker: "The toolkit",
		lines: ["Everything you", "need is on paper."],
		sub: "Print it, pin it, hand it to a neighbor.",
	}),
	states: pageCard({
		kicker: "State by state",
		lines: ["Every state is", "writing these rules."],
		sub: "1,561 AI bills, 45 states, this session.",
	}),
	facts: pageCard({
		kicker: "Evidence, cited",
		lines: ["Every number here", "shows its source."],
		sub: "And our correction policy, in the open.",
	}),
	about: pageCard({
		kicker: "The movement",
		lines: ["Neighbors, builders,", "and organizers."],
		sub: "No committee exists. Nothing here asks for money.",
	}),
	guide: pageCard({
		kicker: "Talk it through",
		lines: ["What's organizing", "near you."],
		sub: "And where your own skills fit in.",
	}),
	"quote-principle": quoteCard({ lines: TAGLINE, size: 72, lead: 88 }),
	"quote-loom": quoteCard({
		lines: [
			"The loom did not",
			"remove the weaver.",
		],
		attribution: "A person chose the pattern, punched the cards, and signed the bolt.",
		size: 66,
		lead: 82,
		accent: COBALT,
	}),
	"quote-anger": quoteCard({
		lines: ["The anger is real.", "Aim it at the rulebook."],
		size: 62,
		lead: 78,
	}),
};

mkdirSync(outDir, { recursive: true });
for (const [name, svg] of Object.entries(cards)) {
	writeFileSync(join(outDir, `${name}.svg`), `${svg}\n`);
	const png = new Resvg(svg, {
		font: { fontFiles, loadSystemFonts: false, defaultFontFamily: SANS },
		fitTo: { mode: "width", value: W },
	})
		.render()
		.asPng();
	writeFileSync(join(outDir, `${name}.png`), png);
	console.log(`${name}.png  ${(png.length / 1024).toFixed(0)}kb`);
}
