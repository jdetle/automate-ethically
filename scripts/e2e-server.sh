#!/usr/bin/env bash
# Builds and serves the site for Playwright, using Cloudflare's official
# test Turnstile keys — never the real production sitekey/secret.
#
# Why test keys, not the real widget: Turnstile is *designed* to be
# unpassable by real browser automation (that's the entire point of a bot
# check). A Playwright run against the real widget can only ever prove "this
# looks like a bot" — worse, repeatedly hammering the real widget from
# automation risks poisoning its risk score for real visitors sharing that
# IP/browser fingerprint, which is what happened investigating the bug this
# test exists to catch (see docs/guide-red-team-tests.md's neighbor,
# CHANGELOG-worthy but not filed as a separate doc: never drive the real
# /guide Turnstile widget with scripted browser tools again).
#
# Test sitekey/secret pair (public, documented, safe to commit):
# https://developers.cloudflare.com/turnstile/troubleshooting/testing/
set -euo pipefail

export PUBLIC_TURNSTILE_SITE_KEY="1x00000000000000000000BB" # invisible, always passes
bun run build

export TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA" # always passes
# Real keys, if the caller set them (for a genuine live-reply assertion —
# see tests/guide.e2e.spec.ts), otherwise a harmless placeholder so the
# server still considers itself "configured" and exercises its real
# Anthropic/OpenAI call paths (which will then fail cleanly upstream, which
# is itself part of what the test checks).
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-test-fake-key}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-test-fake-key}"
export HOST=127.0.0.1
export PORT="${PORT:-4322}"
exec node dist/server/entry.mjs
