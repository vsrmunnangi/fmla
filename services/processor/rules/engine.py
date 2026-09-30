"""The deterministic "missing" check (§7.2 step 3, §7.3).

Pure function: same fields + doc type in, same exceptions out. No LLM, no I/O.
This is what keeps the missing-list trustworthy — it's a fact ("the box is
empty"), not a judgment call.
"""
from __future__ import annotations

from fmla_contracts.exception_schema import Exception as GapException, SourceRef

from contracts import EvidenceField
from rules.checklists import REQUIRED


def check_missing(fields: list[EvidenceField], doc_type: str, doc_id: str) -> list[GapException]:
    """Required fieldIds with no value -> a `missing` GapException each.

    `fields` may omit a required fieldId entirely (extractor found nothing) or
    include it with `value=None` — both count as missing. As a side effect,
    normalizes each matching field's status to "missing" (§4.1 invariant: a
    missing field carries no source).
    """
    required = REQUIRED.get(doc_type, [])
    by_id = {f.field_id: f for f in fields}

    exceptions: list[GapException] = []
    for i, field_id in enumerate(required):
        field = by_id.get(field_id)
        if field is not None and field.value is not None:
            continue

        if field is not None:
            field.status = "missing"
            field.source = None

        exceptions.append(
            GapException(
                exceptionId=f"EXC-missing-{doc_id}-{i}",
                type="missing",
                title=_title_for(field_id),
                detail=f"Required field '{field_id}' was not found in {doc_id} ({doc_type}).",
                evidenceRefs=[field_id],
                # No specific page to cite — the field is absent, so this points at
                # the document itself (page 1) rather than a location within it.
                sources=[SourceRef(docId=doc_id, page=1)],
                cure=None,
            )
        )
    return exceptions


def _title_for(field_id: str) -> str:
    """A human label for a fieldId, e.g. "condition.nextTreatmentDate" -> "Next treatment date"."""
    leaf = field_id.rsplit(".", 1)[-1]
    words = []
    current = ""
    for ch in leaf:
        if ch.isupper() and current:
            words.append(current)
            current = ch
        else:
            current += ch
    words.append(current)
    label = " ".join(words).lower()
    return label[0].upper() + label[1:] if label else field_id
