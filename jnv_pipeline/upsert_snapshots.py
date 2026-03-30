from __future__ import annotations

import json
import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()
    rows = cur.execute(
        """
        SELECT
          "udise",
          "academicYear",
          "pdfRelativePath",
          "sourcePdfHash",
          "overallExtractionConfidence",
          "totalStudents",
          "totalBoys",
          "totalGirls"
        FROM "School"
        """
    ).fetchall()

    upserted = 0
    for udise, year, pdf_path, src_hash, conf, total, boys, girls in rows:
        payload = {
            "schemaVersion": 2,
            "structured": {"students": {"total": total, "boys": boys, "girls": girls}},
            "provenance": {"source": "jnv_master_import"},
        }
        pdf = pdf_path or f"jnv-platform/tools/pmshri-crawler/data/pdfs/{udise}.pdf"
        shash = src_hash or f"import-{udise}"
        oconf = conf if conf is not None else 0.9

        cur.execute(
            """
            INSERT INTO "SchoolReportCardSnapshot" (
              "udise","academicYear","sourcePdfHash","pdfRelativePath","payload",
              "overallConfidence","extractedAt","updatedAt"
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT("udise") DO UPDATE SET
              "academicYear"=excluded."academicYear",
              "sourcePdfHash"=excluded."sourcePdfHash",
              "pdfRelativePath"=excluded."pdfRelativePath",
              "payload"=excluded."payload",
              "overallConfidence"=excluded."overallConfidence",
              "updatedAt"=CURRENT_TIMESTAMP
            """,
            (udise, year, shash, pdf, json.dumps(payload), oconf),
        )
        upserted += 1

    con.commit()
    con.close()
    print(f"snapshots_upserted={upserted}")


if __name__ == "__main__":
    main()
