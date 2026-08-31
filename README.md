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
essentially none of its own. A short, named list of exceptions:

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
5. Cloudflare Turnstile, also on `/guide` only — the one *third-party-origin*
   script on the site (`challenges.cloudflare.com`; every exception above is
   self-hosted or same-origin). It's the human-verification gate in front of
   the two routes that spend real money per call — see the guide's section
   below for why this one gets a CSP exception nowhere else does.

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
- **Verified once per session, not once per message.** One Turnstile pass is
  traded at `/api/session` for a short-lived signed token
  ([`src/lib/guide-session.ts`](src/lib/guide-session.ts)) that `/api/guide`
  and `/api/speech` accept. The earlier design minted a fresh Turnstile token
  per API call — one per message plus one per spoken reply — which Cloudflare's
  managed widget correctly reads as scripted traffic and answers with an
  interactive challenge in front of every single message. The security bar is
  unchanged: nothing reaches a paid API without a real Turnstile pass first.
- **A system prompt is an instruction, not a guarantee.**
  `src/lib/guide-guardrails.ts` is the code-level backstop: an input
  heuristic that quietly flags likely jailbreak phrasing (logged, never
  blocking — see the file for why), and an output guardrail that scans the
  model's own streamed reply and can kill it mid-sentence if it crosses the
  fundraising or PAC-existence line, regardless of how it got talked into
  trying. [`docs/guide-red-team-tests.md`](docs/guide-red-team-tests.md) is
  the adversarial test plan for this — read it before touching the system
  prompt or the guardrail regexes.
- **Location is asked in conversation, never stored** — consistent with the
  rest of the site's no-persistent-data stance (see the footer's privacy
  line). Each conversation's history lives only in the browser tab.
- **Suggested prompts, seeded from a disclosed, throwaway location guess.**
  `src/pages/api/geo.ts` resolves the visitor's IP from forwarded headers and
  makes one lookup against [ipapi.co](https://ipapi.co) (free, keyless — the
  same technique jdetle.com's `/who-are-you`/`/api/edge-detect` already use,
  scoped down to just city/region/country) to fill in five clickable
  starter prompts ("What's organizing around Denver, CO right now?"). The
  guess is never presented as fact — it's labeled "Guessing you're near..."
  with a one-click "change it," never logged, never stored (a short in-memory
  TTL cache exists only to avoid hammering ipapi.co's free tier on a reload,
  and holds nothing on disk). Private/local IPs and lookup failures fall back
  to generic "your area" phrasing rather than blocking anything.
- **Streamed** (Server-Sent Events) so replies appear as they're generated.
- **Voice, opt-in and real:** `src/pages/api/speech.ts` proxies OpenAI TTS
  (`gpt-4o-mini-tts`, voice `cedar`, 24kHz mono PCM), streamed the same way
  jacquard's Cedar does —
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
- **Gated by Cloudflare Turnstile, and gated *closed*.** Both routes verify a
  fresh Turnstile token (`src/lib/api-limits.ts`'s `verifyTurnstile`) before
  doing anything that costs money, and an unconfigured `TURNSTILE_SECRET_KEY`
  is treated as a failed check, not a skipped one — `/api/guide` and
  `/api/speech` both answer `503` regardless of whether the Anthropic/OpenAI
  keys are set. This is the one deliberate third-party-script exception on
  the site (`challenges.cloudflare.com`, named in the CSP comment in
  `nginx-security-headers.conf`) — Turnstile has to load from Cloudflare's
  own edge to mean anything. A fresh token is minted client-side
  (`turnstile.execute()`) before every single call to either route, not once
  per page load or per conversation.
- **Requires `ANTHROPIC_API_KEY`** (text) **and, optionally, `OPENAI_API_KEY`**
  (voice) as Container Apps secrets, **plus `TURNSTILE_SECRET_KEY` and
  `PUBLIC_TURNSTILE_SITE_KEY`** (see Deploy below — the site key is a
  build-arg, not a runtime secret, since Vite has to inline it into the
  client bundle). Without `TURNSTILE_SECRET_KEY`, neither route runs at all.
  Without `ANTHROPIC_API_KEY`, `/api/guide` answers `503`. Without
  `OPENAI_API_KEY`, the guide works in text only, silently. Every other page
  is unaffected regardless of any of these.

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

## Caching

Two layers, both aimed at not paying twice for the same bytes.

**Prompt caching (Anthropic).** `/api/guide` sends its system prompt as two
blocks with a `cache_control` breakpoint on the stable one, so the ~900-token
system prompt and the web-search tool definition are cached across turns
rather than re-sent at full price on every message. The injection
reinforcement is a separate block *after* the breakpoint on purpose: appending
it would make the cached prefix depend on whether a given message looked
suspicious, and one adversarial visitor would evict the entry for everyone.
Each reply logs `guide: usage in=… out=… cache_read=… cache_write=…`, so a
cache that has quietly stopped working shows up in the logs rather than in a
bill weeks later — `cache_read` pinned at 0 across consecutive turns means
something is invalidating the prefix. Cached input is billed at roughly a
tenth of normal, and the daily token budget discounts it accordingly.

**Speech cache (ours).** Identical text produces byte-identical audio, so
`/api/speech` keys a byte-bounded LRU on `sha256(model + voice + text)` and
serves repeats from memory: no OpenAI call, and no spend against the daily
character budget. The response carries `X-Speech-Cache: hit|miss`. On a miss
the upstream stream is teed rather than buffered, so audio still starts as
fast as the model produces it while a copy accumulates; a stream that errors
or is abandoned stores nothing, because a truncated entry would serve a
sentence that stops mid-word for as long as it lived. In-memory and
per-process, like the budget counters — it resets on restart and is not shared
across replicas, which is fine because the cache is an optimisation and never
a correctness requirement.

**Deliberately not cached: guide answers themselves.** Replies are
location-personalised and built from live web search, so serving a stored
answer would mean showing one town's meeting to another town, or last month's
council agenda as current. On a site whose entire argument is that automated
decisions should be answerable, quietly replaying a stale civic answer is the
wrong trade. Prompt caching gets most of the saving without any of that risk.

## Deploy

Azure Container Apps. `az acr build` builds the image on ACR (no Docker daemon
needed on the runner) and pushes it as `automate-ethically:<sha7>` to the
platform ACR; `az containerapp update` rolls `ca-automate-ethically` in
`rg-platform` (shared `cae-platform` environment, alongside `jacquard` and
`s10`). CI (`.github/workflows/ci.yml`) runs lint + typecheck (`astro check`)
+ build on GitHub-hosted `ubuntu-latest` on every PR and push; the deploy
workflow (`.github/workflows/deploy-azure.yml`) runs on push to `main` and
via manual dispatch, also on `ubuntu-latest`.

It used to run on the platform's shared self-hosted fleet
(`runs-on: [self-hosted, linux, x64, azcaj]`, an Azure Container Apps Job
defined in `jdetle/platform`'s `infra/modules/platform-runners.bicep`), but no
runner was ever registered against this repo, so every deploy run queued on
that label and was cancelled — the site was only ever updated by hand. Nothing
in the job needs a self-hosted runner: `az acr build` builds server-side in
ACR, the ACR is publicly reachable, and the OIDC federated credential is
scoped to repo and ref rather than to the runner. Moving back to the fleet
means restoring `runs-on` and completing the two manual GitHub-UI steps noted
at the top of the workflow.

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

### Handling secrets: rules learned the hard way

A corrupted `ANTHROPIC_API_KEY` reached production and broke the guide for
real visitors. The key had been copied out of a `.env` file whose values are
quoted (`KEY="sk-ant-…"`) with a shell one-liner that split on `=` and kept
everything after it — including the quote characters. Every safeguard passed,
because every safeguard only asked *"is this variable set?"*, and it was set,
just wrong. Rules that follow from it:

1. **Presence is not health.** Never treat a non-empty env var as a working
   credential. The only proof a key works is spending it against the real API
   — that is what `scripts/smoke-prod.sh` does, and it must be run after every
   production deploy.
2. **Normalise secrets where they enter the process.** All secret reads go
   through [`readSecret()`](src/lib/env.ts), which strips whitespace and one
   matching pair of surrounding quotes. Quoting, stray newlines, and trailing
   whitespace are the normal failure modes of moving a secret by hand between
   a file, a terminal, a CI store, and a container; none are recoverable at
   request time and all are trivial to neutralise once.
3. **Never move a secret with `cut -d '=' -f2-`.** It keeps quotes. Strip
   them, or read the file with a parser that understands the format.
4. **A credential failure must never render as "try again in a moment."**
   A 401/403 from an upstream API fails identically forever; saying otherwise
   is false, and it disguises a broken deploy as intermittent flakiness. These
   surface a distinct message and are tagged fatal in Sentry.

Repository secrets required for deploy (`gh secret set <name>` or the repo's
Settings → Secrets UI — always piped directly from wherever the value lives,
never typed in by hand):

| Secret | Value |
|---|---|
| `AZURE_CLIENT_ID` | `7a850e7a-9bef-411b-8d99-5ffb0c8abf16` (`sp-automate-ethically-deploy`'s app/client ID) |
| `AZURE_TENANT_ID` | `9beece34-c503-42bd-a6fe-b9f3e1c49a84` |
| `AZURE_SUBSCRIPTION_ID` | `353120d8-595d-4932-9127-df947b1c3f9d` |
| `PLATFORM_ACR` | `acrplatform732abfgsg2zsg.azurecr.io` |
| `ANTHROPIC_API_KEY` | (see [the guide's section above](#the-local-organizing-guide-guide)) |
| `OPENAI_API_KEY` | optional — powers the guide's voice; text works without it |
| `TURNSTILE_SECRET_KEY` | required — without it, both `/api/guide` and `/api/speech` refuse to run, even if the two keys above are set |
| `PUBLIC_TURNSTILE_SITE_KEY` | required (build-arg, not a runtime secret — see the guide's section above) — the widget never renders without it, which has the same fail-closed effect from the other direction |
| `SENTRY_DSN` | optional — server-side error tracking for the three on-demand routes ([`src/lib/sentry.ts`](src/lib/sentry.ts), `@sentry/node` only, no browser SDK); silently no-ops without it |

A note on `import.meta.env` vs `process.env` for anything in this table: the
Node-adapter server bundle statically inlines non-`PUBLIC_`-prefixed
`import.meta.env.X` reads at *build* time, same as it does for
`PUBLIC_`-prefixed client vars — it is not a dynamic runtime read. Every
secret above except `PUBLIC_TURNSTILE_SITE_KEY` is read via `process.env.X`
in the route/lib code specifically so a value set only at container runtime
(the whole point of a Container Apps secret) is actually seen.

Until `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID`/`PLATFORM_ACR`
are set, the deploy workflow's `azure/login` step fails immediately — it
isn't just the two GitHub-UI runner steps above. The site itself is
unaffected: every deploy so far has gone out via direct `az cli` calls,
verified live, while this pipeline was being built.
