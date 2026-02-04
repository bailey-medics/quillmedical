# TODO

- Read audit
- full logging
- bandit
- ts equivalent
- pre-commit
- add tests
- document
- E2E tests
- CI/CD
- production build
- hardening
- dedicated secrets server
- Time-based One-Time Password (TOTP) 2FA - IETF RFC 6238 standard
- suspend account after multiple failed login attempts
- get public_pages not-found.tsx to use the NotFoundLayout component
- enable search field to find patients by name, dob, nhs
- CORS

## If your goal is both “time on page” and “API latency”, a neat approach is

- Frontend: PostHog JS SDK → page views, task timers, flows.
- Backend: OpenTelemetry Python + FastAPI integration → API timings.
- Dashboard: Grafana/Metabase, or PostHog’s own product analytics dashboards.

## openEHR glos

COMPOSITION → Document

SECTION → Slice / Chapter

ENTRY → Note / Field

ARCHETYPE → Blueprint

TEMPLATE → Form

VERSIONED_COMPOSITION → Document with history
