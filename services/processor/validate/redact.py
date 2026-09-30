"""PHI redaction over OCR text before anything enters an LLM prompt (§7.4, invariant #7).

Presidio's analyzer + anonymizer, built once (spaCy model load is the expensive
part) and reused across calls.
"""
from __future__ import annotations

from functools import lru_cache

ENTITIES = [
    "PERSON", "DATE_TIME", "PHONE_NUMBER", "EMAIL_ADDRESS", "LOCATION",
    "US_SSN", "MEDICAL_LICENSE", "US_DRIVER_LICENSE", "NRP",
]


@lru_cache(maxsize=1)
def _engines():
    from presidio_analyzer import AnalyzerEngine
    from presidio_anonymizer import AnonymizerEngine

    return AnalyzerEngine(), AnonymizerEngine()


def redact(text: str) -> str:
    if not text.strip():
        return text
    analyzer, anonymizer = _engines()
    results = analyzer.analyze(text=text, entities=ENTITIES, language="en")
    return anonymizer.anonymize(text=text, analyzer_results=results).text
