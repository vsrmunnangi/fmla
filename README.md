# FMLA Evidence-Package System

On document upload to a claim: **extract** the data, **validate** it (deterministic rules for
what's missing, an LLM for what's unclear/conflicting), assemble a single **evidence package**,
and set the claim to a review status. A human examiner decides — the system produces evidence and
gaps, it does not decide, cure, or certify. Full design: `implementation-spec-v1.md` (not
committed here — see whoever gave you the spec).

## Architecture

| Component | Runtime | Port | Responsibility |
|---|---|---|---|
| `apps/web` | React + Vite | 5173 | Console, evidence-package view, admin dashboard |
| `apps/api` | NestJS | 3001 | Auth/RBAC, claim state machine, all persistence, triggers processor |
| `services/processor` | Python/FastAPI | 8000 | OCR → extract → rules → LLM validate → assemble (stateless) |
| Postgres | AWS RDS (IAM auth) | — | claims, documents, packages (JSONB), audit trail |
| Object storage | AWS S3 | — | raw documents + package snapshots |
| LLM | Ollama/Mistral (local, default) or AWS Bedrock (opt-in) | 11434 | Semantic validation only (unclear/conflict) |

`apps/api` is the only writer of claim state. `services/processor` never touches the database —
it's a pure function from documents to an `EvidencePackage`.

## Prerequisites

- **Node.js** 20+ and npm
- **Python** 3.11+ with `venv`
- **Tesseract + poppler** (OCR): `brew install tesseract poppler`
- **Ollama** with a model pulled, for local LLM validation: `brew install ollama && ollama pull mistral`
  (or configure `LLM_PROVIDER=bedrock` — see [AWS Bedrock](#aws-bedrock-optional) below)
- **AWS CLI** configured with a profile that can reach your RDS cluster (IAM auth) and S3 bucket:
  `brew install awscli && aws configure sso`

## One-time setup

### 1. Contracts (shared types)

Already generated and checked into `packages/contracts/generated/` — nothing to do unless you
change a schema in `packages/contracts/schema/*.json`, in which case:

```bash
cd packages/contracts && npm install && npm run generate
```

(pydantic regeneration + the full drift check: `bash packages/contracts/scripts/check-drift.sh`)

### 2. Processor

```bash
cd services/processor
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Presidio's PHI redaction needs a spaCy model (~400MB) that auto-downloads on first use, or fetch
it up front:

```bash
.venv/bin/python -m spacy download en_core_web_lg
```

### 3. API

```bash
cd apps/api
npm install
cp .env.example .env   # then fill in DATABASE_URL or the AWS_RDS_IAM_AUTH block, S3_BUCKET, etc.
npx prisma generate
npx prisma migrate deploy   # creates claims/documents/packages/claim_status_history — needs a reachable DB
```

If your Postgres uses RDS IAM auth (token-based, not a static password), `prisma migrate`/`db
push` need a freshly-signed token baked into `DATABASE_URL` for that one command, since the
Prisma CLI doesn't go through the app's own token-refreshing connector:

```bash
DATABASE_URL=$(PGHOST=<your-rds-host> npx ts-node scripts/db-iam-url.ts) npx prisma migrate deploy
```

### 4. Web

```bash
cd apps/web
npm install
cp .env.example .env.local
```

Set `VITE_USE_FIXTURE=true` in `.env.local` to render the UI off `seed/*.json` fixtures with no
api/DB/S3 required — useful for UI-only work.

## Running locally

Three terminals:

```bash
cd services/processor && AWS_PROFILE=<your-profile> AWS_REGION=us-east-1 S3_BUCKET=<your-bucket> .venv/bin/uvicorn main:app --reload --port 8000
```

```bash
cd apps/api && AWS_PROFILE=<your-profile> npm run start:dev
```

```bash
cd apps/web && npm run dev
```

Then open `http://localhost:5173`.

If you're using AWS SSO, refresh the session first if it's expired:

```bash
aws sso login --sso-session <your-sso-session-name>
```

## Signing in (dev-JWT stub)

There's no real auth yet — `apps/api` accepts a dev-signed JWT with a `role` claim. Mint one:

```bash
cd apps/api
DEV_JWT_SECRET=dev-only-secret-do-not-use-in-production npx ts-node scripts/issue-dev-token.ts alice examiner
```

Paste the token into the "paste dev token" box in the top-right of the web app. Valid roles:
`examiner`, `senior-examiner`, `triage`, `auditor` — see `src/common/roles.ts` for what each can do.

## Testing

```bash
cd services/processor && .venv/bin/python -m pytest tests -v
```

```bash
cd apps/api && npx jest
```

```bash
cd apps/web && npx tsc -b tsconfig.json && npm run build
```

Live-LLM tests (hits your real local Ollama instead of a mock):

```bash
cd services/processor && RUN_LIVE_LLM=1 .venv/bin/python -m pytest tests/test_validate_live.py -v
```

## AWS Bedrock (optional)

`services/processor/validate/llm_client.py` supports `LLM_PROVIDER=bedrock` as an alternative to
local Ollama, using `BEDROCK_MODEL_ID` (default `mistral.mistral-large-2402-v1:0`) and
`AWS_REGION`. This needs Bedrock model-invocation access enabled for your AWS account — a
new/low-history account is often blocked by AWS's own fraud-prevention gate (`Error 002: Access
to Bedrock models is not allowed for this account`), which only AWS Support can lift (Support
Center → Account and Billing). It's unrelated to IAM permissions, so more roles/policies won't fix it.

## Known limitations (v1)

- `services/processor/extract.py`'s field extraction is deliberately crude (anchor-text matching)
  — it proves the OCR → cited-evidence contract, not extraction quality.
- No cure drafting, no task/note/payment workspace — the system produces evidence and gaps; a
  human examiner decides. `apps/web`'s top nav shows those as inert placeholders on purpose.
- `apps/api`'s dev-JWT auth is exactly that — a stand-in for real OIDC (`OIDC_ISSUER`), not meant
  to reach anywhere beyond local dev.
