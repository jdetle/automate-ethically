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

exec nginx -c /tmp/nginx.conf -g 'daemon off;'
