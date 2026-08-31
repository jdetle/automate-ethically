// Checks the copy a reader actually sees for the marks of machine-drafted
// prose, using the built HTML rather than the source so it judges the
// rendered page and ignores code comments.
//
// Most of this site was machine-drafted; the README says so and /act asks
// for volunteers to rewrite it. A site whose whole argument is that a person
// should be answerable for what a machine produced cannot itself read like
// nobody checked. The list below follows Wikipedia's "Signs of AI writing",
// trimmed to the tells that actually apply to civic prose.
//
// Run: bun run check:copy
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "dist/client";

/** Phrases that read as machine filler in this register. */
const PHRASES = [
	// Connective filler
	"moreover", "furthermore", "in conclusion", "it's worth noting",
	"it is worth noting", "importantly,", "notably,", "that said,",
	// Puffery
	"delve", "tapestry", "a testament to", "stands as", "serves as a",
	"plays a vital role", "plays a crucial role", "pivotal", "robust",
	"seamless", "leveraging", "leverage the", "showcase", "boasts", "underscore",
	// "leverage" as a noun is ordinary organizing English ("a lot of leverage",
	// "the highest-leverage hour"); only the verb reads as filler.
	"ever-evolving", "ever-changing", "in today's", "the realm of",
	"the landscape of", "rich history", "vibrant",
	// Hollow intensifiers
	"truly", "incredibly", "remarkably", "undoubtedly",
	// The signature construction
	"it's not just", "it is not just", "not only", "isn't just about",
	// Vague attribution: this site cites sources by name, always
	"experts say", "experts agree", "studies suggest", "studies show",
	"research suggests", "reports indicate", "industry reports",
	"many believe", "it is widely",
];

function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : full.endsWith(".html") ? [full] : [];
	});
}

/** Visible text only: no scripts, styles, or HTML comments. */
function visibleText(html) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&mdash;/g, "—")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ");
}

function context(text, index, span = 46) {
	return text.slice(Math.max(0, index - span), index + span).trim();
}

let findings = 0;
for (const file of walk(ROOT).sort()) {
	const text = visibleText(readFileSync(file, "utf8"));
	const page = file.replace(`${ROOT}/`, "");
	const hits = [];

	for (let i = text.indexOf("—"); i !== -1; i = text.indexOf("—", i + 1)) {
		hits.push(["em dash", context(text, i)]);
	}

	const lower = text.toLowerCase();
	for (const phrase of PHRASES) {
		for (let i = lower.indexOf(phrase); i !== -1; i = lower.indexOf(phrase, i + 1)) {
			hits.push([phrase, context(text, i)]);
		}
	}

	if (hits.length) {
		findings += hits.length;
		console.log(`\n${page}  (${hits.length})`);
		for (const [what, where] of hits) console.log(`  ${what.padEnd(12)} …${where}…`);
	}
}

console.log(`\n${findings} finding${findings === 1 ? "" : "s"}.`);
process.exit(findings === 0 ? 0 : 1);
