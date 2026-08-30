#!/bin/sh
# Renders nginx.conf.template with the ingest credential supplied at runtime.
#
# The key arrives as a Container Apps secret in S10_INGEST_KEY. It is written
# only to /tmp/nginx.conf inside this container: never into the image, never
# into git, and never into a page. A browser cannot keep a secret, so the
# browser is not given one — the beacon posts unauthenticated to our own
# origin and nginx attaches the credential on the way out.
#
# `sed` rather than `envsubst`: envsubst would also expand nginx's own $uri,
# $host and $http_referer into empty strings and quietly produce a broken
# config. A single named placeholder cannot do that.
set -eu

: "${S10_INGEST_KEY:=}"

# Escape characters that are special on the right-hand side of s|||.
ESCAPED=$(printf '%s' "$S10_INGEST_KEY" | sed -e 's/[\\&|]/\\&/g')

umask 077
sed "s|__S10_INGEST_KEY__|${ESCAPED}|g" \
    /etc/nginx/nginx.conf.template > /tmp/nginx.conf

if [ -z "$S10_INGEST_KEY" ]; then
    # Say so once, loudly, in the log. The beacon still posts and the ingest
    # answers 401, which the page ignores by design — but "analytics are
    # silently going nowhere" should be discoverable from the logs rather
    # than inferred weeks later from an empty dashboard.
    echo "nginx: S10_INGEST_KEY is unset; telemetry will be rejected upstream" >&2
fi

# The Node server backs exactly one route (/api/guide — everything else is
# static files nginx serves directly). It listens on loopback only; nginx is
# the one client and proxies to it (see nginx.conf.template). No real process
# supervisor here — this is a small, occasional-traffic route, not the
# request path most visitors ever touch — but a bare `node ... &` with no
# restart would mean one crash silently kills the guide for the rest of the
# container's life, so a minimal respawn loop runs in the background instead.
export HOST=127.0.0.1
export PORT=8081
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo "guide: ANTHROPIC_API_KEY is unset; /api/guide will answer 503" >&2
fi
(
    while true; do
        node /app/server/entry.mjs
        echo "guide: server exited (code $?); restarting in 2s" >&2
        sleep 2
    done
) &

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
