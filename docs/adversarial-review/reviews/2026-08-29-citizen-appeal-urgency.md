# Adversarial Review: citizen-appeal + urgency framing for automate-ethically.com

---
date: 2026-08-29
slug: citizen-appeal-urgency
mode: design-debate
status: proceed
scope: src/pages/index.astro, src/styles/site.css, copy register and evidence policy for the landing page
diff_base: origin/main
veto_fired: true
follow_up_open: false
caught_real_issue: pending
---

> **Update, 2026-08-29 (same day, later commit):** Kai's dissent below is
> closed. `/act` shipped with both a printable one-pager and a 2-minute
> council script — see
> [2026-08-29-action-ladder-accessibility.md](./2026-08-29-action-ladder-accessibility.md)
> for the review of that page.

## TL;DR
- decision: proceed — "evidenced urgency," not theatrical urgency
- key reason: attractiveness and honesty are not in tension; theatrical urgency and evidenced urgency are. Every dire signal ships as a verifiable number with a link.
- top unresolved risk: cited facts drift stale (owner: Rafe's FACTS.md registry, 6-month recheck rule)
- immediate next step: add sourced urgency section, plain-language pass on hero/manifesto, CTA sharpening; keep all DRAFT markers

## Debate Config
- evidence_rule: at least one of file/metric/repro/operational-risk per major claim
- max_turns_per_persona_per_phase: 2; max_claims_per_turn: 3

## Persona Roster
Personas: maren-shipper@v1, iris-auditor@v1, kai-explorer@v1, rafe-steward@v1, juno-mediator@v1
(loaded from jacquard `docs/adversarial-review/personas/`)

## Context pack
- Proposal (from John): "make this the most attractive possible site to the everyday citizen, ensure they understand that the situation is dire and something needs to happen quickly."
- Current state: v1 landing page shipped 2026-08-29 (`src/pages/index.astro`) — measured essayist register, 3-4 paragraph manifesto, three pillars, mailto CTA, ten `<!-- DRAFT: rewrite -->` blocks awaiting John's rewrite.
- Constraints: no fundraising language (README content rule); movement-first framing; zero client JS; no analytics; gold reserved for human accountability.
- Verified evidence available (checked 2026-08-29 via web search):
  - Flock ALPR in ~6,000 communities across 49 states; 50+ agencies canceled/suspended since Jan 2026 (Stateline via ipm.org 2026-08-17; Newsweek; NPR 2026-02-17).
  - US data-center electricity: 183 TWh (2024) projected to 426 TWh by 2030, ~133% growth; nearly half of all US electricity-demand growth to 2030 (IEA, Energy and AI).
  - 1,561 AI bills introduced in 45 states as of March 2026 (multistate.ai tracker; CDT); Montana HB 178 already mandates human review of AI-driven agency decisions.

## Phase 1 — Offense

**Maren (shipper).** Veto condition: no change that blocks or discards the ten open copy-rewrite tasks — they are the follow-up list, and a register change that rewrites all ten from scratch converts John's one-evening rewrite into a redesign. Claim she expects agreement on: the reading level is too high for the stated audience — `index.astro` manifesto runs 3 paragraphs averaging 25+ words/sentence before the first concrete image. Claim she expects rejection on: ship the urgency section today, before John's rewrite pass — the 2026 legislative session is the window (1,561 bills, 45 states), and a measured site during an open window is inventory sitting unmerged. Worst case: the movement asks citizens to show up in 2027 to influence laws that passed in 2026.

**Iris (auditor).** Veto condition — fired: **no urgency claim ships without a citation the reader can check, adjacent to the claim.** "The situation is dire" is a declared conclusion; a site that declares it without showing verified observables is indistinguishable from every outrage site it competes with. The repo's own postmortem is her artefact: jacquard README, adjacency section — a machine-written mechanism that was "fluent, confident, and wrong," where "careful scoping made it more persuasive, not less." Fluent urgency without evidence is the same failure at higher stakes. Second condition: no countdown timers, no manufactured scarcity, no unattributed statistics — the three verified facts above are sufficient and each carries a primary link. She distinguishes: the site may *show* 426 TWh (verified); it may not *say* "catastrophe is imminent" (declared).

**Kai (explorer).** Attacks the premise of the *current* page, from the visitor's chair: the screen argues calm. Muslin, 68ch essay measure, "Why now" in 12px eyebrow — you say the anger is correct, then paint serenity. The verbal argument and the visual argument disagree, and the visitor believes the pixels. Claim he expects agreement on: numbers should be the display type — "6,000 communities" at 76px is more honest *and* more arresting than any adjective. Claim he expects rejection on: the mailto CTA is a dead end for an everyday citizen — "start with one email" teaches the visitor that acting means composing prose to a stranger, and most will close the tab instead. A person who won't write an email would still print a page or read three sentences at a council meeting. Second-order effect: a site that converts anger into an unsent draft email teaches learned helplessness.

**Rafe (steward).** Every statistic added is a doc that must now track reality. 426 TWh is a projection that will be revised; Flock's community count moves monthly (50+ cancellations since January — the number cuts both ways). His artefacts: the two memory rules already in this project's orbit — "measure before claiming" and the README content rule. Conditions: (1) every fact in the markup carries its source link and an "as of" date; (2) a `FACTS.md` registry in-repo: claim → source URL → date checked → owner; (3) standing rule — any fact older than six months is rechecked or removed. Flags for the future: undated urgency copy ("before it's too late") is a trap — a site still shouting "the window is closing" in 2028 is the record that discredits the movement. Urgency must bind to dated observables ("the 2026 session").

**Juno (mediator).** Decision boundary: this review decides the landing page's register, visual hierarchy, and evidence policy. It explicitly does not decide: fundraising (standing prohibition), take-action tooling (v1.1), retraining content, analytics, PAC formation. She flags one scope-creep risk in the proposal itself: "most attractive possible" is unbounded — attractiveness is accepted as a constraint on presentation, not a license to change what the site claims.

## Phase 2 — Defense

**Maren.** Steelman of Iris: the strongest form of her veto is that one fabricated or dead-linked number costs the movement more credibility than ten measured paragraphs earn — and she's right, which is why sourcing is a merge gate, not a follow-up: the urgency section lands in the same commit as its citations or not at all. She accepts, and converts on the spot: FACTS.md ships in the same commit too. Residual risk she accepts by name: shipping machine-drafted urgency copy before John's rewrite means the site's most emotionally loaded section is temporarily not in his voice — mitigated by the DRAFT marker convention.

**Iris.** Steelman of Kai: the strongest version of his claim is that under-stating verified facts is also a fidelity failure — if the number is 6,000 communities and the page whispers it, the screen misreports the evidence. Accepted: display-type numbers are consistent with her gate; scale of presentation is honest when the number is. She discharges nothing yet: the veto stands until she sees citations adjacent to claims in the shipped markup. On Kai's CTA attack she is silent — not her seat.

**Kai.** Steelman of Rafe: the strongest version is that vivid dated numbers rot into vivid wrong numbers, and a big wrong number is a bigger lie than a small one. Accepted — he trades: display-type numbers get the "as of" date rendered visibly, not hidden in a title attribute. He answers Maren's rejection-claim directly: he agrees urgency ships now — his dissent is not timing, it is the CTA. He concedes the mechanism partially: v1 has no backend, so mailto is what exists; he holds the dissent (below) rather than blocking.

**Rafe.** Steelman of Maren: the strongest version of "ship now" is that the maintenance cost of a stale fact is real but bounded, while the cost of missing the 2026 session is unbounded — a law passed without a human-review clause is permanent surface. Accepted. He attaches himself as owner of FACTS.md and the 6-month recheck. Residual risk he accepts by name: projections (426 TWh) will be revised and the site may briefly display superseded numbers between rechecks.

**Juno.** Steelman of the proposal itself: the strongest version of John's ask is not "make it scary" — it is that a movement site that only persuades people who already read 10,000-word essays has failed its stated audience, and the current page is that site. Accepted as the reshaping constraint.

## Phase 3 — Synthesis

**Merged proposal — "evidenced urgency" (single option):**

1. **Urgency section ("The clock is the rulebook")** between manifesto and pillars: three display-type numbers — 6,000 communities / 426 TWh by 2030 / 1,561 bills in 45 states — each with visible primary-source link and "as of" date. Framing line binds urgency to a dated observable: the 2026 legislative session is writing the rulebook now.
2. **Plain-language pass** on hero sub and manifesto: shorter sentences, concrete nouns first, target general-audience readability; manifesto compressed toward its images (cameras, data centers, rulebook), not its abstractions.
3. **Visual escalation within the textile grammar:** stat numerals in serif display sizes, madder underline stitches; no new colors; gold remains reserved (untouched).
4. **CTA sharpened, mechanism unchanged (v1):** stronger imperative copy, friction named honestly ("one email, one hour a month"); Kai's dissent recorded, not absorbed.
5. **FACTS.md** registry ships in the same commit (Rafe owner).
6. All ten DRAFT markers preserved; the new section gets its own DRAFT marker and a new copy task (task 11).

**Tradeoff table:**

| Choice | Gain | Cost | Carrier |
|---|---|---|---|
| Sourced numbers over adjectives | credibility, differentiation from outrage sites | maintenance (recheck rule) | Iris / Rafe |
| Ship before John's rewrite | inside the 2026 window | machine voice temporarily in the loudest section | Maren |
| Keep mailto CTA in v1 | zero backend, ships today | conversion loss at the decisive moment | Kai (dissent) |
| Dated urgency ("2026 session") | ages honestly | less viscerally alarming than undated doom | Rafe |

**Veto status:** Iris vetoed on unsourced urgency claims — **resolved by** the citation-adjacent-to-claim gate and FACTS.md landing in the same commit. She notes the veto re-fires automatically if a future edit adds a number without a link or removes a citation while keeping its claim.

**Dissent (Kai, minority):** the mailto CTA is an inadequate action for the stated audience. Trigger condition to close: v1.1 take-action page ships with at least one lower-friction action (printable one-pager or council-meeting script). Stays open across reviews until met. **Closed 2026-08-29** — `/act` shipped with both.

**Kill criterion:** any published fact found incorrect, materially superseded, or source-dead → corrected or removed within 48 hours of discovery. Any fact that cannot be re-verified at its 6-month recheck comes down with its claim. (No analytics exist by design, so the criterion binds to fact integrity, not traffic.)

**Claim that most reshaped the proposal (Juno):** Iris's verified-vs-declared distinction — it converted "ensure they understand the situation is dire" from an instruction to *assert* direness into an instruction to *show* three verified numbers large enough that the reader concludes it themselves. Kai's premise attack (the pixels argue calm while the words argue urgency) supplied the form of the fix.

**Residual risk I am accepting (Juno):** the site now carries claims that age — between six-month rechecks it may briefly display superseded numbers, and the loudest section of the page is temporarily machine-drafted pending John's rewrite. I accept both, bounded by the 48-hour kill criterion and the DRAFT markers.

**Vote:** 5 proceed (Kai: proceed-with-recorded-dissent). Not unanimous-flat; unanimity flag not triggered.

## Core Takeaways
- Verified numbers, shown large, are both the most attractive and the most honest form of urgency available to this site.
- Evidence handling is now policy: citation adjacent to claim, FACTS.md registry, 6-month recheck, 48-hour correction.
- The everyday citizen is the audience of record; readability is a constraint on every future copy edit, including John's rewrite pass.

## Decision Memo
- recommended option: evidenced urgency (single merged option above)
- unresolved risks: fact staleness between rechecks; CTA conversion (Kai's open dissent)
- kill criterion: wrong/superseded/source-dead fact → fix or remove within 48h; unverifiable at recheck → remove
- rollout gates: citations land in the same commit as claims; FACTS.md in same commit; all DRAFT markers preserved
- rollback trigger: same as kill criterion (content-level; no traffic metrics exist by design)
- residual risk accepted by: Juno (staleness window, machine-drafted urgency pending rewrite); Rafe (projection revisions)
