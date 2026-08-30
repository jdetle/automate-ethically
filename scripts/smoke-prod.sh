#!/usr/bin/env bash
# Post-deploy smoke test. Run this after EVERY production deploy.
#
# Why this exists: a corrupted ANTHROPIC_API_KEY (surrounding quote characters
# copied along with the value) sat in production undetected. Every check that
# existed at the time passed, because they all only asked "is this variable
# set?" — and it was set, just wrong. The failure only appeared when a real
# visitor sent a real message and got a generic error.
#
# The rule this encodes: presence is not health. A credential is only verified
# by spending it. Every check below exercises the real path end to end.
#
# Usage: bash scripts/smoke-prod.sh [base-url]
set -uo pipefail

BASE="${1:-https://automate-ethically.com}"
failures=0

pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; failures=$((failures + 1)); }

echo "Smoke-testing ${BASE}"

# --- reachability ---------------------------------------------------------
code=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/" || echo 000)
[ "$code" = "200" ] && pass "site responds" || fail "site responds (HTTP $code)"

code=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/guide" || echo 000)
[ "$code" = "200" ] && pass "/guide responds" || fail "/guide responds (HTTP $code)"

# --- fail-closed verification --------------------------------------------
# A bogus Turnstile token must be refused, and the route must EXIST (a 404
# here would mean the nginx route never shipped — which has happened).
body=$(curl -sS -X POST "${BASE}/api/session" -H 'Content-Type: application/json' \
	-d '{"turnstileToken":"bogus"}' -w '\n%{http_code}' || echo $'\n000')
code=$(printf '%s' "$body" | tail -1)
case "$code" in
403) pass "/api/session refuses a bogus token" ;;
404) fail "/api/session is missing entirely (nginx route not deployed?)" ;;
503) fail "/api/session says Turnstile is not configured" ;;
*) fail "/api/session unexpected HTTP $code" ;;
esac

# A forged session token must not buy access to a paid route.
body=$(curl -sS -X POST "${BASE}/api/guide" -H 'Content-Type: application/json' \
	-d '{"message":"smoke","sessionToken":"99999999999999.forged"}' -w '\n%{http_code}' || echo $'\n000')
code=$(printf '%s' "$body" | tail -1)
[ "$code" = "403" ] && pass "/api/guide rejects a forged session" || fail "/api/guide forged session got HTTP $code"

# --- credentials are actually spendable ----------------------------------
# The check that would have caught the outage. /api/speech's GET reports
# whether a key is *present*; that is exactly the too-weak signal that misled
# us, so instead ask the upstream APIs whether the stored keys actually work.
#
# Reads the deployed secrets straight from Container Apps into the curl that
# tests them — the values are never printed, and never leave this shell.
if command -v az >/dev/null 2>&1; then
	anthropic_status=$(
		az containerapp secret show --name ca-automate-ethically --resource-group rg-platform \
			--secret-name anthropic-api-key --query value -o tsv 2>/dev/null |
			{
				read -r key
				[ -n "$key" ] || { echo "nokey"; exit; }
				curl -sS -o /dev/null -w '%{http_code}' https://api.anthropic.com/v1/messages \
					-H "x-api-key: ${key}" -H 'anthropic-version: 2023-06-01' \
					-H 'content-type: application/json' \
					-d '{"model":"claude-opus-5","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
			}
	)
	case "$anthropic_status" in
	200) pass "ANTHROPIC_API_KEY is valid (real call accepted)" ;;
	nokey) fail "ANTHROPIC_API_KEY secret is not set" ;;
	401 | 403) fail "ANTHROPIC_API_KEY is REJECTED by Anthropic (HTTP $anthropic_status) — check for quotes/whitespace in the stored secret" ;;
	*) fail "ANTHROPIC_API_KEY check inconclusive (HTTP $anthropic_status)" ;;
	esac

	openai_status=$(
		az containerapp secret show --name ca-automate-ethically --resource-group rg-platform \
			--secret-name openai-api-key --query value -o tsv 2>/dev/null |
			{
				read -r key
				[ -n "$key" ] || { echo "nokey"; exit; }
				curl -sS -o /dev/null -w '%{http_code}' https://api.openai.com/v1/models \
					-H "Authorization: Bearer ${key}"
			}
	)
	case "$openai_status" in
	200) pass "OPENAI_API_KEY is valid (real call accepted)" ;;
	nokey) fail "OPENAI_API_KEY secret is not set" ;;
	401 | 403) fail "OPENAI_API_KEY is REJECTED by OpenAI (HTTP $openai_status) — check for quotes/whitespace in the stored secret" ;;
	*) fail "OPENAI_API_KEY check inconclusive (HTTP $openai_status)" ;;
	esac
else
	echo "  skip az not available — credential validity NOT checked"
fi

echo
if [ "$failures" -gt 0 ]; then
	echo "SMOKE TEST FAILED (${failures} problem(s))"
	exit 1
fi
echo "All smoke checks passed."
