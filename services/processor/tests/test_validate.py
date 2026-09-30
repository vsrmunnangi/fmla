from contracts import EvidenceField, Source

import validate.engine as engine


def _field(field_id, value, doc_id="DOC-001", status="ok"):
    return EvidenceField(
        field_id=field_id, group="g", label="l", value=value, confidence=0.8, status=status,
        source=Source(doc_id=doc_id, page=1, bbox=[0.1, 0.1, 0.1, 0.1]) if value is not None else None,
    )


def test_valid_unclear_exception_is_kept(monkeypatch):
    monkeypatch.setattr(engine, "call_llm", lambda prompt: {
        "exceptions": [{
            "type": "unclear", "title": "Vague frequency", "detail": "no numeric frequency given",
            "evidenceRefs": ["leave.frequency"],
            "sources": [{"docId": "DOC-001", "page": 2, "quote": "ocr text"}],
        }]
    })
    fields = [_field("leave.frequency", "as needed")]
    result = engine.validate_fields(fields, {"DOC-001": "some ocr text"})
    assert len(result) == 1
    assert result[0].type == "unclear"
    assert result[0].evidenceRefs == ["leave.frequency"]


def test_valid_low_confidence_exception_is_kept(monkeypatch):
    """low_confidence is a real Exception type (packages/contracts) — v3 is the first
    version that actually lets the LLM emit it, for OCR/scan-quality uncertainty distinct
    from content genuinely being vague."""
    monkeypatch.setattr(engine, "call_llm", lambda prompt: {
        "exceptions": [{
            "type": "low_confidence", "title": "Illegible date", "detail": "OCR is garbled here",
            "evidenceRefs": ["condition.nextTreatmentDate"],
            "sources": [{"docId": "DOC-001", "page": 1, "quote": "N##t tr3atm-nt"}],
        }]
    })
    fields = [_field("condition.nextTreatmentDate", "N##t tr3atm-nt: ??/1?/2025")]
    result = engine.validate_fields(fields, {"DOC-001": "N##t tr3atm-nt: ??/1?/2025"})
    assert len(result) == 1
    assert result[0].type == "low_confidence"


def test_exception_with_fabricated_field_id_is_dropped(monkeypatch):
    monkeypatch.setattr(engine, "call_llm", lambda prompt: {
        "exceptions": [{
            "type": "unclear", "title": "x", "detail": "y",
            "evidenceRefs": ["not.a.real.field"],
            "sources": [{"docId": "DOC-001", "page": 1, "quote": "text"}],
        }]
    })
    fields = [_field("leave.frequency", "as needed")]
    result = engine.validate_fields(fields, {"DOC-001": "text"})
    assert result == []


def test_exception_with_fabricated_doc_id_is_dropped(monkeypatch):
    monkeypatch.setattr(engine, "call_llm", lambda prompt: {
        "exceptions": [{
            "type": "conflict", "title": "x", "detail": "y",
            "evidenceRefs": ["leave.frequency"],
            "sources": [{"docId": "DOC-999", "page": 1, "quote": "text"}],
        }]
    })
    fields = [_field("leave.frequency", "as needed")]
    result = engine.validate_fields(fields, {"DOC-001": "text"})
    assert result == []


def test_exception_with_quote_not_in_document_is_dropped(monkeypatch):
    """The v3 addition: a citation can point at a real fieldId and a real docId and still
    be fabricated — a quote that never actually appears in that document's text. This is a
    strictly stronger check than fieldId/docId matching alone."""
    monkeypatch.setattr(engine, "call_llm", lambda prompt: {
        "exceptions": [{
            "type": "unclear", "title": "x", "detail": "y",
            "evidenceRefs": ["leave.frequency"],
            "sources": [{"docId": "DOC-001", "page": 1, "quote": "this text was never in the document"}],
        }]
    })
    fields = [_field("leave.frequency", "as needed")]
    result = engine.validate_fields(fields, {"DOC-001": "Frequency: as needed"})
    assert result == []


def test_quote_matches_despite_word_tokenized_ocr_text(monkeypatch):
    """extract.py's OCR text is newline-joined per word, not space-joined — a multi-word
    quote must still match after whitespace normalization on both sides."""
    monkeypatch.setattr(engine, "call_llm", lambda prompt: {
        "exceptions": [{
            "type": "unclear", "title": "x", "detail": "y",
            "evidenceRefs": ["leave.frequency"],
            "sources": [{"docId": "DOC-001", "page": 1, "quote": "as needed"}],
        }]
    })
    fields = [_field("leave.frequency", "as needed")]
    result = engine.validate_fields(fields, {"DOC-001": "Frequency:\nas\nneeded"})
    assert len(result) == 1


def test_llm_cannot_reintroduce_missing_type(monkeypatch):
    monkeypatch.setattr(engine, "call_llm", lambda prompt: {
        "exceptions": [{
            "type": "missing", "title": "x", "detail": "y",
            "evidenceRefs": ["leave.frequency"],
            "sources": [{"docId": "DOC-001", "page": 1, "quote": "text"}],
        }]
    })
    fields = [_field("leave.frequency", "as needed")]
    result = engine.validate_fields(fields, {"DOC-001": "text"})
    assert result == []


def test_no_found_fields_skips_llm_call(monkeypatch):
    called = {"n": 0}

    def fail_if_called(prompt):
        called["n"] += 1
        return {"exceptions": []}

    monkeypatch.setattr(engine, "call_llm", fail_if_called)
    fields = [_field("leave.frequency", None, status="missing")]
    result = engine.validate_fields(fields, {"DOC-001": "text"})
    assert result == []
    assert called["n"] == 0
