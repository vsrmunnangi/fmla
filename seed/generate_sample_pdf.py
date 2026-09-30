#!/usr/bin/env python3
"""Generates seed/sample-wh380e.pdf — a synthetic WH-380-E-shaped document for testing
extract.py / the /process endpoint end to end. Dev-only tool (not a runtime dependency);
requires `pip install reportlab`. The PDF itself is committed, so this only needs to be
re-run if the fixture layout changes.

Field anchors here are written to match services/processor/extract.py's FIELD_SPECS
exactly (same-line label -> value, label immediately followed by ':') so the crude
anchor-based extractor can find them for real.

Deliberately synthetic/fake data only (§3, invariant #7 — no real PHI).
"""
import os

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT_PATH = os.path.join(os.path.dirname(__file__), "sample-wh380e.pdf")

LINES = [
    ("WH-380-E CERTIFICATION OF HEALTH CARE PROVIDER", 16, True),
    ("", 12, False),
    ("Name of health care provider: Dr. Sarah Johnson MD", 12, False),
    ("", 12, False),
    ("Approximate date condition commenced: March 15, 2025", 12, False),
    ("", 12, False),
    ("Leave type: Intermittent", 12, False),
    ("", 12, False),
    ("Frequency: 2 episodes per month, 1 day each", 12, False),
    ("", 12, False),
    ("Next treatment: April 10, 2025", 12, False),
    ("", 12, False),
    ("Provider signature: S. Johnson, MD", 12, False),
]


def main():
    c = canvas.Canvas(OUT_PATH, pagesize=letter)
    width, height = letter
    y = height - 100
    for text, size, bold in LINES:
        c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        if text:
            c.drawString(72, y, text)
        y -= size + 12
    c.showPage()
    c.save()
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
