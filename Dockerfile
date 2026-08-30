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
# `build` runs `astro build && pagefind --site dist` — if this ever changes
# to invoke `astro build` alone, search silently stops indexing new pages.

FROM public.ecr.aws/nginx/nginx:alpine

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

COPY --from=build /app/dist /usr/share/nginx/html

USER nginx
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
