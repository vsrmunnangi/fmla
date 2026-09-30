#!/usr/bin/env python3
"""
extract.py — Step 3 milestone: PDF -> OCR -> cited evidence fields.

    python extract.py sample-wh380e.pdf            # -> DOC-001
    python extract.py sample-wh380e.pdf DOC-042

Reads a PDF from disk, OCRs each page into words (text + bounding box +
confidence), maps a handful of WH-380-E fields, validates each against the
contract, and prints the evidence as JSON.

The field mapping here is deliberately CRUDE anchor-matching — its only job is
to prove the {value, confidence, source} contract end to end. Replace it later
with a schema-driven extractor (e.g. Mistral OCR document_annotation). The OCR
plumbing below is the real, reusable part.
"""
from __future__ import annotations

import sys
import os
import json
from typing import Optional

from pdf2image import convert_from_path
import pytesseract
from pytesseract import Output

from contracts import EvidenceField, Source

DPI = 200
CONF_OK = 0.85       # below this, a found value is flagged "unclear"
LINE_TOL = 0.6       # same-line tolerance as a fraction of anchor height

# Each spec: the field to produce and the label text(s) that anchor its value.
# value_is_anchor=True means the value itself is one of the anchor phrases
# (e.g. leave type is literally "Intermittent" / "Continuous").
FIELD_SPECS = [
    {"field_id": "provider.name", "group": "provider", "label": "Provider name",
     "anchors": ["name of health care provider", "health care provider", "provider name", "name of provider"],
     "max_words": 6},
    {"field_id": "condition.onset", "group": "condition", "label": "Condition onset (approx.)",
     "anchors": ["approximate date condition commenced", "date condition commenced", "commenced", "onset"],
     "max_words": 4},
    {"field_id": "leave.type", "group": "leave", "label": "Leave type",
     "anchors": ["intermittent", "continuous", "reduced schedule"], "value_is_anchor": True},
    {"field_id": "leave.frequency", "group": "leave", "label": "Frequency",
     "anchors": ["frequency", "times per", "episodes per"], "max_words": 6},
    {"field_id": "condition.nextTreatmentDate", "group": "condition", "label": "Next treatment date",
     "anchors": ["next treatment", "next visit", "next appointment"], "max_words": 4},
]


def resolve_document(source: str) -> str:
    """Return a local file path for the document.

    Local paths pass through unchanged. `s3://bucket/key` and presigned
    `http(s)://` URLs are downloaded to a temp file first, so the pipeline
    above never has to know which kind of source it got.
    """
    if source.startswith("s3://"):
        return _download_from_s3(source)
    if source.startswith(("http://", "https://")):
        return _download_from_url(source)
    if not os.path.exists(source):
        raise FileNotFoundError(source)
    return source


def _download_from_s3(s3_uri: str) -> str:
    import tempfile
    import boto3

    bucket, _, key = s3_uri[len("s3://"):].partition("/")
    if not bucket or not key:
        raise ValueError(f"malformed s3 URI: {s3_uri}")

    client = boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT") or None,  # empty/unset = real AWS S3
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )
    fd, path = tempfile.mkstemp(suffix=os.path.splitext(key)[1] or ".pdf")
    os.close(fd)
    client.download_file(bucket, key, path)
    return path


def _download_from_url(url: str) -> str:
    import tempfile
    import httpx

    fd, path = tempfile.mkstemp(suffix=".pdf")
    with os.fdopen(fd, "wb") as f, httpx.stream("GET", url, timeout=60.0) as resp:
        resp.raise_for_status()
        for chunk in resp.iter_bytes():
            f.write(chunk)
    return path


def ocr_pages(pdf_path: str):
    """OCR each page into a list of word boxes with normalized-ready geometry."""
    pages = []
    for idx, img in enumerate(convert_from_path(pdf_path, dpi=DPI)):
        data = pytesseract.image_to_data(img, output_type=Output.DICT)
        width, height = img.size
        words = []
        for i in range(len(data["text"])):
            text = (data["text"][i] or "").strip()
            conf = float(data["conf"][i])
            if not text or conf < 0:          # tesseract uses -1 for non-text
                continue
            words.append({
                "text": text, "conf": conf / 100.0,
                "left": data["left"][i], "top": data["top"][i],
                "w": data["width"][i], "h": data["height"][i],
            })
        words.sort(key=lambda w: (w["top"], w["left"]))   # reading order
        pages.append({"page": idx + 1, "width": width, "height": height, "words": words})
    return pages


def _norm_bbox(group, width, height):
    left = min(w["left"] for w in group)
    top = min(w["top"] for w in group)
    right = max(w["left"] + w["w"] for w in group)
    bottom = max(w["top"] + w["h"] for w in group)
    return [round(left / width, 4), round(top / height, 4),
            round((right - left) / width, 4), round((bottom - top) / height, 4)]


def _match_anchor(words, tokens):
    """Find consecutive words matching the anchor tokens (case-insensitive, startswith)."""
    n, m = len(words), len(tokens)
    for i in range(n - m + 1):
        if all(words[i + j]["text"].lower().startswith(tokens[j]) for j in range(m)):
            return i, i + m - 1
    return None


def find_field(spec, pages) -> Optional[dict]:
    for page in pages:
        words, width, height = page["words"], page["width"], page["height"]

        if spec.get("value_is_anchor"):
            for anchor in spec["anchors"]:
                m = _match_anchor(words, anchor.split())
                if m:
                    grp = words[m[0]:m[1] + 1]
                    return {"value": " ".join(w["text"] for w in grp),
                            "conf": sum(w["conf"] for w in grp) / len(grp),
                            "page": page["page"], "bbox": _norm_bbox(grp, width, height)}
            continue

        for anchor in spec["anchors"]:
            m = _match_anchor(words, anchor.split())
            if not m:
                continue
            end = words[m[1]]
            anchor_top, anchor_h = end["top"], end["h"]
            anchor_right = end["left"] + end["w"]
            captured = []
            for w in words:
                same_line = abs(w["top"] - anchor_top) <= LINE_TOL * anchor_h
                if same_line and w["left"] >= anchor_right:
                    if w["text"].endswith(":"):    # hit the next label
                        break
                    captured.append(w)
                    if len(captured) >= spec.get("max_words", 6):
                        break
            if captured:
                return {"value": " ".join(w["text"] for w in captured),
                        "conf": sum(w["conf"] for w in captured) / len(captured),
                        "page": page["page"], "bbox": _norm_bbox(captured, width, height)}
    return None


def to_field(spec, found, doc_id) -> EvidenceField:
    if not found:
        return EvidenceField(field_id=spec["field_id"], group=spec["group"], label=spec["label"],
                             value=None, confidence=0.0, status="missing", source=None)
    conf = round(found["conf"], 3)
    return EvidenceField(
        field_id=spec["field_id"], group=spec["group"], label=spec["label"],
        value=found["value"], confidence=conf,
        status="ok" if conf >= CONF_OK else "unclear",
        source=Source(doc_id=doc_id, page=found["page"], bbox=found["bbox"]),
    )


def main():
    if len(sys.argv) < 2:
        print("usage: python extract.py <pdf-path> [DOC-ID]", file=sys.stderr)
        sys.exit(1)

    path = resolve_document(sys.argv[1])
    doc_id = sys.argv[2] if len(sys.argv) > 2 else "DOC-001"

    pages = ocr_pages(path)
    total = sum(len(p["words"]) for p in pages)
    mean_conf = (sum(w["conf"] for p in pages for w in p["words"]) / total) if total else 0.0
    print(f"OCR: {len(pages)} page(s), {total} words, mean confidence {mean_conf:.2f}", file=sys.stderr)

    fields = [to_field(spec, find_field(spec, pages), doc_id) for spec in FIELD_SPECS]
    print(json.dumps([f.model_dump(by_alias=True) for f in fields], indent=2))


if __name__ == "__main__":
    main()
