from __future__ import annotations

import json
import sqlite3
from pathlib import Path


DB = Path(r"C:\Users\RANA\Desktop\learn_git\jnv-platform\apps\api\prisma\dev.db")


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()

    queries = {
        "schools": 'SELECT COUNT(*) FROM "School"',
        "missing_schoolName": 'SELECT COUNT(*) FROM "School" WHERE "schoolName" IS NULL OR TRIM("schoolName")=""',
        "missing_geo_state": 'SELECT COUNT(*) FROM "School" WHERE "geographicState" IS NULL OR TRIM("geographicState")=""',
        "missing_geo_district": 'SELECT COUNT(*) FROM "School" WHERE "geographicDistrict" IS NULL OR TRIM("geographicDistrict")=""',
        "missing_state_relation": 'SELECT COUNT(*) FROM "School" s LEFT JOIN "State" st ON s."stateId"=st."id" WHERE st."id" IS NULL',
        "missing_region_relation": 'SELECT COUNT(*) FROM "School" s LEFT JOIN "State" st ON s."stateId"=st."id" LEFT JOIN "RegionOffice" ro ON st."regionId"=ro."id" WHERE ro."id" IS NULL',
    }
    out = {k: cur.execute(v).fetchone()[0] for k, v in queries.items()}

    sample = cur.execute(
        """
        SELECT s."udise", s."schoolName", s."geographicDistrict", s."geographicState",
               st."name" as stateName, ro."name" as regionName
        FROM "School" s
        LEFT JOIN "State" st ON s."stateId"=st."id"
        LEFT JOIN "RegionOffice" ro ON st."regionId"=ro."id"
        ORDER BY s."updatedAt" DESC
        LIMIT 10
        """
    ).fetchall()
    out["sample_latest"] = [
        {
            "udise": r[0],
            "schoolName": r[1],
            "district": r[2],
            "geoState": r[3],
            "stateName": r[4],
            "regionName": r[5],
        }
        for r in sample
    ]
    con.close()
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
