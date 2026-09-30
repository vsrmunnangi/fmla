from contracts import EvidenceField, Source
from rules.engine import check_missing


def _ok_field(field_id: str, value: str = "some value") -> EvidenceField:
    return EvidenceField(
        field_id=field_id, group="g", label="l", value=value, confidence=0.9, status="ok",
        source=Source(doc_id="DOC-001", page=1, bbox=[0.1, 0.1, 0.1, 0.1]),
    )


def _missing_field(field_id: str) -> EvidenceField:
    return EvidenceField(field_id=field_id, group="g", label="l", value=None, status="missing")


def test_empty_required_field_yields_missing_exception():
    fields = [_missing_field("condition.nextTreatmentDate")]
    exceptions = check_missing(fields, "WH-380-E", "DOC-001")
    missing_refs = {e.evidenceRefs[0] for e in exceptions}
    assert "condition.nextTreatmentDate" in missing_refs
    exc = next(e for e in exceptions if e.evidenceRefs == ["condition.nextTreatmentDate"])
    assert exc.type == "missing"
    assert exc.sources[0].docId == "DOC-001"


def test_absent_field_also_counts_as_missing():
    # field not present in the list at all (extractor found nothing)
    exceptions = check_missing([], "ProviderLetter", "DOC-002")
    refs = {e.evidenceRefs[0] for e in exceptions}
    assert refs == {"provider.name", "condition.pathway", "leave.type"}


def test_present_field_yields_no_exception():
    fields = [_ok_field(fid) for fid in ["provider.name", "condition.pathway", "leave.type"]]
    exceptions = check_missing(fields, "ProviderLetter", "DOC-003")
    assert exceptions == []


def test_unknown_doc_type_has_no_checklist():
    exceptions = check_missing([], "SomeOtherForm", "DOC-004")
    assert exceptions == []


def test_missing_field_status_normalized():
    field = EvidenceField(field_id="leave.type", group="leave", label="Leave type", value=None)
    check_missing([field], "ProviderLetter", "DOC-005")
    assert field.status == "missing"
    assert field.source is None


def test_deterministic_same_input_same_output():
    fields = [_missing_field("leave.frequency")]
    a = check_missing(fields, "WH-380-E", "DOC-006")
    fields2 = [_missing_field("leave.frequency")]
    b = check_missing(fields2, "WH-380-E", "DOC-006")
    assert [e.model_dump(by_alias=True) for e in a] == [e.model_dump(by_alias=True) for e in b]
