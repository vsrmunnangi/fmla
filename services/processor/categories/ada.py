"""ADA — Accommodation Request. Second proof that the registry generalizes: different
vocabulary again (no leave/condition fields at all), and its required checklist is a
strict subset of its field_specs (employee.jobTitle is captured but not required),
proving partial-checklist support isn't all-or-nothing."""
from __future__ import annotations

from contracts import EvidenceField
from categories.types import Category, DocType

FIELD_SPECS = [
    {"field_id": "employee.jobTitle", "group": "employee", "label": "Job title",
     "anchors": ["job title", "position title"], "max_words": 5},
    {"field_id": "limitation.description", "group": "limitation", "label": "Description of limitation",
     "anchors": ["description of limitation", "functional limitation", "nature of limitation"], "max_words": 10},
    {"field_id": "accommodation.requested", "group": "accommodation", "label": "Accommodation requested",
     "anchors": ["accommodation requested", "requested accommodation"], "max_words": 10},
    {"field_id": "provider.name", "group": "provider", "label": "Provider name",
     "anchors": ["name of health care provider", "health care provider", "provider name"], "max_words": 6},
]


def _functional_check(fields: list[EvidenceField]) -> list[dict]:
    """function <- accommodation requested, providerStatement <- limitation description.
    No effectivePeriod — accommodation requests aren't date-bound the way leave/injury are."""
    by_field_id = {f.field_id: f for f in fields}
    accommodation = by_field_id.get("accommodation.requested")
    if accommodation is None or accommodation.value is None:
        return []

    limitation = by_field_id.get("limitation.description")

    return [{
        "function": accommodation.value,
        "providerStatement": limitation.value if limitation else None,
        "effectivePeriod": None,
        "source": accommodation.source.model_dump(by_alias=True) if accommodation.source else None,
    }]


CATEGORY = Category(
    key="ADA",
    label="ADA",
    doc_types=[
        DocType(
            type="AccommodationRequest",
            label="Accommodation Request",
            required_fields=["limitation.description", "accommodation.requested", "provider.name"],
            field_specs=FIELD_SPECS,
            functional_check_fn=_functional_check,
        ),
    ],
)
