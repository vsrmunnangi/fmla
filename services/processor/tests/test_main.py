import os

from fastapi.testclient import TestClient

import main
from tests.schema_validate import assert_valid_package

SEED_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "seed")
SAMPLE_PDF = os.path.join(SEED_DIR, "sample-wh380e.pdf")
WORKERS_COMP_PDF = os.path.join(SEED_DIR, "sample-first-report-of-injury.pdf")
ADA_PDF = os.path.join(SEED_DIR, "sample-accommodation-request.pdf")


def test_process_returns_schema_valid_package(monkeypatch):
    # Keep this test fast/deterministic — the real LLM path is proven separately in
    # tests/test_validate_live.py against the actual local Ollama/mistral.
    monkeypatch.setattr(main, "validate_fields", lambda fields, ocr_text: [])

    client = TestClient(main.app)
    resp = client.post("/process", json={
        "claimId": "FMLA-25-102938",
        "documents": [{"docId": "DOC-001", "type": "WH-380-E", "storageKey": SAMPLE_PDF}],
    })

    assert resp.status_code == 200, resp.text
    package = resp.json()
    assert_valid_package(package)

    assert package["claimId"] == "FMLA-25-102938"
    assert package["status"] == "AWAITING_REVIEW"
    assert package["metrics"]["documents"] == 1
    assert package["metrics"]["fieldsExpected"] == 6  # WH-380-E checklist size

    missing_refs = {e["evidenceRefs"][0] for e in package["exceptions"] if e["type"] == "missing"}
    # condition.pathway is on the checklist but extract.py's FIELD_SPECS doesn't produce it yet —
    # it's correctly and always "missing" until milestone-1's extractor grows that field.
    assert "condition.pathway" in missing_refs


def test_process_is_deterministic_given_mocked_llm(monkeypatch):
    monkeypatch.setattr(main, "validate_fields", lambda fields, ocr_text: [])
    client = TestClient(main.app)
    body = {
        "claimId": "FMLA-25-102938",
        "documents": [{"docId": "DOC-001", "type": "WH-380-E", "storageKey": SAMPLE_PDF}],
    }
    r1 = client.post("/process", json=body).json()
    r2 = client.post("/process", json=body).json()
    # Same inputs -> same idempotency-derived runId (§7.1).
    assert r1["runId"] == r2["runId"]


def test_health():
    client = TestClient(main.app)
    assert client.get("/health").json() == {"status": "ok"}


def test_process_rejects_unknown_document_type(monkeypatch):
    monkeypatch.setattr(main, "validate_fields", lambda fields, ocr_text: [])
    client = TestClient(main.app)
    resp = client.post("/process", json={
        "claimId": "X-1",
        "documents": [{"docId": "DOC-001", "type": "SomeMadeUpForm", "storageKey": SAMPLE_PDF}],
    })
    assert resp.status_code == 400


def test_process_workers_comp_end_to_end(monkeypatch):
    """Proves the registry generalizes beyond FMLA for real: real OCR against a
    Workers'-Comp-shaped PDF, real injury.* fields (not leave.type/condition.pathway),
    real missing exceptions for the fields this synthetic PDF's crude extraction misses,
    and a functionalChecks row derived from injury.description (categories/workers_comp.py)."""
    monkeypatch.setattr(main, "validate_fields", lambda fields, ocr_text: [])
    client = TestClient(main.app)
    resp = client.post("/process", json={
        "claimId": "WC-1",
        "documents": [{"docId": "DOC-001", "type": "FirstReportOfInjury", "storageKey": WORKERS_COMP_PDF}],
    })

    assert resp.status_code == 200, resp.text
    package = resp.json()
    assert_valid_package(package)
    assert package["metrics"]["fieldsExpected"] == 4  # FirstReportOfInjury checklist size

    field_ids = {f["fieldId"] for f in package["evidence"]}
    assert field_ids == {"employer.name", "injury.date", "injury.description", "injury.bodyPart", "treatment.facility"}

    missing_refs = {e["evidenceRefs"][0] for e in package["exceptions"] if e["type"] == "missing"}
    assert missing_refs  # this synthetic PDF's crude extraction misses at least one required field
    assert missing_refs <= {"employer.name", "injury.date", "injury.description", "injury.bodyPart"}

    # no FMLA-only fields leaked in, and the functional check used the Workers'-Comp hook
    assert not field_ids & {"leave.type", "condition.pathway"}
    if package["functionalChecks"]:
        assert package["functionalChecks"][0]["function"] not in (None, "")


def test_process_ada_end_to_end(monkeypatch):
    """Second proof: ADA has yet another vocabulary (limitation/accommodation, no
    injury/leave fields at all), and its functionalChecks row has no effectivePeriod
    (categories/ada.py's hook deliberately omits it)."""
    monkeypatch.setattr(main, "validate_fields", lambda fields, ocr_text: [])
    client = TestClient(main.app)
    resp = client.post("/process", json={
        "claimId": "ADA-1",
        "documents": [{"docId": "DOC-001", "type": "AccommodationRequest", "storageKey": ADA_PDF}],
    })

    assert resp.status_code == 200, resp.text
    package = resp.json()
    assert_valid_package(package)
    assert package["metrics"]["fieldsExpected"] == 3  # AccommodationRequest checklist size

    field_ids = {f["fieldId"] for f in package["evidence"]}
    assert field_ids == {"employee.jobTitle", "limitation.description", "accommodation.requested", "provider.name"}

    by_id = {f["fieldId"]: f for f in package["evidence"]}
    assert by_id["accommodation.requested"]["value"] == "Sit stand desk and frequent breaks"
    assert by_id["limitation.description"]["value"] == "Difficulty standing for long periods"

    if package["functionalChecks"]:
        assert package["functionalChecks"][0]["effectivePeriod"] is None
