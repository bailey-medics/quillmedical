# Project to-do list

Prioritised from most important to least. Items marked _(deferred)_ are blocked
on external dependencies. Items marked _(clinical)_ are only needed before
clinical/NHS go-live.

## Security and compliance

- [ ] Rotate temporary postgres admin password (`temp-admin-pw-2026`) on the `quill-ehrbase-staging` Cloud SQL instance
- [ ] Document current secrets and rotation procedure (JWT key, DB passwords, VAPID keys, CSRF secret, API keys) with rotation schedule _(pre-clinical)_ — existing secrets inventory in `docs/docs/infrastructure/gcp.md` can be extended
- [ ] Add a `security.txt` and responsible disclosure policy at `/.well-known/security.txt` — add to `frontend/public/.well-known/` or configure via Caddy routing
- [ ] Define data retention periods for UK GDPR compliance — user accounts, messages, assessments, audit logs _(pre-NHS)_ — existing compliance framing in `docs/docs/safety/overview/regulatory-framework.md`
- [ ] Implement centralised audit trail for clinical data access (who accessed which patient, all modifications logged tamper-resistant) _(clinical)_ — partial groundwork exists with TODOs in `backend/app/cbac/decorators.py` (lines 58, 73); teaching audit model in `backend/app/features/teaching/models.py` can serve as pattern
- [ ] Establish quarterly internal pentest routine (ZAP baseline + manual sessions with sqlmap/ffuf) _(clinical)_ — automated monthly/weekly ZAP scans already active in `.github/workflows/security-pentest.yml` and `zap-scan.yml`; manual routine deferred per `docs/docs/plans/pentesting-plan.md`

## Monitoring and operations

- [ ] Create basic runbooks for common incidents (502s, DB connection exhaustion, cold start latency, rollback procedure) — incident snippets in hazard docs can seed these
- [ ] Write a one-page incident response plan (escalation chain, P1/P2/P3 classification, comms template, post-incident review)
- [ ] Add GCP Cloud Monitoring Slack integration (replace `webhook_token_auth` with native Slack app in `infra/modules/monitoring/main.tf`) — current webhook URL plumbing at line 24 of that file
- [ ] Set `min_instances = 1` for the frontend Cloud Run service once there are real users — one-line change: add `min_instances = 1` to frontend module call in `infra/main.tf` (line ~301); module var defaults to 0 in `infra/modules/cloud-run/variables.tf`
- [ ] Catch and manage Resend send failure — `backend/app/email_send.py` line 131 has no try/except around the provider call; rate-limit/missing-key handling in same file can serve as pattern

## CI/CD pipeline

- [ ] Configure GitHub Environment `production` with required reviewers _(deferred — production GCP is spun down)_ — deploy workflow references production env at `.github/workflows/deploy.yml` line 208
- [ ] Validate full deploy pipeline: merge to `main` → teaching auto-deploys → approve → production deploys same image _(deferred)_ — production promotion currently disabled with `if: false` in deploy workflow line ~203; pipeline design documented in `docs/docs/cicd/index.md`
- [ ] Define feature flag strategy (Terraform vs runtime config vs in-code flags), with governance and rollout policy for teaching and clinical production — implementation exists (`RequireFeature`, `featureFlags.ts`) but strategy/governance doc is missing
- [ ] Add `mkdocs build --strict` to the heavy CI tier to catch broken links and missing nav entries — currently runs without `--strict` in `.github/workflows/docs.yml` line 150
- [ ] Create `backend/scripts/check_migrations.py` — expand-contract migration lint rejecting destructive Alembic operations; intent documented in `docs/docs/plans/github-branching-plan.md` line ~640
- [ ] Add `pip-audit --strict` and `yarn audit --level moderate` to CI pipeline (nice-to-have gate for dependency vulnerabilities)
- [ ] Enable GitHub merge queue when 3+ developers are merging PRs in parallel (add `merge_group` trigger to `branch-ci.yml`, update job `if:` conditions, re-add `merge_queue` block in Terraform)

## Application bugs and missing features

- [ ] Eliminate teaching dashboard skeleton flash (~0.3s) — add caching layer or delay skeleton display; loading state in `AdminTeachingPage.tsx` (lines 96–113) passes directly to `DataTableWithResults.tsx` (line 83) which renders Skeleton immediately with no delay threshold
- [ ] Implement automatic auth state refresh via `visibilitychange` listener in `AuthContext.tsx` — current reload only fires on mount (line ~138); add `document.addEventListener("visibilitychange", ...)` beside that effect
- [ ] Wire up CBAC frontend hooks — `useHasCompetency` etc. are hardcoded to `false`, hiding entitled features _(clinical)_ — hooks at `frontend/src/lib/cbac/hooks.ts` lines 34–66; needs user competencies exposed in auth state or fetched from backend

## Refactoring and code quality

- [ ] Refactor `AddPatientToOrgPage.tsx` to use `Form<T>`, `FormStatus`, `SubmitButton` — still uses raw form and ButtonPair (lines 128, 145); `NewMessageModal` already migrated to Form pattern
- [ ] Deduplicate push notification subscription logic into a shared `usePushSubscription` hook — duplicate base64 helper in `Settings.tsx` (line 25) and `EnableNotificationsButton.tsx` (line 4); consolidate permission request, SW readiness, subscribe call, and backend registration
- [ ] Use `api` client in push notification code (currently raw `fetch()`, bypasses CSRF and auth cookies) — `Settings.tsx` already uses api client (line 71); `EnableNotificationsButton.tsx` still uses raw fetch (line 40)

## Testing

- [ ] Increase `required_approving_review_count` from 0 to 1 in branch rules when a second developer joins — currently 0 in `infra/github/branch_rules.tf` line 85

## Web push notifications (production-readiness)

- [ ] Re-enable notifications ActionCard on `/settings` page once push notifications are needed — gated by feature flag in `frontend/src/lib/featureFlags.ts` line 12 (currently `false`); one-line change to re-enable
- [ ] Automated triggers — send notifications on real events (messages, appointments, clinical alerts) — current push send is test-only endpoint in `backend/app/push_send.py`; wire from actual business events
- [ ] VAPID key documentation — ensure `dev-env-check.sh` validates keys exist — script currently only checks `BACKEND_ENV` (line 4); add VAPID env var checks
- [ ] Need user to confirm we are enabling notifications and they are happy (a legal requirement) — current flow calls `Notification.requestPermission()` directly with no app-level consent capture or audit trail

## Infrastructure

- [ ] Redesign `infra/modules/compute-fhir/startup.sh` for COS (Docker Compose cannot run on Container-Optimised OS) — script acknowledges COS constraints (line 7) but still generates docker-compose.yml (line 41) and runs `docker compose up` (line 87)
- [ ] Automate `uuid-ossp` extension creation for EHRbase Cloud SQL database — currently applied manually per `docs/docs/learnings/fhir-ehrbase-issues.md`; could add to startup.sh before EHRbase start
- [ ] Add missing EHRbase env vars (`DB_USER_ADMIN`, `DB_PASS_ADMIN`) to Terraform compute-fhir module — startup.sh only has `DB_USER`/`DB_PASS` (lines 67–68); working examples in `compose.prod.fhir-openehr.yml` lines 96–97
- [ ] Write backup restore SOP (daily restore vs PITR, step-by-step, permissions, comms plan, quarterly drill) — partial restore guidance exists in `docs/docs/infrastructure/gcp.md` line ~596; needs formal SOP

## Documentation

- [ ] Create `.github/instructions/backend.instructions.md` scoped to `backend/**` with Alembic expand-contract rules

## Public site

- [ ] Reenable EPR nav link to production URL once production is active _(deferred)_ — disabled in `frontend/src/components/ribbon/publicNavLinks.ts` line 19 (`href: "#", disabled: true`)

## Dependency management

- [ ] Ensure `info@quill-medical.com` GitHub account watches the repo for security alerts — manual verification needed in GitHub notification settings
- [ ] Configure email routing for `bailey-medics/quillmedical` notifications — manual GitHub routing setup; documented as required in `docs/docs/dependencies/automatic-updates.md`
- [ ] Create repo labels: `dependencies`, `security`, `major-version-bump`, `hotfix`, `tier-1-clinical`, `back-merge` — no `github_issue_label` Terraform resources found; may exist manually on GitHub
- [ ] Update all libraries to most recent — Renovate (`renovate.json`) and Dependabot configured for ongoing updates; one-time catch-up not evidenced as complete
