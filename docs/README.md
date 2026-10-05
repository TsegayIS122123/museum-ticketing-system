# Documentation index

Reference documentation for **ZNHM Ticketing**, the unified digital ticketing platform of the **Zoological Natural History Museum (ZNHM)**, AAU CNCS, 4 Killo, Addis Ababa. Every `FR-*`/`NFR-*`/`ADR-*` referenced in code comments across `backend/`, `frontend/`, and `mobile/` is defined here.

`contracts/openapi.yaml` (repo root) is the **authoritative** API contract: it is generated from the live Django schema and checked for drift in CI. `docs/04-openapi-specification.yaml` is the **historical** hand-authored spec from the design phase, retained for reference and not kept in sync.

## The document set

| Document | One line |
|---|---|
| [01 — Product Overview](01-product-overview.md) | Vision, problem, positioning, the four roles, the core journey, and the mobile client. |
| [02 — Software Requirements Specification](02-software-requirements-specification.md) | Functional and non-functional requirements, including QR, notifications, and the audit log. |
| [03 — Software Design Specification](03-software-design-specification.md) | Architecture, backend modules, authentication, background jobs, and the ADR set. |
| [04 — API Specification (historical)](04-openapi-specification.yaml) | The original hand-authored OpenAPI spec; see the contract for the implemented API. |
| [04a — API changes since Document 04](04a-api-changes-since-doc-04.md) | How the implemented API differs from Document 04, in prose. |
| [05 — Database Design](05-database-design.md) | Table-level schema, keys, constraints, and indexing. |
| [06 — UI/UX Specification](06-ui-ux-specification.md) | Screens, design system, key flows, and UI-level localization. |
| [07 — Testing and Quality Assurance](07-testing-and-quality-assurance.md) | Test strategy, test cases, coverage gates, and traceability. |
| [08 — Deployment and DevOps](08-deployment-and-devops.md) | Environments, CI/CD, monitoring, backup, and mobile release. |
| [09 — Mobile Application Design](09-mobile-app-design.md) | The native four-role client: architecture, modules, offline vault, and integration. |
| [ifmis-decision-summary.md](ifmis-decision-summary.md) | The scope decision on the platform's relationship to IFMIS. |
