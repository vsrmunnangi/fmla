"""Package metrics (§7.2): documents, fieldsExpected/Captured, completeness, conflicts, confidence."""
from __future__ import annotations

from fmla_contracts.exception_schema import Exception as GapException

from contracts import EvidenceField
from rules.checklists import REQUIRED


def compute_metrics(
    fields: list[EvidenceField],
    exceptions: list[GapException],
    doc_types: list[str],
) -> dict:
    fields_expected = sum(len(REQUIRED.get(t, [])) for t in doc_types)
    fields_captured = sum(1 for f in fields if f.value is not None)
    completeness_missing = sum(1 for e in exceptions if e.type == "missing")
    completeness_pass = max(fields_expected - completeness_missing, 0)
    conflicts = sum(1 for e in exceptions if e.type == "conflict")

    non_missing = [f for f in fields if f.status != "missing"]
    overall_confidence = (
        round(sum(f.confidence for f in non_missing) / len(non_missing), 3) if non_missing else 0.0
    )

    return {
        "documents": len(doc_types),
        "fieldsExpected": fields_expected,
        "fieldsCaptured": fields_captured,
        "completenessPass": completeness_pass,
        "completenessMissing": completeness_missing,
        "conflicts": conflicts,
        "overallConfidence": overall_confidence,
    }
