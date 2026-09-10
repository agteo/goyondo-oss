#!/usr/bin/env bash
# Device auth (if needed) → list_trips. Optional: --create
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

BASE="${GOYONDO_BASE_URL:-https://goyondo.run}"
TOKEN="${GOYONDO_API_KEY:-}"
CREATE=0
if [ "${1:-}" = "--create" ]; then
  CREATE=1
fi

request_token() {
  local scopes='["trips:read","trips:write"]'
  DEVICE=$(curl -sS -X POST "$BASE/api/agent-auth/device" \
    -H 'Content-Type: application/json' \
    -d "{\"agent_name\":\"goyondo-oss\",\"requested_scopes\":$scopes}")
  echo "$DEVICE" | jq '{user_code, verification_uri_complete, expires_in, interval}'
  local device_code interval
  DEVICE_CODE=$(echo "$DEVICE" | jq -r .device_code)
  INTERVAL=$(echo "$DEVICE" | jq -r '.interval // 5')
  echo "Ask the user to open: $(echo "$DEVICE" | jq -r .verification_uri_complete)"

  while true; do
    TOKEN_JSON=$(curl -sS -w '\n%{http_code}' -X POST "$BASE/api/agent-auth/token" \
      -H 'Content-Type: application/json' \
      -d "{\"device_code\":\"$DEVICE_CODE\"}")
    HTTP=$(echo "$TOKEN_JSON" | tail -n1)
    BODY=$(echo "$TOKEN_JSON" | sed '$d')
    ERR=$(echo "$BODY" | jq -r '.error // empty')
    if [ "$HTTP" = "200" ] && [ "$(echo "$BODY" | jq -r '.access_token // empty')" != "" ]; then
      TOKEN=$(echo "$BODY" | jq -r .access_token)
      echo "Store this token now (one-time reveal). Example: GOYONDO_API_KEY in .env"
      return 0
    fi
    if [ "$ERR" = "authorization_pending" ]; then
      sleep "$INTERVAL"
      continue
    fi
    echo "Token poll failed ($HTTP): $BODY" >&2
    exit 1
  done
}

if [ -z "$TOKEN" ]; then
  request_token
fi

task() {
  curl -sS -X POST "$BASE/api/agent/task" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$1"
}

echo "=== list_trips ==="
task '{"capability":"list_trips","arguments":{}}' | jq .

if [ "$CREATE" = "1" ]; then
  echo "=== create_trip (skip_ai_generation) ==="
  task '{"capability":"create_trip","arguments":{"destination":"Kyoto","start_date":"2026-11-01","end_date":"2026-11-03","travelers":1,"skip_ai_generation":true}}' | jq .
fi
