# automate-ethically.com — static Astro site behind nginx.
#
# Base images come from mirror registries (public.ecr.aws), not Docker Hub:
# `az acr build` runs from Azure IPs, where anonymous Docker Hub pulls hit
# Cloudflare challenges and rate limits. Same reasoning as jacquard's
# Dockerfile.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
WORKDIR /app

# Bun is the package manager of record (bun.lock); the npm package ships the
# binary, which keeps the build on a mirrored base image.
RUN npm install -g bun@1.3.10

# Manifests first so the dependency layer caches across content edits.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build
# `build` runs `astro build && pagefind --site dist/client` — if this ever
# changes to invoke `astro build` alone, search silently stops indexing new
# pages. `dist/client` (not `dist`) is where static output lands once an
# adapter is configured — `dist/server` alongside it is the one on-demand
# route (`/api/guide`, per `export const prerender = false`); everything
# else still prerenders to plain HTML exactly as before.

FROM public.ecr.aws/nginx/nginx:alpine

# nginx still serves every static page directly, same as always. The one
# addition is a Node runtime to run the single on-demand route's server
# bundle (dist/server/entry.mjs, from @astrojs/node in standalone mode) —
# nginx proxies just `/api/` to it (see nginx.conf.template) and serves
# everything else as files, same as before this route existed.
RUN apk add --no-cache nodejs npm && npm install -g bun@1.3.10

# @astrojs/node's server bundle does NOT inline its own runtime deps
# (astro core, sharp, unstorage, zod, @anthropic-ai/sdk, ...) — Rollup
# leaves them as bare imports and Astro's own docs expect node_modules to
# ship alongside dist/server. This install runs natively on Alpine/musl
# rather than copying node_modules from the Debian build stage: sharp
# resolves a platform-specific prebuilt binary at install time, and a glibc
# build copied onto musl fails at container start, not at image build time —
# exactly the kind of failure that's invisible until the route is actually
# called. --production skips devDependencies (biome, pagefind's CLI, three's
# type stubs) that the server never imports.
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Full config replacement: the stock config listens on 80 as root. This one
# listens on 8080 and keeps pid/temp files in /tmp so the nginx user can run
# the whole thing.
#
# The config ships as a template because the s10 ingest credential is injected
# at container start from a Container Apps secret. Baking it into the image
# would put a live credential in every layer in the registry.
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

COPY --from=build /app/dist/client /usr/share/nginx/html
COPY --from=build /app/dist/server /app/server

USER nginx
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
