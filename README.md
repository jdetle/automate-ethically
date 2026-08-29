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
  political committee exists until one does.
- **Gold is a human's hands.** The `--ae-gold` token is reserved for content whose
  subject is human accountability. If you need a warm accent, use madder.
- Copy blocks marked `<!-- DRAFT: rewrite -->` are machine drafts awaiting a
  rewrite in John's own words.

## Development

```
bun install
bun run dev        # localhost:4321
bun run build      # static output in dist/
bun run preview
bun run lint
```

Astro static output, zero client JavaScript, hand-written CSS (no Tailwind).
Light theme is the default (a broadside is printed on paper); dark tracks
`prefers-color-scheme` and converges toward jacquard's indigo denim.

## Deploy

Cloudflare Pages, production branch `main`, build command `bun run build`,
output directory `dist`. Custom domain: automate-ethically.com (apex), with
`www` 301-redirecting to the apex.
