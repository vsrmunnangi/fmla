"""Belt-and-suspenders on top of packages/contracts/scripts/check-drift.sh: validates real
instances of each shape against the committed JSON Schema at runtime."""
from contracts import EvidenceField, Source

from tests.schema_validate import validator_for


def test_evidence_field_matches_schema():
    field = EvidenceField(
        field_id="provider.name", group="provider", label="Provider name",
        value="Sarah Johnson, MD", confidence=0.98, status="ok",
        source=Source(doc_id="DOC-001", page=1, bbox=[0.12, 0.20, 0.30, 0.04]),
    )
    validator_for("evidence-field.schema.json").validate(field.model_dump(by_alias=True))


def test_missing_evidence_field_matches_schema():
    field = EvidenceField(field_id="x", group="g", label="l", value=None, status="missing")
    validator_for("evidence-field.schema.json").validate(field.model_dump(by_alias=True))


def test_value_without_source_violates_schema():
    # contracts.py's pydantic validator already rejects this at construction time (see
    # contracts.py's own self-test) — this asserts the JSON Schema independently agrees.
    instance = {"fieldId": "x", "group": "g", "label": "l", "value": "present", "status": "ok"}
    errors = list(validator_for("evidence-field.schema.json").iter_errors(instance))
    assert errors, "schema should reject a present value with no source"


def test_exception_matches_schema():
    instance = {
        "exceptionId": "EXC-1", "type": "missing", "title": "Next treatment date",
        "detail": "not found", "evidenceRefs": ["condition.nextTreatmentDate"],
        "sources": [{"docId": "DOC-001", "page": 1}], "cure": None,
    }
    validator_for("exception.schema.json").validate(instance)
