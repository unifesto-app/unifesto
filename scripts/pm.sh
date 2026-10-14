#!/usr/bin/env bash
# Call a Unifesto PM MCP tool over plain HTTP (works in cloud routines, where
# locally-added MCP servers don't exist).
#   scripts/pm.sh get_task '{"key":"P13"}'
#   scripts/pm.sh add_note '{"key":"P13","message":"checks ✓"}'
set -euo pipefail
: "${UNIFESTO_PM_TOKEN:?set UNIFESTO_PM_TOKEN (Apex → Product → Connect Claude)}"
URL="${PM_MCP_URL:-https://api.unifesto.app/pm/mcp}"
TOOL="$1"; ARGS="${2:-{\}}"
curl -fsS "$URL" \
  -H "Authorization: Bearer $UNIFESTO_PM_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":$ARGS}}"
echo
