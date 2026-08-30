# automate-ethically.com

The home of a movement for ethical automation: technology and policy where a human
always makes the decision, and is accountable for it.

> The loom did not remove the weaver. A person still chose the pattern, punched the
> cards, examined the cloth, and signed the bolt.

Three pillars:

1. **Organize** — local-to-state political action for human-in-the-loop laws.
2. **Build ethically** — software where accountability is enforced by the build,
   not by policy ([jacquard](https://jdetle.com), [phantom-thread](https://jdetle.com/phantom-thread)).
3. **Retrain** — help people learn the next field while they still have the job
   that is going away.

## Content rules

- **No fundraising language.** The site must never solicit or imply solicitation of
  money. Soliciting contributions triggers FEC/state PAC registration and
  disclaimer requirements. A future donate feature is a legal project first.
- **The PAC is a goal, not an entity.** Do not write anything implying a registered
  political committee exists until one does. That sentence lives on `/about` and is
  referenced, never paraphrased.
- **Gold is a human's hands.** The `--ae-gold` token is reserved for content whose
  subject is human accountability. If you need a warm accent, use madder.
- **Evidence policy** (see `FACTS.md`): a citation must appear adjacent to its
  claim in the markup — a number without a link does not ship. Every fact is
  rechecked within 6 months of "last checked" or removed; a fact found wrong,
  materially superseded, or source-dead is corrected or removed within 48 hours.
  No countdown timers, no manufactured scarcity, no undated doom copy. This
  applies to printed artifacts and share images too, not just the HTML page.
- Copy blocks marked `<!-- DRAFT: rewrite -->` are machine drafts awaiting a
  rewrite in John's own words. Blocks marked `<!-- LEGAL-REVIEW: pending -->`
  (the model ordinance) are not a voice task — they need an actual attorney, and
  must never be presented as legal advice in the interim.
- **Action Network compliance checklist**, run before linking any AN page or form:
  donation asks OFF on every AN page type; post-action redirect points back to
  `/act#next` (bypasses AN's default "share and chip in" screen); page copy
  reuses only approved site language; sender identity is "Automate Ethically"
  with John's identity in the footer — never a committee name.

## JavaScript policy

Zero client JavaScript is the default on every page — this is a deliberate part
of the site's argument: a campaign against unaccountable automated systems runs
essentially none of its own. Two narrow, named exceptions:

1. A small first-party pageview beacon (inline `<script>` in `Base.astro`) that
   POSTs to our own [s10](#analytics-s10) instance. No third-party origin, no
   persistent identifier (no `localStorage`), no DOM/input capture.
2. The Action Network form embed, scoped to `/act` only, with a `<noscript>`
   link-out to the AN-hosted page so the page still works without JS.
3. Full-text search on `/search`, via [Pagefind](https://pagefind.app) — its
   index and UI script are generated at build time and served from our own
   domain, not fetched from a third party. Scoped to that one page; the rest
   of the site works with search unavailable.
4. A Three.js point-cloud figure on `/guide` (`src/components/GuideOrb.astro`)
   that visualizes the conversation with the local-organizing guide below.
   Dynamically imported — the ~190KB gzipped bundle never loads on any other
   page — and falls back to a static SVG mark if WebGL is unavailable or
   `prefers-reduced-motion` is set. The conversation itself, in plain text,
   never depends on it.

JSON-LD (`<script type="application/ld+json">`) is inert data, not executable
script, and doesn't count against this rule.

## The local-organizing guide (`/guide`)

The one page on this site with a real backend. `src/pages/api/guide.ts` is
Astro's single on-demand route (`export const prerender = false`) — every
other page is still plain prerendered HTML; see the adapter note in
`astro.config.mjs`.

- **Model:** `claude-opus-5` via `@anthropic-ai/sdk`, with the built-in
  `web_search_20260209` tool so it can find what's actually organizing near
  someone rather than inventing it. The system prompt is explicit and
  non-negotiable: never solicit money or use fundraising language, never
  imply a PAC exists, never invent a specific group/meeting/contact, and say
  plainly when a search finds nothing — the same anti-hallucination
  discipline FACTS.md holds the rest of the site to, applied to a model that
  can otherwise sound confident while being wrong.
- **Location is asked in conversation, never stored** — consistent with the
  rest of the site's no-persistent-data stance (see the footer's privacy
  line). Each conversation's history lives only in the browser tab.
- **Streamed** (Server-Sent Events) so replies appear as they're generated.
- **Voice, opt-in and real:** `src/pages/api/speech.ts` proxies OpenAI TTS
  (`tts-1`, 24kHz mono PCM), streamed the same way jacquard's Cedar does —
  the client (`src/lib/speech-playback.ts`) schedules audio as it arrives
  and analyzes the actual output with a Web Audio `AnalyserNode`, so the orb
  breathes on real amplitude and a real 12-band spectrum while the guide
  talks, not a simulated one. Silent by default (a "voice on/off" toggle
  appears only once `/api/speech` reports itself configured); the choice is
  remembered in `localStorage`, not a cookie. If speech isn't configured or
  an OpenAI call fails, playback falls back to `guide-orb-state.ts`'s
  text-arrival pulse — the conversation never depends on audio working.
- **Cost and abuse controls**, in `guide.ts`/`speech.ts`/`api-limits.ts`: a
  hard daily token budget (text) and a separate daily character budget
  (speech) across all visitors, a per-visitor daily conversation cap, and an
  nginx-level request-rate limit in front of both routes. All of these are
  in-memory and reset if the container restarts or scales past one replica —
  a real, documented limitation, not a hidden one; a shared store (e.g. the
  s10 Postgres instance) is the natural upgrade if traffic ever makes that
  assumption wrong.
- **Requires `ANTHROPIC_API_KEY`** (text) **and, optionally, `OPENAI_API_KEY`**
  (voice) as Container Apps secrets (see Deploy below). Without the first,
  `/api/guide` answers `503`; without the second, the guide works in text
  only, silently. Every other page is unaffected either way.

## Analytics: s10

We track how the site performs — which pages get read, roughly how many
people visit — but we expunge anything that could identify a visitor before
it's ever stored. This runs on [s10](https://github.com/jdetle) (John's
in-house observability platform, already live in `rg-platform`/`cae-platform`)
rather than a third-party product — consistent with the site's argument that
people, not opaque systems, should be accountable for what's collected.
Concretely:

- We register `automate-ethically` as an s10 tenant and use a **minimal
  hand-written pageview beacon**, not the full `@jdetle/s10-web` SDK — the SDK
  sets a never-expiring `localStorage` identifier and auto-captures DOM
  breadcrumbs by default, which we don't want on this site.
- The beacon POSTs one envelope per pageview (path, referrer, screen-width
  bucket) to `/telemetry/` on our own origin, which nginx proxies to
  `ca-s10-ingest`. The path is intentionally not obfuscated — an ad-blocker
  that blocks it should block it; the footer says so.
- **The ingest key is never sent to the browser.** The beacon posts
  unauthenticated to our own origin; nginx attaches
  `Authorization: Bearer …` on the way out, reading the key from the
  `S10_INGEST_KEY` Container Apps secret at container start
  (`docker-entrypoint.sh` renders `nginx.conf.template`). The key is therefore
  absent from the page, from git, and from the image layers. An earlier
  revision baked it into the static bundle via `PUBLIC_S10_INGEST_KEY` and
  documented that as an accepted risk; it is not one, because a published
  credential is a credential anyone can use, and it was replaced rather than
  accepted.
- The relay is scoped to exactly `POST /telemetry/v2/envelopes`, capped at a
  4 KB body and 30 requests/minute per forwarded client, and forwards none of
  the caller's own headers. The previous `location /telemetry/` prefix passed
  any method and any path straight through, which made this site a free
  amplifier into the ingest service for anyone who found it.
- Conversion — signups, petition signatures — is measured by Action Network's
  own dashboard via `?source=` codes on every CTA, not by s10. s10 answers "how
  many people read this," AN answers "how many people acted."
- Setup: `platform/scripts/register-app-observability.sh --tenant
  automate-ethically`, then verify the printed ingest key against the
  `s10_ingest_<tenant>_…` prefixed format (a past integration silently 401'd on
  a bare-hex key — the deploy workflow asserts a real `200`/`accepted` response
  to catch this before it ships quietly broken).

## Printable materials

The organizing toolkit's one-pager and council script are HTML pages with a
print stylesheet (`src/styles/print.css`), not generated PDFs — one source of
truth, so a fact recheck can't leave the PDF stale while the page updates. When
either page's content changes materially:

1. Open the page, use the browser's print-to-PDF.
2. Overwrite `public/downloads/one-pager.pdf` or `public/downloads/council-script.pdf`.
3. Bump the `updated` date visible on the page (and in the printed document).

## Development

```
bun install
bun run dev        # localhost:4321
bun run build      # static output in dist/
bun run preview
bun run lint
```

Astro static output, zero client JavaScript by default (see above), hand-written
CSS (no Tailwind). Light theme is the default (a broadside is printed on paper);
dark tracks `prefers-color-scheme` and converges toward jacquard's indigo denim.

## Deploy

Azure Container Apps. `az acr build` builds the image on ACR (no Docker daemon
needed on the runner) and pushes it as `automate-ethically:<sha7>` to the
platform ACR; `az containerapp update` rolls `ca-automate-ethically` in
`rg-platform` (shared `cae-platform` environment, alongside `jacquard` and
`s10`). CI (`.github/workflows/ci.yml`) runs lint + typecheck (`astro check`)
+ build on GitHub-hosted `ubuntu-latest` on every PR and push; the deploy
workflow (`.github/workflows/deploy-azure.yml`) runs on push to `main` and
via manual dispatch, on the platform's shared **self-hosted runner fleet**
(`runs-on: [self-hosted, linux, x64, azcaj]` — an Azure Container Apps Job,
scale-to-zero, defined in `jdetle/platform`'s `infra/modules/platform-runners.bicep`).

The container runs two processes: nginx (everything, as always) and a small
Node server that backs only `/api/guide` (`docker-entrypoint.sh` starts both;
nginx proxies just that one path — see `nginx.conf.template`). Astro's Node
adapter ships its own runtime dependencies unbundled (Astro core, `sharp`,
`@anthropic-ai/sdk`, ...), so the image installs a production-only
`node_modules` natively inside the Alpine final stage rather than copying it
from the Debian build stage — `sharp` resolves a platform-specific prebuilt
binary at install time, and copying a glibc build onto musl fails at
container start, not at build time.

Auth is **OIDC federated credentials**, not a stored secret:
`sp-automate-ethically-deploy` trusts only
`repo:jdetle/automate-ethically:ref:refs/heads/main`, and holds only
`AcrPush`/`Contributor` on the shared platform ACR plus `Contributor` scoped
to `ca-automate-ethically` itself — not the whole shared `rg-platform`.

**Two manual, one-time GitHub-UI steps the self-hosted runner depends on**
(cannot be done via API with a normal token — GitHub App installation and
fine-grained PAT repository-access edits both require the web UI):
1. Install/configure the `platform-ci-runner` GitHub App on this repo.
2. Add `jdetle/automate-ethically` to the `gh-runner-pat` fine-grained PAT's
   repository access list.

Until both are done, pushes to `main` queue a job that never gets picked up.

Custom domain: `automate-ethically.com`. Both the apex and `www` have working
managed certificates (`mc-ae-apex-v3`, `mc-cae-platform-www-automate-eth-5125`)
as of 2026-08-30 — `astro.config.mjs`'s canonical `site` correctly matches
the live apex.

Repository secrets required for deploy — **none of these are set yet** (a
tool-permission guard blocked writing them from an automated session, by
design; they need to be set by hand, once, via `gh secret set <name>` or the
repo's Settings → Secrets UI):

| Secret | Value |
|---|---|
| `AZURE_CLIENT_ID` | `7a850e7a-9bef-411b-8d99-5ffb0c8abf16` (`sp-automate-ethically-deploy`'s app/client ID) |
| `AZURE_TENANT_ID` | `9beece34-c503-42bd-a6fe-b9f3e1c49a84` |
| `AZURE_SUBSCRIPTION_ID` | `353120d8-595d-4932-9127-df947b1c3f9d` |
| `PLATFORM_ACR` | `acrplatform732abfgsg2zsg.azurecr.io` |
| `ANTHROPIC_API_KEY` | (see [the guide's section above](#the-local-organizing-guide-guide)) — set directly on the live container as of 2026-08-30 |
| `OPENAI_API_KEY` | optional — powers the guide's voice; text works without it |

Until `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID`/`PLATFORM_ACR`
are set, the deploy workflow's `azure/login` step fails immediately — it
isn't just the two GitHub-UI runner steps above. The site itself is
unaffected: every deploy so far has gone out via direct `az cli` calls,
verified live, while this pipeline was being built.
