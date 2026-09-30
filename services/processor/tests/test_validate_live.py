"""Live integration test against the real local Ollama + mistral.

Skipped by default (slow, needs a running LLM). Run with:
    RUN_LIVE_LLM=1 python -m pytest services/processor/tests/test_validate_live.py -v
"""
import os

import pytest

from contracts import EvidenceField, Source
from validate.engine import validate_fields

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_LLM") != "1",
    reason="set RUN_LIVE_LLM=1 to run against the real local Ollama/mistral",
)


def _field(field_id, value, doc_id):
    return EvidenceField(
        field_id=field_id, group="g", label="l", value=value, confidence=0.8, status="ok",
        source=Source(doc_id=doc_id, page=1, bbox=[0.1, 0.1, 0.1, 0.1]),
    )


def test_vague_frequency_is_flagged_unclear():
    fields = [_field("leave.frequency", "as needed, varies", "DOC-001")]
    ocr_text = {"DOC-001": "Frequency of episodes: as needed, varies"}

    exceptions = validate_fields(fields, ocr_text)

    assert any(e.type == "unclear" for e in exceptions), (
        f"expected an 'unclear' exception for a vague frequency, got: {exceptions}"
    )


def test_leave_pattern_mismatch_is_flagged_conflict():
    fields = [
        _field("leave.type", "Intermittent", "DOC-001"),
        _field("leave.frequency", "2 episodes per month, 1 day each", "DOC-001"),
        _field("leave.type", "Continuous", "DOC-002"),
        _field("leave.frequency", "N/A - continuous leave", "DOC-002"),
    ]
    ocr_text = {
        "DOC-001": "Provider statement: leave type Intermittent. Frequency: 2 episodes per month, 1 day each.",
        "DOC-002": "Claimant statement: requesting Continuous leave starting immediately, not intermittent.",
    }

    exceptions = validate_fields(fields, ocr_text)

    assert any(e.type == "conflict" for e in exceptions), (
        f"expected a 'conflict' exception for mismatched leave type/frequency across docs, got: {exceptions}"
    )


def test_workers_comp_citations_stay_within_the_given_field_ids():
    """Regression test for the exact failure PROMPT_VERSION v2 fixed (see
    validate/prompts.py's history note and scripts/eval_prompt_accuracy.py): at v1, the
    model reliably (6/6 trials) cited a hallucinated "injury.location" field instead of
    the real "injury.bodyPart" — a systematic substitution, not noise. This asserts any
    exception mistral returns for this input cites only real fieldIds; it does not assert
    an exception is raised at all (that would make the test flaky on model wording), only
    that if one is, its citation isn't invented.
    """
    fields = [
        _field("injury.description", "Laceration to left hand", "DOC-001"),
        _field("treatment.facility", "Springfield Occupational Health Clinic", "DOC-001"),
    ]
    ocr_text = {"DOC-001": "Description of injury: Laceration to left hand. Treatment facility: Springfield Occupational Health Clinic."}
    valid_field_ids = {f.field_id for f in fields}

    exceptions = validate_fields(fields, ocr_text)

    for e in exceptions:
        assert set(e.evidenceRefs) <= valid_field_ids, (
            f"citation escaped the given fieldIds (the v1 regression): {e.evidenceRefs} not in {valid_field_ids}"
        )
