from __future__ import annotations

import json
import urllib.request
from collections import Counter


BASE = "http://127.0.0.1:4000"


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    items = []
    page = 1
    while True:
        data = get_json(f"{BASE}/api/schools?page={page}&pageSize=100")
        batch = data.get("items", [])
        items.extend(batch)
        if len(items) >= int(data.get("total", 0)) or not batch:
            break
        page += 1

    c = Counter()
    ex: dict[str, list[str]] = {
        "headcount_split_unknown": [],
        "social_sum_mismatch": [],
        "social_all_zero": [],
        "minority_all_zero": [],
        "others_all_zero": [],
        "age_bands_missing": [],
    }

    for it in items:
        u = it["udise"]
        d = get_json(f"{BASE}/api/schools/{u}")
        head = (d.get("school") or {}).get("enrolmentHeadcount") or {}
        total = head.get("totalStudents") or 0
        boys = head.get("totalBoys")
        girls = head.get("totalGirls")
        social = d.get("enrolmentSocial") or []
        minority = d.get("enrolmentMinority") or []
        others = d.get("enrolmentOthers") or []
        age = d.get("enrolmentAge") or []

        if total > 0 and (boys is None or girls is None or ((boys or 0) + (girls or 0) == 0)):
            c["headcount_split_unknown"] += 1
            if len(ex["headcount_split_unknown"]) < 12:
                ex["headcount_split_unknown"].append(u)

        smap = {str(r.get("category", "")): (r.get("total") or 0) for r in social}
        social_core = smap.get("SC", 0) + smap.get("ST", 0) + smap.get("OBC", 0) + smap.get("General", 0)
        if total > 0 and social_core > 0 and social_core != total:
            c["social_sum_mismatch"] += 1
            if len(ex["social_sum_mismatch"]) < 12:
                ex["social_sum_mismatch"].append(u)
        if total > 0 and social_core == 0:
            c["social_all_zero"] += 1
            if len(ex["social_all_zero"]) < 12:
                ex["social_all_zero"].append(u)

        m_total = sum((r.get("total") or 0) for r in minority)
        o_total = sum((r.get("total") or 0) for r in others)
        if total > 0 and m_total == 0:
            c["minority_all_zero"] += 1
            if len(ex["minority_all_zero"]) < 12:
                ex["minority_all_zero"].append(u)
        if total > 0 and o_total == 0:
            c["others_all_zero"] += 1
            if len(ex["others_all_zero"]) < 12:
                ex["others_all_zero"].append(u)

        positive_age_bands = 0
        for r in age:
            b = str(r.get("ageBand", ""))
            t = r.get("total") or 0
            if b != "Total" and t > 0:
                positive_age_bands += 1
        if total > 0 and positive_age_bands == 0:
            c["age_bands_missing"] += 1
            if len(ex["age_bands_missing"]) < 12:
                ex["age_bands_missing"].append(u)

    print(
        json.dumps(
            {"total_schools": len(items), "anomaly_counts": dict(c), "examples": ex},
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
