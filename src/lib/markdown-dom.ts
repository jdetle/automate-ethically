// Renders the guide's markdown replies into real DOM nodes.
//
// The model answers in markdown — headings, lists, links to this site's own
// pages — and rendering that as flat text meant visitors saw literal "##" and
// unclickable "/toolkit/find-your-council". This uses marked's lexer for the
// parsing (it is a real markdown implementation; hand-rolling one would be
// worse), but deliberately does NOT use its HTML output.
//
// Nothing here ever touches innerHTML. Every node is constructed explicitly
// and every string goes in as a text node, so a model reply — which is
// ultimately shaped by whatever a visitor typed, and by web pages the model
// read — cannot inject markup or script into this page. That matters more
// than usual here: this route feeds untrusted web-search results into a
// surface rendered in a first-party origin. A sanitiser would be a filter to
// get wrong; a builder that cannot emit HTML in the first place has no
// bypass to find.
//
// Link policy: relative links (this site's own pages) render as ordinary
// same-tab links. Anything external opens in a new tab with
// rel="noopener noreferrer", and only http(s) schemes are allowed at all —
// javascript:, data:, and friends are dropped to plain text.

import { marked, type Token, type Tokens } from "marked";

function isSafeHref(href: string): { ok: boolean; external: boolean } {
	const trimmed = href.trim();
	if (trimmed.startsWith("/") || trimmed.startsWith("#")) return { ok: true, external: false };
	try {
		const url = new URL(trimmed, window.location.origin);
		if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, external: false };
		return { ok: true, external: url.origin !== window.location.origin };
	} catch {
		return { ok: false, external: false };
	}
}

function appendInline(parent: Node, tokens: Token[] | undefined, raw?: string) {
	if (!tokens || tokens.length === 0) {
		if (raw) parent.appendChild(document.createTextNode(raw));
		return;
	}
	for (const token of tokens) {
		switch (token.type) {
			case "text": {
				const t = token as Tokens.Text;
				if (t.tokens && t.tokens.length > 0) appendInline(parent, t.tokens);
				else parent.appendChild(document.createTextNode(t.text));
				break;
			}
			case "escape":
				parent.appendChild(document.createTextNode((token as Tokens.Escape).text));
				break;
			case "strong": {
				const el = document.createElement("strong");
				appendInline(el, (token as Tokens.Strong).tokens);
				parent.appendChild(el);
				break;
			}
			case "em": {
				const el = document.createElement("em");
				appendInline(el, (token as Tokens.Em).tokens);
				parent.appendChild(el);
				break;
			}
			case "codespan": {
				const el = document.createElement("code");
				el.textContent = (token as Tokens.Codespan).text;
				parent.appendChild(el);
				break;
			}
			case "del": {
				const el = document.createElement("s");
				appendInline(el, (token as Tokens.Del).tokens);
				parent.appendChild(el);
				break;
			}
			case "br":
				parent.appendChild(document.createElement("br"));
				break;
			case "link": {
				const link = token as Tokens.Link;
				const { ok, external } = isSafeHref(link.href);
				if (!ok) {
					// Unsafe scheme: keep the words, drop the link.
					appendInline(parent, link.tokens, link.text);
					break;
				}
				const a = document.createElement("a");
				a.href = link.href;
				if (external) {
					a.target = "_blank";
					a.rel = "noopener noreferrer";
				}
				appendInline(a, link.tokens, link.text);
				parent.appendChild(a);
				break;
			}
			case "image": {
				// Never load a remote image the model chose — that would leak a
				// request to a third party the visitor never agreed to. Show the
				// alt text instead.
				const img = token as Tokens.Image;
				parent.appendChild(document.createTextNode(img.text || img.title || ""));
				break;
			}
			default: {
				const anyToken = token as { tokens?: Token[]; raw?: string; text?: string };
				if (anyToken.tokens) appendInline(parent, anyToken.tokens);
				else parent.appendChild(document.createTextNode(anyToken.text ?? anyToken.raw ?? ""));
			}
		}
	}
}

function appendBlocks(parent: Node, tokens: Token[]) {
	for (const token of tokens) {
		switch (token.type) {
			case "space":
				break;
			case "paragraph": {
				const p = document.createElement("p");
				appendInline(p, (token as Tokens.Paragraph).tokens);
				parent.appendChild(p);
				break;
			}
			case "heading": {
				const h = token as Tokens.Heading;
				// Clamped to h3-h4: a chat reply lives inside the page's own
				// heading outline and must not introduce competing h1/h2s.
				const el = document.createElement(h.depth <= 2 ? "h3" : "h4");
				appendInline(el, h.tokens);
				parent.appendChild(el);
				break;
			}
			case "list": {
				const list = token as Tokens.List;
				const el = document.createElement(list.ordered ? "ol" : "ul");
				if (list.ordered && typeof list.start === "number" && list.start !== 1) {
					el.setAttribute("start", String(list.start));
				}
				for (const item of list.items) {
					const li = document.createElement("li");
					// Loose list items carry block tokens; tight ones are inline.
					if (item.tokens?.some((t) => t.type === "paragraph" || t.type === "list")) {
						appendBlocks(li, item.tokens);
					} else {
						appendInline(li, item.tokens, item.text);
					}
					el.appendChild(li);
				}
				parent.appendChild(el);
				break;
			}
			case "blockquote": {
				const el = document.createElement("blockquote");
				appendBlocks(el, (token as Tokens.Blockquote).tokens);
				parent.appendChild(el);
				break;
			}
			case "code": {
				const pre = document.createElement("pre");
				const code = document.createElement("code");
				code.textContent = (token as Tokens.Code).text;
				pre.appendChild(code);
				parent.appendChild(pre);
				break;
			}
			case "hr":
				parent.appendChild(document.createElement("hr"));
				break;
			case "table": {
				const t = token as Tokens.Table;
				const wrap = document.createElement("div");
				wrap.className = "ae-md-table";
				const table = document.createElement("table");
				const thead = document.createElement("thead");
				const hrow = document.createElement("tr");
				for (const cell of t.header) {
					const th = document.createElement("th");
					appendInline(th, cell.tokens, cell.text);
					hrow.appendChild(th);
				}
				thead.appendChild(hrow);
				table.appendChild(thead);
				const tbody = document.createElement("tbody");
				for (const row of t.rows) {
					const tr = document.createElement("tr");
					for (const cell of row) {
						const td = document.createElement("td");
						appendInline(td, cell.tokens, cell.text);
						tr.appendChild(td);
					}
					tbody.appendChild(tr);
				}
				table.appendChild(tbody);
				wrap.appendChild(table);
				parent.appendChild(wrap);
				break;
			}
			case "html":
				// Raw HTML in a model reply is shown as text, never parsed.
				parent.appendChild(document.createTextNode((token as Tokens.HTML).raw));
				break;
			default: {
				const anyToken = token as { tokens?: Token[]; raw?: string };
				if (anyToken.tokens) appendBlocks(parent, anyToken.tokens);
				else if (anyToken.raw) parent.appendChild(document.createTextNode(anyToken.raw));
			}
		}
	}
}

/**
 * Turns bare URLs and this site's own paths into markdown links before
 * parsing, so a reply that writes "/toolkit/council-script" as plain prose
 * still becomes clickable — the system prompt asks the model to cite its
 * sources and point at these pages, and an uncopyable path undercuts both.
 */
const SITE_PATHS = ["/act", "/toolkit", "/facts", "/states", "/about", "/search", "/guide"];

function autolink(markdown: string): string {
	const codeSpans: string[] = [];
	// Protect code spans and fenced blocks from linkification. The sentinel is
	// an unlikely ASCII token, not a control or private-use character: those
	// trip regex linters and can be mangled by intermediate processing.
	const mark = (m: string) => `@@aeCode${codeSpans.push(m) - 1}@@`;
	let text = markdown
		.replace(/```[\s\S]*?```/g, mark)
		.replace(/`[^`]*`/g, mark);

	// Bare URLs, but not ones already inside a markdown link.
	text = text.replace(/(^|[\s(])(https?:\/\/[^\s<>()"']+)/g, (_m, lead, url) => `${lead}<${url}>`);

	// Site-relative paths written as prose.
	const pathPattern = new RegExp(
		`(^|[\\s(])(${SITE_PATHS.map((p) => p.replace("/", "\\/")).join("|")})((?:\\/[a-z0-9-]+)*)\\b(?!\\])`,
		"gi",
	);
	text = text.replace(pathPattern, (_m, lead, base, rest) => {
		const href = `${base}${rest ?? ""}`;
		return `${lead}[${href}](${href})`;
	});

	return text.replace(/@@aeCode(\d+)@@/g, (_m, i) => codeSpans[Number(i)] ?? "");
}

/**
 * Replaces `target`'s children with `markdown` rendered as DOM. Safe to call
 * on every streamed chunk — parsing a few KB is far cheaper than a frame.
 */
export function renderMarkdownInto(target: HTMLElement, markdown: string) {
	target.textContent = "";
	const tokens = marked.lexer(autolink(markdown));
	appendBlocks(target, tokens);
}
