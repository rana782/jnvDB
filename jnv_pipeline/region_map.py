from __future__ import annotations

from typing import Final


REGION_MAP: Final[dict[tuple[str, ...], tuple[str, str]]] = {
    ("Madhya Pradesh", "Chhattisgarh", "Odisha"): ("RO-1", "Bhopal"),
    ("Bihar", "Jharkhand", "West Bengal"): ("RO-2", "Patna"),
    ("Uttar Pradesh", "Uttarakhand"): ("RO-3", "Lucknow"),
    ("Rajasthan", "Haryana", "Delhi", "Punjab"): ("RO-4", "Jaipur"),
    ("Himachal Pradesh", "Jammu and Kashmir", "Ladakh", "Chandigarh"): ("RO-5", "Chandigarh"),
    (
        "Arunachal Pradesh",
        "Assam",
        "Manipur",
        "Meghalaya",
        "Mizoram",
        "Nagaland",
        "Sikkim",
        "Tripura",
        "Andaman and Nicobar Islands",
    ): ("RO-6", "Shillong"),
    (
        "Telangana",
        "Andhra Pradesh",
        "Karnataka",
        "Kerala",
        "Tamil Nadu",
        "Lakshadweep",
        "Puducherry",
    ): ("RO-7", "Hyderabad"),
    ("Maharashtra", "Goa", "Gujarat", "Dadra and Nagar Haveli and Daman and Diu"): ("RO-8", "Pune"),
}


STATE_ALIASES: Final[dict[str, str]] = {
    "jammu & kashmir": "Jammu and Kashmir",
    "jammu and kashmir": "Jammu and Kashmir",
    "andaman & nicobar": "Andaman and Nicobar Islands",
    "andaman and nicobar": "Andaman and Nicobar Islands",
    "dadra & nagar haveli and daman & diu": "Dadra and Nagar Haveli and Daman and Diu",
    "dadra and nagar haveli and daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
    "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
    "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
    "daman": "Dadra and Nagar Haveli and Daman and Diu",
    "diu": "Dadra and Nagar Haveli and Daman and Diu",
    "ladakh": "Ladakh",
    "nct of delhi": "Delhi",
}


def normalize_state_name(raw: str | None) -> str:
    if not raw:
        return ""
    s = " ".join(raw.strip().split())
    s = s.replace("NAVODAYA VIDYALAYA SAMITI", "").strip()
    low = s.lower()
    if low in STATE_ALIASES:
        return STATE_ALIASES[low]
    parts = [p.capitalize() if p.lower() not in {"and", "of"} else p.lower() for p in s.lower().split()]
    return " ".join(parts)


def region_for_state(state: str | None) -> tuple[str, str]:
    clean = normalize_state_name(state)
    if not clean:
        return ("", "")
    for states, ro in REGION_MAP.items():
        if clean in states:
            return ro
    return ("", "")
