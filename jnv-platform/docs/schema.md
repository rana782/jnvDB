# Prisma model glossary (JNV platform)

Primary business key for schools is **UDISE** (11 digits, normalized with leading zeros). Geographic dimensions use optional relations to `State` / `District` / `RegionOffice` when reference data is seeded.

| Model | Purpose |
| --- | --- |
| `RegionOffice` | NVS regional offices (RO-1 … RO-8). |
| `State` / `District` | Normalized geography; `School` may link via `stateId` / `districtId` or use textual `geographicState` / `geographicDistrict` from scrape. |
| `School` | Core profile: enrolment headcount, infra flags, parsing/review/pipeline status, PDF paths, manual revenue overrides. |
| `SchoolProfile` | Optional raw JSON snapshot from APIs. |
| `SchoolInfra`, `SchoolDigitalFacilities` | Structured facility counts / booleans + JSONB `extra`. |
| `SchoolTeacherBreakdown` | 1:N labelled teacher counts (category + label). |
| `SchoolEnrolment*` | Social / minority / other / age-band tables with optional JSONB `extra`. |
| `SchoolRevenueScenario` | LOW/MEDIUM/HIGH/CUSTOM calculator outputs with JSONB `inputs`. |
| `SchoolProgress` | Pipeline transitions with optional actor. |
| `SchoolNote` | Manual diligence notes and follow-up dates. |
| `SchoolDocument` | File inventory with hash + path. |
| `SchoolExtractionRaw` | PDF parse payloads, confidence, warnings JSONB. |
| `ImportJob` / `ImportError` | Ingestion job lifecycle and per-file errors. |
| `AuditLog` | Actor, entity, JSON diff for sensitive mutations. |
| `FounderUser` / `Role` / `FounderUserRole` | Internal auth + RBAC. |

Enums: `ParsingStatus`, `ReviewStatus`, `CompletionPipelineStatus`, `RevenueScenarioKind`, `ImportJobStatus`.
