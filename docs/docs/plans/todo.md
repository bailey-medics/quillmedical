# Project to-do list

Prioritised from most important to least. Items marked _(deferred)_ are blocked
on external dependencies. Items marked _(clinical)_ are only needed before
clinical/NHS go-live.

## Security and compliance

- [ ] Rotate temporary postgres admin password (`temp-admin-pw-2026`) on the `quill-ehrbase-staging` Cloud SQL instance
- [ ] Document current secrets and rotation procedure (JWT key, DB passwords, VAPID keys, CSRF secret, API keys) with rotation schedule _(pre-clinical)_
- [ ] Add a `security.txt` and responsible disclosure policy at `/.well-known/security.txt`
- [ ] Define data retention periods for UK GDPR compliance — user accounts, messages, assessments, audit logs _(pre-NHS)_
- [ ] Implement centralised audit trail for clinical data access (who accessed which patient, all modifications logged tamper-resistant) _(clinical)_
- [ ] Establish quarterly internal pentest routine (ZAP baseline + manual sessions with sqlmap/ffuf) _(clinical)_

## Monitoring and operations

- [ ] Create basic runbooks for common incidents (502s, DB connection exhaustion, cold start latency, rollback procedure)
- [ ] Write a one-page incident response plan (escalation chain, P1/P2/P3 classification, comms template, post-incident review)
- [ ] Add GCP Cloud Monitoring Slack integration (replace `webhook_token_auth` with native Slack app in `infra/modules/monitoring/main.tf`)
- [ ] Set `min_instances = 1` for the frontend Cloud Run service once there are real users
- [ ] catch and manage resend send failure

## CI/CD pipeline

- [ ] Configure GitHub Environment `production` with required reviewers _(deferred — production GCP is spun down)_
- [ ] Validate full deploy pipeline: merge to `main` → teaching auto-deploys → approve → production deploys same image _(deferred)_
- [ ] Define feature flag strategy (Terraform vs runtime config vs in-code flags), with governance and rollout policy for teaching and clinical production
- [ ] Add `mkdocs build --strict` to the heavy CI tier to catch broken links and missing nav entries
- [ ] Create `backend/scripts/check_migrations.py` — expand-contract migration lint rejecting destructive Alembic operations
- [ ] Add `pip-audit --strict` and `yarn audit --level moderate` to CI pipeline (nice-to-have gate for dependency vulnerabilities)
- [ ] Enable GitHub merge queue when 3+ developers are merging PRs in parallel (add `merge_group` trigger to `branch-ci.yml`, update job `if:` conditions, re-add `merge_queue` block in Terraform)

## Application bugs and missing features

- [ ] Eliminate teaching dashboard skeleton flash (~0.3s) — add caching layer or delay skeleton display
- [ ] Implement automatic auth state refresh via `visibilitychange` listener in `AuthContext.tsx`
- [ ] Wire up CBAC frontend hooks — `useHasCompetency` etc. are hardcoded to `false`, hiding entitled features _(clinical)_

## Refactoring and code quality

- [ ] Refactor `AddPatientToOrgPage.tsx` and `NewMessageModal` to use `Form<T>`, `FormStatus`, `SubmitButton`
- [ ] Replace inline modal in `DirtyFormNavigation` with `ConfirmModal` (keep only `useBlocker` logic)
- [ ] Deduplicate push notification subscription logic into a shared `usePushSubscription` hook
- [ ] Use `api` client in push notification code (currently raw `fetch()`, bypasses CSRF and auth cookies)
- [x] Lock **version** value in teaching schema — once locked, same version `config.yaml` cannot be reused; must iterate upwards

## Testing

- [ ] Increase `required_approving_review_count` from 0 to 1 in branch rules when a second developer joins

## Web push notifications (production-readiness)

- [ ] Re-enable notifications ActionCard on `/settings` page once push notifications are needed
- [ ] Persistent subscription storage — move from in-memory list to `PushSubscription` DB model
- [ ] Automated triggers — send notifications on real events (messages, appointments, clinical alerts)
- [ ] VAPID key documentation — ensure `dev-env-check.sh` validates keys exist
- [ ] Need user to confirm we are enabling notifications and they are happy (a legal requirement)

## Infrastructure

- [ ] Redesign `infra/modules/compute-fhir/startup.sh` for COS (Docker Compose cannot run on Container-Optimised OS)
- [ ] Automate `uuid-ossp` extension creation for EHRbase Cloud SQL database
- [ ] Add missing EHRbase env vars (`DB_USER_ADMIN`, `DB_PASS_ADMIN`) to Terraform compute-fhir module
- [ ] Add backup strategy for FHIR and EHRbase databases (disk snapshots or migrate to Cloud SQL)
- [ ] Write backup restore SOP (daily restore vs PITR, step-by-step, permissions, comms plan, quarterly drill)

## Documentation

- [ ] Create `.github/instructions/backend.instructions.md` scoped to `backend/**` with Alembic expand-contract rules

## Public site

- [ ] Reenable EPR nav link to production URL once production is active _(deferred)_

## Dependency management

- [ ] Enable Dependabot alerts in repo settings
- [ ] Ensure `info@quill-medical.com` GitHub account watches the repo for security alerts
- [ ] Configure email routing for `bailey-medics/quillmedical` notifications
- [ ] Create repo labels: `dependencies`, `security`, `major-version-bump`, `hotfix`, `tier-1-clinical`, `back-merge`
- [ ] Update all libraries to most recent
