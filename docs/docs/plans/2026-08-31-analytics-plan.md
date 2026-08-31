# Analytics plan

Quill has no analytics of any kind. There is no web analytics on the public
site, no product analytics in the app, and no frontend error tracking — the
only telemetry that exists is structured JSON logging to Cloud Logging plus the
uptime checks and alert policies in `infra/modules/monitoring`. So there is
currently no way to answer either of the two questions that matter commercially:
who arrives at the marketing site and whether they convert, and what signed-in
users actually do once they are inside the teaching product.

This is a decision that is easy to get wrong in a way that is expensive to
reverse. Analytics touches the CSP, the cookie and privacy policies, the DPIA,
the sub-processor list, and — once clinical data lands — the DSPT and DTAC
assurance record. Bolting on the obvious free tool now would create a
compliance liability that has to be unpicked later, at exactly the point when
unpicking it is hardest. The UK legal position also changed materially this
year: the Data (Use and Access) Act 2025 amendments to PECR came into force on
5 February 2026 and created a statistical purposes exception that removes the
cookie banner for qualifying first-party analytics — while simultaneously
raising PECR penalties to UK GDPR levels. Advice written before 2026 is out of
date on both halves of that.

This plan records the research, the options considered, and the recommended
route: build a vendor-independent typed event catalogue first, adopt PostHog
Cloud (EU) behind a first-party proxy for the low-risk surfaces, and keep a
GCP-native BigQuery sink for anything clinical.

## What "analytics" means here

Four distinct things get conflated under the word. They have different risk
profiles, different owners, and different answers, so they are separated
throughout this plan:

- **Lane A — web analytics.** Who visits the marketing site, from where, and
  whether they reach the contact form. Low risk: no authentication, no PHI.
  Nothing today.

- **Lane B — product analytics.** What signed-in users do, and where they drop
  out. High risk: authenticated healthcare users now, PHI later. Nothing today.

- **Lane C — observability.** Whether it is up, fast, and erroring. Medium
  risk, in that logs must never carry PHI. Partly covered:
  `backend/app/logging_config.py` emits JSON to Cloud Logging and
  `infra/modules/monitoring` runs uptime checks, but there is **no frontend
  error tracking at all**.

- **Lane D — in-product analytics features.** Cohort pass rates, commonly
  missed questions — a feature Quill sells, gated by the existing
  `view_teaching_analytics` competency and built from `assessments` and
  `assessment_answers`. Not a vendor decision, and out of scope here.

Lane D is listed only so it is not confused with lane B. Buying a
product-analytics tool does not deliver the teaching dashboards, and building
those dashboards does not tell you why users abandon signup. This plan covers
lanes A and B, and notes where lane C rides along for free.

## The 2026 UK regulatory position

- **The statistical purposes exception is real, and Quill can use it.** The
  DUAA received Royal Assent on 19 June 2025; its PECR amendments came into
  force on 5 February 2026, creating five new exceptions to the cookie-consent
  rule. Qualifying first-party analytics can now run **without a consent
  banner**.

- **The ICO reads it strictly.** To rely on it, all of the following must
  hold: the data produces aggregate statistics that cannot reasonably identify
  an individual; it is used **solely** to understand and improve **your own**
  service, for the users it was collected from; any provider acts as a
  **processor**, not a joint controller, with no contractual right to use the
  data for its own purposes (advertising, product development, model training,
  benchmarking); the data is not combined with other sources and involves no
  profiling; you give clear and comprehensive information about what is
  stored; and you offer a simple and free means to object, available at first
  use.

- **The exception removes the banner, not the obligations.** The notice, the
  opt-out, the DPIA and UK GDPR duties on the data all survive it.

- **The downside risk grew this year.** The DUAA raised PECR penalties to UK
  GDPR levels — up to £17.5m or 4% of global turnover — with the
  penalty-notice provisions applying from 19 June 2026.

- **GA4 is excluded.** It fails the test three ways: Google is a joint
  controller rather than a processor; GA data feeds Google's advertising
  systems, machine-learning models and benchmarking products, breaking the
  sole-purpose test; and the `_ga` cookie assigns a persistent Client ID that
  identifies returning visitors, so the data is not aggregate-only. A heavily
  stripped GA4 (advertising features, Google Signals and User-ID disabled) can
  be argued into the exception, but the argument is fragile, the configuration
  is one console click from being wrong, and it would have to be defended at
  DSPT audit. A bad trade for a free tool.

- **Health data raises the bar inside the app.** Behavioural data can reveal
  health status without containing a single clinical field: a URL path, a
  feature name, a screen title, or the sequence and timing of actions can all
  disclose that a person has or is being treated for a condition. In a patient
  or clinician surface, "we only send page views" is not a safety argument —
  the page view *is* the disclosure.

- **Every vendor is a permanent assurance liability.** The DSPT is now aligned
  to the NCSC Cyber Assessment Framework — outcome-based, evidencing that
  controls work — reaching large IT suppliers in 2025-26 and all organisations
  by 2026-27, with DTAC assessing the product. Each analytics sub-processor
  adds a declaration, a DPIA section, a residency claim to evidence, a
  retention policy to enforce, and an annual contract review. That recurring
  cost never appears on the pricing page, and it is the strongest argument for
  keeping the vendor count at one — or zero.

## Codebase fit

Facts established by reading the repository, which constrain the choice:

- **The CSP forbids third-party scripts.** `caddy/prod/Caddyfile` line 25 sets
  `script-src 'self'` and `connect-src 'self'`, so no vendor snippet can load
  or send anything without loosening the policy. Weakening a good CSP to add
  analytics would be a straight downgrade of the security posture and an
  awkward line item at audit. The resolution is not to relax it: install the
  vendor library from npm (bundled, so `'self'`) and proxy its ingest endpoint
  through Caddy on Quill's own domain (so `connect-src 'self'` still holds).
  This is what the vendors themselves now recommend anyway, for ad-blocker
  resilience and first-party cookie lifetimes — the CSP is pushing the
  architecture in the right direction.

- **There is already a shared-config-to-typed-code pipeline.**
  `shared/competencies.yaml` and `shared/base-professions.yaml` are read by the
  backend via PyYAML and by the frontend via
  `frontend/scripts/generate-json-from-yaml.ts` into `src/generated/`. An event
  catalogue at `shared/analytics-events.yaml` slots in with a one-line change
  to `FILES_TO_GENERATE`, and inherits the review discipline that already
  applies to competencies.

- **Structured logging is already in place.** `logging_config.py` emits JSON
  with a `RequestContextFilter` carrying `request_id` and `user_id`, and Cloud
  Run forwards it to Cloud Logging, which parses it natively. A dedicated
  `analytics` logger plus a Cloud Logging sink to BigQuery is a small addition
  to a pipeline that already exists and is already paid for.

- **Two surfaces, one injection point each.**
  `frontend/public_pages/templates/page.html` is the single `<head>` for every
  static marketing page; `frontend/src/RootLayout.tsx` wraps the 63 routes
  defined in `main.tsx` and is the natural home for a route-to-event-name map
  that keeps raw URLs out of the payload.

- **Three open `todo.md` items collapse into this work.** The feature-flag
  strategy item (implementation exists in `RequireFeature` and
  `featureFlags.ts`; strategy doc missing), the total absence of frontend error
  tracking, and the cookie and privacy policy pages — currently placeholder
  stubs saying the content "is currently being finalised". The first two ship
  in the box with a product-analytics platform; the third is a blocker for this
  work whichever option is chosen.

## Options considered

- **PostHog Cloud (EU) — recommended.** Product analytics, feature flags,
  experiments, surveys, session replay and error tracking in one platform, with
  EU hosting, a DPA, SOC 2, and a HIPAA BAA available on paid plans without an
  enterprise contract. The free tier covers 1M analytics events, 5,000 session
  recordings, 1M feature-flag requests and 100K exceptions per month — Quill's
  teaching volumes are nowhere near this, so realistic cost is £0. Covers lanes
  A, B and the missing half of C, and supplies the feature-flag infrastructure
  `todo.md` wants a strategy for: one vendor, one DPIA, one sub-processor
  entry. The risks are real and manageable: autocapture, GeoIP enrichment, URL
  capture, session replay and backend event properties all carry PHI in a
  default setup and must each be explicitly disabled or masked, and PostHog's
  *managed* reverse proxy is excluded from BAA coverage, so the proxy must be
  Quill's own — which the Caddy setup makes straightforward.

- **A caveat on the PostHog escape hatch.** PostHog deprecated supported
  self-hosting. What remains is an MIT-licensed "hobby" Docker Compose
  deployment: one project, no commercial support, no Kubernetes, several
  features missing. It is a credible bolt-hole for a small deployment, not an
  enterprise fallback. Do not choose PostHog on the assumption that
  self-hosting is a serious option later — choose it on the EU-cloud terms,
  with BigQuery as the real exit.

- **Matomo, self-hosted or Matomo Cloud EU.** Full data ownership, GPL,
  on-premise, mature GDPR tooling, and genuinely strong for lane A. Weaker for
  lane B — a web analytics product first, with thinner funnels, retention and
  cohort analysis, partly behind paid plugins (heatmaps €199/yr, session
  recording €149/yr, A/B testing €249/yr). Cloud starts at €29/month for 50,000
  *hits* — every event, download and outbound click is a hit, so budgets go two
  to three times faster than they look. Against it: self-hosting adds a fourth
  stateful database service (MySQL/MariaDB) to a stack already running three
  Postgres instances, on a team of one, with a permanent patching obligation.
  An unpatched self-hosted analytics server is a worse DSPT finding than a
  well-documented EU processor.

- **GCP-native first-party pipeline.** Typed events from FastAPI as structured
  logs → Cloud Logging sink → BigQuery → Looker Studio. Pennies at Quill's
  volume, on infrastructure already provisioned, and the strongest governance
  answer available: **zero new sub-processors**, nothing to declare at DSPT or
  DTAC, and no PECR question at all for server-side events tied to an
  authenticated session, since nothing is stored on or read from the user's
  device. Against it: no funnels, retention curves or cohort UI out of the box
  — that is SQL you write and dashboards you build — no client-side events
  without an ingest endpoint of your own, and no session replay, error tracking
  or feature flags. It answers "what happened" well and "why did they leave"
  poorly.

- **Plausible or Umami for the marketing site only.** Cookie-free,
  aggregate-only, EU-hosted, roughly £9–19/month, and can be self-hosted.
  Comfortably inside the statistical purposes exception, and a single script
  tag in `page.html`. But it solves lane A alone, so adopting it alongside a
  product-analytics tool means two vendors and two DPIAs for one job. Its real
  role is as the fallback if the decision is to keep the app entirely free of
  third-party analytics.

- **Warehouse-native (Mitzu, Kubit, Snowplow).** The genuine 2026 direction of
  travel: keep first-party behavioural data in the warehouse and point a
  product-analytics UI at it, rather than copying events into a vendor's event
  store. Given Quill is already on GCP with BigQuery available, this is the
  natural end state at scale. Premature now — these are priced and scoped for
  organisations with data teams. It is, however, the reason the BigQuery sink
  is worth building even alongside PostHog: a first-party event stream in the
  warehouse is the asset that makes the transition cheap later, and it is much
  harder to reconstruct after the fact.

## Phase 0: event catalogue

Vendor-independent, and worth doing whatever else is decided. This is what
stops the taxonomy rotting, which is how analytics implementations actually
fail — not through a bad tool choice, but through naming drift and untyped
properties nobody enforces. Current practice is tracking-plan-as-code: the
schema lives in version control, changes go through pull request, and CI
rejects malformed or undeclared events.

- [ ] Create `shared/analytics-events.yaml` following the `competencies.yaml`
      pattern — event ID, object-action name, description, allowed properties
      with types, surface (`public` / `teaching` / `clinical`), and a
      PHI-safety classification
- [ ] Add `analytics-events.yaml` to `FILES_TO_GENERATE` in
      `frontend/scripts/generate-json-from-yaml.ts`
- [ ] Add the generated event types to `frontend/src/types/` and a loader in
      `backend/app/analytics/` reading the YAML via PyYAML
- [ ] Seed 20–40 events using object-action naming (`assessment_started`,
      `assessment_completed`, `signup_form_submitted`); cap the catalogue at
      200 permanently
- [ ] Add a CI check rejecting any capture call whose event or property is not
      in the catalogue, and any property name matching a PHI denylist
- [ ] Backend tests for the loader and denylist (`just ub`)

## Phase 1: marketing site

The low-risk surface, and the right place to prove the plumbing.

- [ ] Add PostHog via npm to `frontend/public_pages`, initialised from
      `templates/page.html` — no vendor CDN, so the CSP stays as it is
- [ ] Add a Caddy reverse-proxy route so ingest is first-party on Quill's own
      domain, in `caddy/prod/Caddyfile` and `caddy/dev/Caddyfile`
- [ ] Configure aggregate-only capture: no advertising features, no
      cross-source combination, EU region
- [ ] Write the cookie policy page
      (`frontend/public_pages/src/pages/cookie-policy.tsx`), including the
      opt-out, replacing the current stub
- [ ] Confirm no consent banner is required, and record the statistical
      purposes qualification analysis in the DPIA

## Phase 2: teaching app

- [ ] Add `frontend/src/lib/analytics/` with a sink adapter, a
      `useAnalytics` hook, and the generated event types
- [ ] Initialise with `autocapture: false` and
      `disable_session_recording: true` — manual, catalogue-checked events only
- [ ] Add a route-to-event-name map in `RootLayout.tsx` so no raw URL or
      document title ever leaves the client
- [ ] Use pseudonymous analytics-only identifiers — never email, NHS number,
      patient or subject IDs
- [ ] Add a hard client-side guard that no-ops every capture on routes behind
      `RequireClinical`, with tests covering it
- [ ] Add an analytics opt-out toggle to `Settings.tsx`, honoured before the
      SDK initialises, with `.stories.tsx` and `.test.tsx` per the component
      rules
- [ ] Update the privacy policy to name the processor, purpose, residency and
      retention period
- [ ] Decide whether to adopt PostHog error tracking, closing the frontend
      error-tracking gap

## Phase 3: clinical surface

Not yet — this phase starts when clinical data does. Server-side only: no
third-party processor ever sees clinical behavioural data. The Phase 0
catalogue means the call sites are identical to Phase 2; only the sink differs.

- [ ] Add an `analytics` logger in `backend/app/analytics/` emitting through
      the existing `logging_config.py` JSON pipeline
- [ ] Add an `infra/modules/analytics` Terraform module with a Cloud Logging
      sink to BigQuery, and a retention policy on the dataset
- [ ] Build the funnel and retention queries plus Looker Studio dashboards
- [ ] Extend the DPIA to cover clinical behavioural data

## Prerequisites

Blocking, before any analytics ships:

- [ ] Cookie policy written — the page is a stub, and the exception requires
      clear and comprehensive information plus a working opt-out
- [ ] Privacy policy updated with processor, purpose, residency and retention
- [ ] DPIA covering the analytics processing, recording the statistical
      purposes qualification analysis
- [ ] Retention period set, and folded into the outstanding UK GDPR
      data-retention decision in `todo.md`

## Decisions

- **Tier by surface rather than picking one tool for everything** — the
  free, feature-rich platform goes where the risk is low and the commercial
  questions are urgent; the fully-owned pipeline goes where the risk is high.
  A single tool across both surfaces would either over-expose clinical data or
  under-serve the marketing questions.

- **Build the catalogue before choosing the sink** — the catalogue is the
  interface, so switching sinks, or moving wholesale to warehouse-native later,
  becomes a configuration change rather than a rewrite of hundreds of call
  sites.

- **Proxy first-party rather than relaxing the CSP** — `script-src 'self'`
  and `connect-src 'self'` are worth more than the convenience of a vendor
  snippet, and proxying is what the vendors recommend regardless.

- **No GA4, at any configuration** — it fails the statistical purposes test on
  controller status, sole purpose and identifiability, and a defensible
  stripped-down configuration is one console click from being wrong.

- **Session replay off by default** — it is the highest-value and
  highest-risk feature in the box. If it is ever enabled on teaching screens it
  must be default-masked, and it must never run on a clinical screen.

- **What would reverse this plan** — if Quill will hold real patient data
  within twelve months, invert it: skip PostHog on the app entirely, run the
  BigQuery pipeline from the start, and use Plausible on the marketing site
  alone. The build cost is higher and the insight thinner, but the assurance
  story is unimpeachable and there is nothing to unpick later. This is the one
  input that decides the shape, and it needs a human answer before Phase 2.

## Open questions

- [ ] Timeline to real patient data — decides between this plan and its
      inversion
- [ ] Is session replay wanted on teaching screens at all?
- [ ] Should the `todo.md` feature-flag strategy be answered by PostHog flags,
      or stay in-code and in Terraform? Adopting PostHog flags is a deeper
      coupling than adopting its analytics

## Sources

Regulatory:

- [ICO — guidance on the use of storage and access technologies](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/about-this-guidance/)
- [ICO — what is special category data](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/)
- [Bird & Bird — current UK cookie laws, insights from the final ICO guidance](https://www.twobirds.com/en/insights/2026/current-uk-cookie-laws-insights-from-the-final-ico-guidance)
- [Data Protection Network — the DUAA and the five cookie exceptions](https://dpnetwork.org.uk/duaa-cookie-exceptions/)
- [Burges Salmon — the ICO's updated cookies guidance following the DUAA](https://www.burges-salmon.com/articles/102l7bs/key-insights-from-the-icos-updated-draft-cookies-guidance-following-duaa/)
- [Usercentrics — DUAA 2025 compliance](https://usercentrics.com/knowledge-hub/data-use-and-access-act-2025-duaa-compliance/)
- [Seresa — why GA4 does not qualify for the statistical purposes exception](https://seresa.io/blog/cookie-consent-tracking-data-loss/duaas-statistical-purposes-exception-doesnt-save-ga4)
- [Clickport — is Google Analytics legal in the UK in 2026](https://clickport.io/blog/privacy-analytics-uk)
- [NHS England — CAF-aligned DSPT guidance](https://digital.nhs.uk/cyber-and-data-security/guidance-and-resources/caf-aligned-dspt-guidance/audit-guides/strengthening-assurance-independent-assessment-summary-of-guides/cyber-assessment-framework-caf-aligned-data-security-and-protection-toolkit-dspt//)
- [EJN Labs — DSPT is now CAF-aligned, what NHS suppliers must do before 30 June 2026](https://ejnlabs.com/dspt-caf-aligned-nhs-suppliers/)

Tooling:

- [PostHog — privacy controls for session replay](https://posthog.com/docs/session-replay/privacy)
- [PostHog — HIPAA compliance](https://posthog.com/docs/privacy/hipaa-compliance)
- [PostHog — self-hosting disclaimer](https://posthog.com/docs/self-host/open-source/disclaimer)
- [ProductQuant — PostHog PII and PHI exposure checklist](https://productquant.dev/blog/posthog-pii-phi-exposure-checklist/)
- [Flexprice — PostHog pricing guide 2026](https://flexprice.io/blog/posthog-pricing-guide)
- [StackScored — Matomo pricing 2026](https://www.stackscored.com/pricing/analytics/matomo/)
- [Analytics Alternatives — Matomo review, cloud pricing vs self-hosted](https://analytics-alternatives.com/matomo-review-2026/)
- [OpenPanel — self-hosted web analytics 2026](https://openpanel.dev/articles/self-hosted-web-analytics)

Practice:

- [Digital Applied — an event taxonomy that won't rot](https://www.digitalapplied.com/blog/product-analytics-event-taxonomy-tracking-plan-2026)
- [Snowplow — warehouse-native product analytics on first-party behavioural data](https://snowplow.io/blog/warehouse-native-product-analytics-on-snowplow)
- [Mitzu — warehouse-native vs first-generation product analytics](https://mitzu.io/post/warehouse-native-vs-first-generation-product-analytics/)
- [Lokker — GDPR-compliant session replay tools with PII masking](https://lokker.com/compare/session-replay-tools)
