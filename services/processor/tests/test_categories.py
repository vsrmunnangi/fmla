"""Unit coverage for the category/doc-type registry (services/processor/categories/).

The live end-to-end proof per new category (real OCR against a synthetic PDF, real
missing/ok fields, a populated functionalChecks row) lives in test_main.py alongside the
existing WH-380-E proof — this file covers the registry's own shape and invariants.
"""
from contracts import EvidenceField, Source
from categories import CATEGORIES, CATEGORIES_BY_DOC_TYPE, CATEGORY_KEY_BY_DOC_TYPE


def test_registry_has_three_categories():
    assert {c.key for c in CATEGORIES} == {"FMLA", "WORKERS_COMP", "ADA"}


def test_no_duplicate_doc_types_across_categories():
    # the registry itself raises ValueError at import time on a collision — this just
    # double-checks the built dict has one entry per doc type actually declared.
    all_doc_types = [dt.type for c in CATEGORIES for dt in c.doc_types]
    assert len(all_doc_types) == len(set(all_doc_types))


def test_every_doc_type_is_reachable_by_type_string():
    for c in CATEGORIES:
        for dt in c.doc_types:
            assert CATEGORIES_BY_DOC_TYPE[dt.type] is dt
            assert CATEGORY_KEY_BY_DOC_TYPE[dt.type] == c.key


def test_every_required_field_has_a_matching_field_spec():
    # a required field the extractor can never produce would always be silently
    # "missing" — not necessarily wrong (condition.pathway is exactly this case for
    # FMLA today, tracked in test_main.py), but worth being able to see at a glance.
    for c in CATEGORIES:
        for dt in c.doc_types:
            spec_field_ids = {spec["field_id"] for spec in dt.field_specs}
            unproducible = set(dt.required_fields) - spec_field_ids
            if unproducible:
                assert unproducible == {"condition.pathway"}, (
                    f"{dt.type} has required fields with no extractor: {unproducible}"
                )


def test_workers_comp_functional_check_uses_injury_fields_not_fmla_fields():
    dt = CATEGORIES_BY_DOC_TYPE["FirstReportOfInjury"]
    fields = [
        EvidenceField(field_id="injury.description", group="injury", label="l", value="Slipped on wet floor",
                       confidence=0.9, status="ok", source=Source(doc_id="DOC-1", page=1)),
        EvidenceField(field_id="treatment.facility", group="treatment", label="l", value="City Hospital",
                       confidence=0.9, status="ok", source=Source(doc_id="DOC-1", page=1)),
        EvidenceField(field_id="injury.date", group="injury", label="l", value="2026-01-05",
                       confidence=0.9, status="ok", source=Source(doc_id="DOC-1", page=1)),
    ]
    checks = dt.functional_check_fn(fields)
    assert checks == [{
        "function": "Slipped on wet floor",
        "providerStatement": "City Hospital",
        "effectivePeriod": "2026-01-05",
        "source": {"docId": "DOC-1", "page": 1, "bbox": None},
    }]


def test_ada_functional_check_has_no_effective_period():
    dt = CATEGORIES_BY_DOC_TYPE["AccommodationRequest"]
    fields = [
        EvidenceField(field_id="accommodation.requested", group="accommodation", label="l", value="Ergonomic chair",
                       confidence=0.9, status="ok", source=Source(doc_id="DOC-1", page=1)),
    ]
    checks = dt.functional_check_fn(fields)
    assert len(checks) == 1
    assert checks[0]["function"] == "Ergonomic chair"
    assert checks[0]["effectivePeriod"] is None


def test_fmla_functional_check_unchanged_by_registry_migration():
    dt = CATEGORIES_BY_DOC_TYPE["WH-380-E"]
    fields = [
        EvidenceField(field_id="leave.type", group="leave", label="l", value="Intermittent",
                       confidence=0.9, status="ok", source=Source(doc_id="DOC-1", page=1)),
    ]
    checks = dt.functional_check_fn(fields)
    assert checks[0]["function"] == "Intermittent"
