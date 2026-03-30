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
    missing_examples: dict[str, list[str]] = {
        "missing_headcount": [],
        "empty_social": [],
        "empty_minority": [],
        "empty_others": [],
        "empty_age": [],
    }

    for it in items:
        u = it["udise"]
        d = get_json(f"{BASE}/api/schools/{u}")
        school = d.get("school", {})
        head = school.get("enrolmentHeadcount", {})
        total = head.get("totalStudents")
        boys = head.get("totalBoys")
        girls = head.get("totalGirls")
        social = d.get("enrolmentSocial", []) or []
        minority = d.get("enrolmentMinority", []) or []
        others = d.get("enrolmentOthers", []) or []
        age = d.get("enrolmentAge", []) or []

        if total is None or boys is None or girls is None:
            c["missing_headcount"] += 1
            if len(missing_examples["missing_headcount"]) < 10:
                missing_examples["missing_headcount"].append(u)
        if len(social) == 0:
            c["empty_social"] += 1
            if len(missing_examples["empty_social"]) < 10:
                missing_examples["empty_social"].append(u)
        if len(minority) == 0:
            c["empty_minority"] += 1
            if len(missing_examples["empty_minority"]) < 10:
                missing_examples["empty_minority"].append(u)
        if len(others) == 0:
            c["empty_others"] += 1
            if len(missing_examples["empty_others"]) < 10:
                missing_examples["empty_others"].append(u)
        if len(age) == 0:
            c["empty_age"] += 1
            if len(missing_examples["empty_age"]) < 10:
                missing_examples["empty_age"].append(u)

    out = {
        "total_schools": len(items),
        "coverage_gaps": dict(c),
        "examples": missing_examples,
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
