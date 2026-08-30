# Adversarial Review: introducing site search against the zero-client-JS policy

---
date: 2026-08-29
slug: search-js-policy
mode: design-debate
status: proceed
scope: src/pages/search.astro, src/layouts/Page.astro (data-pagefind-body), package.json (pagefind build step), README.md (JS policy section)
diff_base: origin/main
veto_fired: false
follow_up_open: false
caught_real_issue: pending
---

## TL;DR
- decision: proceed, unchanged from the shipped implementation
- key reason: Pagefind's index and UI are generated at build time and served from the site's own origin — it is a first-party static asset, not a third-party script, so it does not actually compromise the property the JS policy exists to protect
- top unresolved risk: none blocking; a noscript fallback exists but degrades to "search doesn't work," not "search still works differently"
- immediate next step: none required to ship; optional follow-up noted below

## Debate Config
- evidence_rule: at least one of file/metric/repro/operational-risk per major claim
- max_turns_per_persona_per_phase: 2; max_claims_per_turn: 3

## Persona Roster
Personas: maren-shipper@v1, iris-auditor@v1, kai-explorer@v1, rafe-steward@v1, juno-mediator@v1
(loaded from jacquard `docs/adversarial-review/personas/`)

## Context pack
- Proposal: add full-text search at `/search`, built with Pagefind (a static-index search tool: `pagefind --site dist` runs after `astro build` and writes an index + UI script into `dist/pagefind/`, all served from the site's own domain).
- Constraint: the site's stated JS policy (README) is "zero client JavaScript by default," with two previously-named exceptions (the s10 pageview beacon, the future Action Network embed on `/act`). This proposal adds a third, on `/search` only.
- Not decided by this review (Juno's boundary): whether Pagefind is the right search tool versus alternatives (Lunr, Algolia, a server-side option) — no server exists to run a server-side option, and Algolia is a genuine third party, which was rejected without debate as inconsistent with the site's argument. This review decides only whether *any* JS-based search belongs on this site, and whether the current scoping (one page, self-hosted) is the right shape.

## Phase 1 — Offense

**Maren (shipper).** Veto condition: I will veto if search requires a rebuild step nobody remembers to run — `package.json`'s `"build": "astro build && pagefind --site dist"` (verified: I ran it, it produced `dist/pagefind/` with a real index) already closes this, so no veto fires. Claim she expects agreement on: this is the cheapest possible way to ship search — no new service, no new container, no new secret, one devDependency. Claim she expects rejection on: none — she has no rejection claim here, which she flags as unusual for her seat and worth noting rather than manufacturing one.

**Iris (auditor).** Veto condition: I will veto if the search page claims to search "this site" while silently excluding real content, or if it sends anything off-origin. Checked: `src/layouts/Page.astro`'s `data-pagefind-body` attribute on `<main>` scopes indexing to page content only (verified via the build log: "Found a data-pagefind-body element on the site. Indexing all pages with this tag" — Header/Footer nav chrome is correctly excluded, avoiding a false claim that "everything" is searchable when nav boilerplate would otherwise dominate results). Checked network behavior: `search.astro`'s script and stylesheet both load from `/pagefind/...` — same-origin, confirmed by reading the tags directly (`<link rel="stylesheet" href="/pagefind/pagefind-ui.css">`, `<script is:inline src="/pagefind/pagefind-ui.js">`), no CDN, no external fetch. No veto fires. She does flag one imprecision for the record, not a veto: the README's JS-policy list now names three exceptions but the site's footer privacy line (`src/components/Footer.astro`) doesn't mention that `/search` runs local JS at all — not a deception (search obviously requires interaction to work), but she prefers every JS-bearing page be enumerable from one place rather than requiring a diff read to discover.

**Kai (explorer).** Attacks the premise from the visitor's chair: what does the screen argue when JavaScript is off? `search.astro`'s `<noscript>` block says "Search needs JavaScript to work... you can still browse everything from the home page or the toolkit" — that's honest, but it's also the first place on this entire site where the screen says "this doesn't work without JS," on a site whose whole identity is built on working without JS. He does not consider this a defect — a search index genuinely cannot function without code to query it, unlike, say, a form that could have used a plain POST — but he flags the optics: a visitor who disables JS specifically because this site advertised it doesn't need it, then hits the one page that contradicts that promise, may read it as bait-and-switch even though the README's exceptions list was always honest about it. Claim he expects agreement on: search should not be in the primary nav's visually-equal-weight position next to "Act" (`src/components/Header.astro`) — it's a utility, not a pillar of the argument, and giving it equal nav weight overstates its importance relative to the three exceptions being a deliberately minimized set. Claim he expects rejection on: Pagefind's default UI widget (loaded via `pagefind-ui.js`) is a full pre-built component with its own DOM structure and CSS — he'd have preferred the newer Pagefind "Component" API for tighter visual control, even though the build output flagged this exact tradeoff unprompted ("As of 1.5.0... use the Component UI instead... better accessibility and customization").

**Rafe (steward).** Counts the addition to the permanent maintenance set: one devDependency (`pagefind@1.5.2`), one build-step concatenation in `package.json`, zero new CI secrets, zero new runtime infrastructure — the index rebuilds automatically on every `bun run build`, so there's no separate "remember to reindex" step the way a hand-maintained sitemap might need (and Rafe notes the sitemap itself is *also* handled by a build-time integration, `@astrojs/sitemap`, so this proposal doesn't introduce a new category of build-time-generated-artifact risk, just one more instance of a pattern already accepted). No veto. He does flag: `dist/pagefind/` is gitignored (verified — `dist/` as a whole is gitignored per the existing repo convention) but is a build output the deploy pipeline depends on; if anyone ever changes the Docker build to skip `bun run build` in favor of copying a pre-built `dist/`, search would silently ship stale or missing. This is a documentation gap, not a code defect: the Dockerfile already runs `bun run build` (confirmed), so today it's correct — he wants it named so a future edit to the Dockerfile doesn't quietly break search without anyone noticing until someone searches and gets nothing.

**Juno (mediator).** Decision boundary: this review decides whether Pagefind belongs on this site and whether it's scoped correctly — not which search library is technically best (Maren and Kai's implicit alternatives are noted, not adjudicated), not the visual design of the search results page. Scope-creep check: the proposal correctly resisted the temptation to add a search box to every page's header dropdown or an instant-search-as-you-type widget site-wide — it is one link, to one page, and that boundary was respected in the actual diff.

## Phase 2 — Defense

**Maren.** Steelman of Kai's nav-weight claim: the strongest version is that nav position is itself a claim about importance, and putting "Search" at the same visual weight as "Act" (both plain nav links, `Header.astro:14-17` vs. the styled `.ae-nav-act` treatment on line 18-21) actually already differentiates them — Act got a distinct madder-colored treatment specifically because it's the site's primary conversion action; Search did not get that treatment, which is the correct signal already. She half-accepts: the differentiation exists but is subtle (color only, same position in the flow), and agrees a follow-up could test whether it needs to be more subordinate (e.g., an icon-only affordance) — not a merge gate.

**Iris.** Steelman of Kai's "bait and switch" framing: the strongest version is that a policy document (the README) being technically accurate doesn't prevent a real user from experiencing a contradiction, and "we documented the exception" is a defense that satisfies an auditor, not a visitor. She accepts this as valid but distinguishes it from her own territory: whether the *documentation* is honest (her seat) is satisfied; whether the *experience* is coherent for a JS-disabled visitor (Kai's seat) is a separate, legitimate question she is not positioned to resolve. No change to her verdict.

**Kai.** Steelman of Rafe: the strongest version of the Dockerfile-drift risk is that build-time-generated artifacts are exactly the kind of dependency that silently rots — nobody writes a test that says "search still returns results" the way they'd write a test for an API endpoint, so a broken search index fails silent and stays silent until a human notices. Accepted. He answers Maren's rebuttal on nav weight directly: agrees the color differentiation is real and sufficient for now, downgrades his claim from "should reject" to "worth watching," and does not hold it as a dissent — the first time in this transcript he's conceded past the point his persona brief expects him to (he flags this himself: "I'll say it — this one's fine as shipped").

**Rafe.** Steelman of Iris's documentation-completeness point: the strongest version is that a footer line claiming "no third-party trackers, sets no cookies" (`Footer.astro`) is adjacent-enough to "no JavaScript" that a careful reader could misread the footer as a blanket JS claim, when the actual policy (three named exceptions) lives only in the README. Accepted as a real gap, held as a non-blocking follow-up: the footer's privacy line could gain one clause noting that a few pages use small, first-party scripts (search, and eventually the AN embed), without turning the footer into a policy document.

**Juno.** Steelman of the proposal itself: the strongest form of "should this exist at all" is that a seven-page site arguably doesn't need search yet — full-text search earns its keep once there's enough content that browsing fails, and seven pages browse fine from one nav bar. Accepted as a real question, and answered by scale-readiness rather than current necessity: the toolkit content collection (`src/content.config.ts`) is designed to grow (ordinance, FAQ, more toolkit docs are already planned for Phase 2), and shipping search now, cheaply, while the JS-exception ledger is short and each exception is still individually justifiable, is cheaper than retrofitting it once the site has thirty pages and the "is this still zero-JS" conversation has to happen under more scrutiny.

## Phase 3 — Synthesis

**Merged proposal — "search stays, two small follow-ups" (single option):**

1. **No blocking changes.** The implementation as shipped — self-hosted, build-time-generated, scoped to `/search` via `data-pagefind-body`, honestly noscript'd — satisfies every persona's veto condition. No veto fired in Phase 1, none introduced in Phase 2.
2. **Follow-up (Rafe, non-blocking):** add a one-line comment in the Dockerfile or README noting that `bun run build` must run the full script (not `astro build` alone) for search to have an index — cheap insurance against future drift.
3. **Follow-up (Iris/Rafe, non-blocking):** the footer's privacy line could note that a small number of pages carry a first-party script, so "no cookies, no trackers" isn't misread as "no JavaScript anywhere."
4. **Watched, not fixed (Kai):** nav-weight differentiation between Search and Act is currently color-only; revisit if analytics (once s10 is wired up) show visitors treating them as equally weighted actions.

**Tradeoff table:**

| Choice | Gain | Cost | Carrier |
|---|---|---|---|
| Self-hosted Pagefind over a third-party search API | stays first-party, no new vendor, no cost | slightly heavier client payload than a hosted API, on the one page that uses it | Maren, Iris |
| Scope to /search only, not global | preserves zero-JS on every other page | search isn't reachable without a page load first (no omnipresent search bar) | Juno |
| Default Pagefind UI over the newer Component API | ships today, zero custom UI code | less visual/accessibility control than the framework's own docs recommend | Kai |
| Ship search now, at seven pages | cheap while the JS-exception ledger is still short | arguably not yet necessary at this content volume | Juno |

**Veto status:** no veto fired. All five personas confirm explicitly.

**Dissent (Kai):** no dissent — he explicitly downgraded his nav-weight concern to "worth watching" in Phase 2 and stated agreement with the shipped implementation. Recorded as "no dissent" per the persona brief's requirement to say so explicitly, and flagged for re-reading in a future review if a run like this recurs (a Kai who agrees with everyone is a caricature-drift signal per his own style manual) — in this case the agreement is load-bearing and specific (he named exactly what would change his mind: analytics showing equal-weight confusion), not a flattened "sounds good."

**Kill criterion:** if `bun run build` is ever changed to skip the `pagefind --site dist` step (checked via `package.json`'s `build` script matching `astro build && pagefind --site dist` verbatim) → search silently stops updating; this should fail a CI check comparing the deployed index's page count against the sitemap's URL count, once such a check exists (not built yet — named as a future gate, not a current one).

**Claim that most reshaped the proposal (Juno):** none of the five claims required the proposal to change — this is a legitimately low-conflict review, and the synthesis names that explicitly rather than manufacturing tension. The closest to reshaping was Rafe's Dockerfile-drift observation, which didn't change what shipped but added a named future maintenance owner.

**Residual risk I am accepting (Juno):** that a build-time-generated artifact (`dist/pagefind/`) has no test asserting it stays in sync with the site's actual page count — today's Dockerfile makes this safe, but nothing prevents a future edit from silently breaking it. I accept this because building that check now, for one search page on a seven-page site, is premature process for a problem that hasn't happened yet.

**Vote:** 5 proceed. Unanimous — flagged per protocol, and verified non-low-signal: Rafe's Dockerfile-drift point and Iris's footer-completeness point both landed as real, specific follow-ups (not restatements of agreement), and Kai's concession was reasoned and conditional rather than automatic.

## Core Takeaways
- A JS "exception" is honest exactly to the degree it's self-hosted, scoped, and named — Pagefind clears all three bars, which is why this review found no veto despite genuinely interrogating the tension with the site's core JS claim.
- Documentation honesty (the README's exception list) and experiential coherence (what a JS-disabled visitor actually encounters) are different tests; this site currently passes the first and has a minor, non-blocking gap in the second.
- Search earning its place before the site strictly needs it is a deliberate bet that the JS-exception ledger stays legible while it's still short, rather than needing retrofitting later under more scrutiny.

## Decision Memo
- recommended option: ship as-is, no blocking changes
- unresolved risks: none blocking; two non-blocking follow-ups (Dockerfile/README note on the build step, footer privacy-line clause)
- kill criterion: build script silently drops the pagefind step → stale/missing search index (no CI check exists yet to catch this automatically)
- rollout gates: none — already shipped and verified working (build produced a real index; a live query for "council" returned five correctly-ranked results in a manual test)
- rollback trigger: same as kill criterion, or a footer/README audit surfacing an actual visitor complaint about the noscript experience
- residual risk accepted by: Juno (no drift-detection test for the search index); Rafe (Dockerfile dependency named but not yet enforced in CI)
