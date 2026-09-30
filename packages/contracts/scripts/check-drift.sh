#!/usr/bin/env bash
# Regenerates TS + pydantic types from schema/*.json into temp dirs and diffs
# against what's committed under generated/. Non-zero exit on any drift.
#
# Usage: bash packages/contracts/scripts/check-drift.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
TMP="$(mktemp -d)"
TMP_TS="$TMP/ts"
TMP_PY="$TMP/py"       # datamodel-codegen requires this NOT to pre-exist
mkdir -p "$TMP_TS"
trap 'rm -rf "$TMP"' EXIT

echo "== regenerating TS =="
(
  cd "$ROOT"
  npx json2ts -i schema/evidence-field.schema.json -o "$TMP_TS/evidence-field.d.ts" --cwd schema --unreachableDefinitions
  npx json2ts -i schema/exception.schema.json -o "$TMP_TS/exception.d.ts" --cwd schema --unreachableDefinitions
  npx json2ts -i schema/evidence-package.schema.json -o "$TMP_TS/evidence-package.d.ts" --cwd schema --unreachableDefinitions
)

echo "== regenerating pydantic =="
PY="$REPO_ROOT/services/processor/.venv/bin/datamodel-codegen"
"$PY" \
  --input "$ROOT/schema" \
  --input-file-type jsonschema \
  --output "$TMP_PY" \
  --output-model-type pydantic_v2.BaseModel \
  --use-double-quotes \
  --target-python-version 3.11 \
  --field-constraints \
  --use-schema-description \
  --disable-timestamp >/dev/null

echo "== diffing =="
DRIFT=0
diff -rq -x "__pycache__" "$TMP_TS" "$ROOT/generated/ts" || DRIFT=1
diff -rq -x "__pycache__" "$TMP_PY" "$ROOT/generated/python" || DRIFT=1

if [ "$DRIFT" -ne 0 ]; then
  echo "CONTRACT DRIFT DETECTED — regenerate with 'npm run generate' (TS) and the datamodel-codegen"
  echo "command above (pydantic), then commit the updated generated/ output." >&2
  exit 1
fi
echo "no drift"
