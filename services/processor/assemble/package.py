"""Builds the full EvidencePackage (§4.3, §7.2 step 5)."""
from __future__ import annotations

from datetime import date, datetime, timezone

from fmla_contracts.evidence_package_schema import EvidencePackage
from fmla_contracts.exception_schema import Exception as GapException

from contracts import EvidenceField
from categories import CATEGORIES_BY_DOC_TYPE, CATEGORY_KEY_BY_DOC_TYPE
from assemble.metrics import compute_metrics
from validate.llm_client import LLM_MODEL
from validate.prompts import PROMPT_VERSION

PIPELINE_VERSION = "v1"


def default_claim_summary(claim_id: str, category: str = "FMLA") -> dict:
    """§7.1's /process request only carries claimId + documents — claimant/employer/leave-year
    live on the `claims` row that `api` owns. Until api passes that through in the request (a
    `claim` block, added here as an optional field beyond the literal §7.1 shape so the assembled
    package can satisfy §4.3's required `claim` block), fall back to a clearly-placeholder summary
    rather than fail the whole run."""
    today = date.today()
    return {
        "claimant": "Unknown",
        "employer": "Unknown",
        "type": category,
        "receivedAt": today.isoformat(),
        "leaveYear": {"start": date(today.year, 1, 1).isoformat(), "end": date(today.year, 12, 31).isoformat()},
        "fmlaBalance": {"usedWeeks": 0, "totalWeeks": 12},
    }


def _build_functional_checks(fields: list[EvidenceField], doc_types: list[str]) -> list[dict]:
    """Dispatches to each present doc type's functional_check_fn (categories/*.py) — e.g.
    FMLA derives function<-leave.type, Workers' Comp derives function<-injury.description.
    A doc type with no hook defined contributes nothing (not an error)."""
    checks: list[dict] = []
    seen: list[str] = []
    for doc_type in doc_types:
        if doc_type in seen:
            continue
        seen.append(doc_type)
        doc_type_def = CATEGORIES_BY_DOC_TYPE.get(doc_type)
        if doc_type_def is None or doc_type_def.functional_check_fn is None:
            continue
        checks.extend(doc_type_def.functional_check_fn(fields))
    return checks


def build_package(
    *,
    claim_id: str,
    run_id: str,
    version: int,
    documents: list[dict],
    fields: list[EvidenceField],
    exceptions: list[GapException],
    claim_summary: dict | None,
    started_at: datetime,
    completed_at: datetime | None = None,
) -> dict:
    completed_at = completed_at or datetime.now(timezone.utc)
    doc_types = [d["type"] for d in documents]
    fallback_category = CATEGORY_KEY_BY_DOC_TYPE.get(doc_types[0], "FMLA") if doc_types else "FMLA"

    package = {
        "claimId": claim_id,
        "runId": run_id,
        "packageVersion": version,
        "generatedAt": completed_at.isoformat(),
        "status": "AWAITING_REVIEW",
        "claim": claim_summary or default_claim_summary(claim_id, fallback_category),
        "metrics": compute_metrics(fields, exceptions, doc_types),
        "documents": documents,
        "evidence": [f.model_dump(by_alias=True) for f in fields],
        "functionalChecks": _build_functional_checks(fields, doc_types),
        "exceptions": [e.model_dump(by_alias=True) for e in exceptions],
        "provenance": {
            "runId": run_id,
            "pipelineVersion": PIPELINE_VERSION,
            "modelSteps": [
                {"name": "extract", "model": "tesseract+crude-anchor-match", "promptVersion": "n/a"},
                {"name": "rules", "model": "deterministic-checklist", "promptVersion": "n/a"},
                {"name": "validate", "model": LLM_MODEL, "promptVersion": PROMPT_VERSION},
            ],
            "startedAt": started_at.isoformat(),
            "completedAt": completed_at.isoformat(),
        },
    }

    # Round-trip through the generated EvidencePackage model: guarantees the response is
    # schema-valid (or raises) before it ever reaches the caller.
    validated = EvidencePackage.model_validate(package)
    return validated.model_dump(by_alias=True, mode="json")
