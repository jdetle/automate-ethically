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

JSON-LD (`<script type="application/ld+json">`) is inert data, not executable
script, and doesn't count against this rule.

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
`s10`). CI (`.github/workflows/ci.yml`) runs lint + build on every PR and push;
the deploy workflow (`.github/workflows/deploy-azure.yml`) runs on push to
`main` and via manual dispatch.

Custom domain: `automate-ethically.com`. **As of 2026-08-29 the apex binding is
disabled in ACA** — only `www.automate-ethically.com` has a working managed
certificate, while `astro.config.mjs`, canonical URLs, and the sitemap all
assert the bare apex. This needs a real fix (bind + validate a managed cert for
the apex, or flip `site` to the `www` host) before search engines or shared
links can trust the canonical URL — tracked as an open item, not yet resolved
by this change.

Repository secrets required for deploy: `AZURE_CREDENTIALS` (a deploy service
principal with Contributor on `sub-platform`), `PLATFORM_ACR`
(`acrplatform….azurecr.io`).
