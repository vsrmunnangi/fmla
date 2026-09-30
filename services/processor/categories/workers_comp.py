"""Workers' Compensation — proves the registry generalizes beyond FMLA vocabulary: no
leave.type, no condition.pathway. "First Report of Injury" is the near-universal
workers'-comp intake document across US states (naming/fields vary slightly by state;
this models the common core)."""
from __future__ import annotations

from contracts import EvidenceField
from categories.types import Category, DocType

FIELD_SPECS = [
    {"field_id": "employer.name", "group": "employer", "label": "Employer name",
     "anchors": ["employer name", "name of employer"], "max_words": 6},
    {"field_id": "injury.date", "group": "injury", "label": "Date of injury",
     "anchors": ["date of injury", "injury date"], "max_words": 4},
    {"field_id": "injury.description", "group": "injury", "label": "Description of injury",
     "anchors": ["description of injury", "nature of injury"], "max_words": 10},
    {"field_id": "injury.bodyPart", "group": "injury", "label": "Body part injured",
     "anchors": ["body part injured", "part of body injured", "body part affected"], "max_words": 4},
    {"field_id": "treatment.facility", "group": "treatment", "label": "Treatment facility",
     "anchors": ["treatment facility", "medical facility", "hospital clinic"], "max_words": 6},
]


def _functional_check(fields: list[EvidenceField]) -> list[dict]:
    """function <- injury.description, providerStatement <- treatment facility,
    effectivePeriod <- date of injury. Deliberately different fieldIds from FMLA's
    functional check — proves the per-doc-type hook isn't just relabeled FMLA logic."""
    by_field_id = {f.field_id: f for f in fields}
    description = by_field_id.get("injury.description")
    if description is None or description.value is None:
        return []

    facility = by_field_id.get("treatment.facility")
    injury_date = by_field_id.get("injury.date")

    return [{
        "function": description.value,
        "providerStatement": facility.value if facility else None,
        "effectivePeriod": injury_date.value if injury_date else None,
        "source": description.source.model_dump(by_alias=True) if description.source else None,
    }]


CATEGORY = Category(
    key="WORKERS_COMP",
    label="Workers' Compensation",
    doc_types=[
        DocType(
            type="FirstReportOfInjury",
            label="First Report of Injury",
            required_fields=["employer.name", "injury.date", "injury.description", "injury.bodyPart"],
            field_specs=FIELD_SPECS,
            functional_check_fn=_functional_check,
        ),
    ],
)
