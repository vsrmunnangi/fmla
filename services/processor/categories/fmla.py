"""FMLA — migrated verbatim from the pre-registry rules/checklists.py + the hardcoded
functional-check logic in assemble/package.py. Zero behavior change: same required
fields, same extract.py FIELD_SPECS (imported, not copied), same functional-check derivation.
"""
from __future__ import annotations

from contracts import EvidenceField
from extract import FIELD_SPECS
from categories.types import Category, DocType


def _functional_check(fields: list[EvidenceField]) -> list[dict]:
    """One row per claim with a leave.type field (function <- leave.type, providerStatement
    <- condition.pathway, effectivePeriod <- condition dates) — the exact logic that used
    to live as assemble/package.py's _build_functional_checks, unchanged."""
    by_field_id = {f.field_id: f for f in fields}
    leave_type = by_field_id.get("leave.type")
    if leave_type is None or leave_type.value is None:
        return []

    pathway = by_field_id.get("condition.pathway")
    onset = by_field_id.get("condition.onset")
    next_treatment = by_field_id.get("condition.nextTreatmentDate")

    effective_period = None
    if onset and onset.value:
        effective_period = f"{onset.value} – {next_treatment.value}" if next_treatment and next_treatment.value else onset.value

    return [{
        "function": leave_type.value,
        "providerStatement": pathway.value if pathway else None,
        "effectivePeriod": effective_period,
        "source": leave_type.source.model_dump(by_alias=True) if leave_type.source else None,
    }]


CATEGORY = Category(
    key="FMLA",
    label="FMLA",
    doc_types=[
        DocType(
            type="WH-380-E",
            label="WH-380-E — Certification of Health Care Provider (Employee's Own Condition)",
            required_fields=[
                "provider.name",
                "condition.onset",
                "condition.pathway",
                "leave.type",
                "leave.frequency",
                "condition.nextTreatmentDate",
            ],
            field_specs=FIELD_SPECS,
            functional_check_fn=_functional_check,
        ),
        DocType(
            type="ProviderLetter",
            label="Provider Letter",
            required_fields=["provider.name", "condition.pathway", "leave.type"],
            # Reuses WH-380-E's field_specs — that's already today's de facto behavior
            # (extraction was never type-differentiated before this registry existed). A
            # ProviderLetter-specific extractor is a natural next step, not required here.
            field_specs=FIELD_SPECS,
            functional_check_fn=_functional_check,
        ),
    ],
)
