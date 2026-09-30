#!/usr/bin/env python3
"""Generates seed/sample-first-report-of-injury.pdf — a synthetic Workers' Comp intake
document for testing the "FirstReportOfInjury" doc type end to end. Same pattern as
generate_sample_pdf.py (WH-380-E); anchors here match
services/processor/categories/workers_comp.py's FIELD_SPECS exactly.

Dev-only tool (not a runtime dependency); requires `pip install reportlab`.
Deliberately synthetic/fake data only (§3, invariant #7 — no real PHI).
"""
import os

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

OUT_PATH = os.path.join(os.path.dirname(__file__), "sample-first-report-of-injury.pdf")

LINES = [
    ("FIRST REPORT OF INJURY", 16, True),
    ("", 12, False),
    ("Employer name: Acme Manufacturing Co", 12, False),
    ("", 12, False),
    ("Date of injury: June 3, 2025", 12, False),
    ("", 12, False),
    ("Description of injury: Laceration to left hand", 12, False),
    ("", 12, False),
    ("Body part injured: Left hand", 12, False),
    ("", 12, False),
    ("Treatment facility: Springfield Occupational Health Clinic", 12, False),
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
