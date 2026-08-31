# Analytics plan

Quill has no analytics of any kind. There is no web analytics on the public
site, no product analytics in the app, and no frontend error tracking — the
only telemetry that exists is structured JSON logging to Cloud Logging plus the
uptime checks and alert policies in `infra/modules/monitoring`. So there is
currently no way to answer either of the two questions that matter
commercially: who arrives at the marketing site and whether they convert, and
what signed-in users actually do once they are inside the teaching product.

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

The first draft of this plan turned on one open question: whether Quill would
hold real patient data within twelve months. **That question has been answered
— build as though patient data could arrive tomorrow.** The plan below is
therefore the conservative shape: **no third-party analytics processor
anywhere, on any surface.** Everything is first-party, inside the GCP boundary
Quill already controls, keyed off a typed event catalogue that keeps the call
sites stable if that stance is ever relaxed.

The direction came with a cost caveat — hold off on the safest option if it is
financially expensive, and revisit when circumstances genuinely change. That
caveat turns out not to bind, and the costing below is the reason why: the
zero-vendor route runs at effectively £0/month inside existing GCP free tiers.
What it costs is engineering time and analytical convenience, not money.

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
lanes A and B, and closes the frontend half of lane C along the way.

## The 2026 UK regulatory position

- **The statistical purposes exception is real, and Quill could have used
  it.** The DUAA received Royal Assent on 19 June 2025; its PECR amendments
  came into force on 5 February 2026, creating five new exceptions to the
  cookie-consent rule. Qualifying first-party analytics can now run **without a
  consent banner**.

- **The ICO reads it strictly.** To rely on it, all of the following must
  hold: the data produces aggregate statistics that cannot reasonably identify
  an individual; it is used **solely** to understand and improve **your own**
  service, for the users it was collected from; any provider acts as a
  **processor**, not a joint controller, with no contractual right to use the
  data for its own purposes (advertising, product development, model training,
  benchmarking); the data is not combined with other sources and involves no
  profiling; you give clear and comprehensive information about what is stored;
  and you offer a simple and free means to object, available at first use.

- **The exception removes the banner, not the obligations.** The notice, the
  opt-out, the DPIA and UK GDPR duties on the data all survive it.

- **The downside risk grew this year.** The DUAA raised PECR penalties to UK
  GDPR levels — up to £17.5m or 4% of global turnover — with the
  penalty-notice provisions applying from 19 June 2026.

- **The plan does not rely on the exception anyway.** Server-side events tied
  to an authenticated session, and request logs the load balancer already
  writes, involve no storage on or access to the user's device. PECR does not
  engage at all. This is a materially stronger position than qualifying for an
  exception, because there is no qualification argument to defend at audit —
  and it is the reason the conservative route also removes the cookie banner
  question entirely.

- **What PECR actually governs, and why Quill needs no banner.** PECR — the
  Privacy and Electronic Communications (EC Directive) Regulations 2003 — is
  the UK's implementation of the ePrivacy Directive, and it is the cookie law;
  UK GDPR is not. The distinction matters: UK GDPR governs the processing of
  personal data, whereas PECR governs **storing or reading anything on a user's
  device**, whether or not that thing is personal data. It therefore catches
  `localStorage`, fingerprinting and pixels exactly as it catches cookies.
  Quill escapes the consent banner on two independent grounds. First, the
  analytics described here store nothing on the device, so PECR does not engage
  — that is the new part. Second, the cookies Quill *does* set (the JWT session
  and CSRF cookies) are **strictly necessary** under PECR Reg 6(4): essential to
  deliver a service the user explicitly requested. That exemption long predates
  the DUAA. But strictly necessary means **tell, not ask** — users must still be
  clearly informed about those cookies, which is why the cookie policy is a
  blocking prerequisite even though no banner is.

- **Banners have not gone away generally.** The DUAA carved out narrow
  low-risk categories; it did not abolish the regime. Advertising and profiling
  cookies still require opt-in consent, and the ICO has said its enforcement
  focus is precisely there. Nothing in this plan should be read as a general
  finding that UK sites no longer need consent banners.

- **GA4 is excluded on every reading.** It fails the statistical purposes test
  three ways: Google is a joint controller rather than a processor; GA data
  feeds Google's advertising systems, machine-learning models and benchmarking
  products, breaking the sole-purpose test; and the `_ga` cookie assigns a
  persistent Client ID that identifies returning visitors, so the data is not
  aggregate-only. A stripped-down GA4 can be argued into the exception, but the
  argument is fragile and one console click from being wrong.

- **Health data raises the bar inside the app.** Behavioural data can reveal
  health status without containing a single clinical field: a URL path, a
  feature name, a screen title, or the sequence and timing of actions can all
  disclose that a person has or is being treated for a condition. In a patient
  or clinician surface, "we only send page views" is not a safety argument —
  the page view *is* the disclosure. This is what makes "assume patient data
  arrives tomorrow" decisive rather than cautious: the exposure would be
  created by the instrumentation, before any clinical field is ever sent.

- **Every vendor is a permanent assurance liability.** The DSPT is now aligned
  to the NCSC Cyber Assessment Framework — outcome-based, evidencing that
  controls work — reaching large IT suppliers in 2025-26 and all organisations
  by 2026-27, with DTAC assessing the product. Each analytics sub-processor
  adds a declaration, a DPIA section, a residency claim to evidence, a
  retention policy to enforce, and an annual contract review. That recurring
  cost never appears on the pricing page.

## Codebase fit

Facts established by reading the repository, which constrain the choice:

- **The CSP forbids third-party scripts.** `caddy/prod/Caddyfile` line 25 sets
  `script-src 'self'` and `connect-src 'self'`, so no vendor snippet can load
  or send anything without loosening the policy. Under the plan below **the CSP
  never changes** — every request is same-origin. Had a vendor been adopted, it
  would have needed a bundled library plus a first-party ingest proxy through
  Caddy to avoid weakening it.

- **The load balancer already logs every request.**
  `infra/modules/load-balancer/main.tf` sets `log_config { enable = true }` on
  both the backend and frontend backend services, at `var.log_sample_rate`.
  Those logs already flow to Cloud Logging. Marketing-site traffic analysis is
  therefore a routing and dashboard problem, not a data-collection problem —
  the data is already being produced and paid for.

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
  `analytics` logger plus a sink to BigQuery is a small addition to a pipeline
  that already exists.

- **Two surfaces, one injection point each.**
  `frontend/public_pages/templates/page.html` is the single `<head>` for every
  static marketing page; `frontend/src/RootLayout.tsx` wraps the 63 routes
  defined in `main.tsx` and is the natural home for a route-to-event-name map
  that keeps raw URLs out of the payload.

- **The client must not use raw `fetch`.** Per the project conventions the
  frontend beacon posts through `frontend/src/lib/api.ts`, not a bespoke
  transport.

- **Three open `todo.md` items are touched by this work.** The feature-flag
  strategy item (implementation exists in `RequireFeature` and
  `featureFlags.ts`; strategy doc missing), the total absence of frontend error
  tracking, and the cookie and privacy policy pages — currently placeholder
  stubs saying the content "is currently being finalised".

## What this costs

The cost caveat deserves a direct answer, because the intuition that "the safe
option is the expensive one" does not hold here.

- **Cloud Logging** — $0.50/GiB ingested, with 50 GiB per month free. Quill's
  volumes are nowhere near that, and the load-balancer logs are already being
  ingested today.
- **Log sink export to BigQuery** — free. The sink itself carries no charge.
- **BigQuery** — 10 GB of storage and 1 TiB of query processing free per
  month; thereafter $0.02/GB/month for active storage and roughly $6.25/TiB
  scanned. Analytics events are small rows; teaching-scale volumes will not
  leave the free tier for years.
- **Looker Studio** — free, and connects to BigQuery natively.
- **Cloud Error Reporting** — included with the operations suite; frontend
  errors arrive as structured log entries, which fall under the same 50 GiB
  free tier.

**Realistic running cost: £0/month**, on infrastructure already provisioned,
inside a boundary already covered by the existing GCP data processing terms.

For honesty, the rejected option was also £0: PostHog's free tier covers 1M
events, 5,000 session recordings and 1M feature-flag requests per month, which
Quill would not exceed. **Money is not the differentiator between these two
routes.** What the conservative route actually costs is:

- **Engineering time** — building the emitter, the sink, the beacon endpoint
  and the dashboards, rather than installing a library. Modest, and mostly
  mechanical.
- **Analytical convenience** — funnels, retention curves and cohort analysis
  become SQL you write against BigQuery instead of a UI you click. This is the
  real trade, and it is a permanent one.
- **Features not obtained** — no session replay (excluded on safety grounds
  regardless), no hosted experimentation, and weaker frontend error grouping
  and source-map handling than a dedicated tool.

Since the financial cost of the safe route is nil, the caveat about holding
off does not bind. Revisit only if the analytical convenience gap starts
costing real product decisions.

## Options considered

- **First-party GCP-native pipeline — chosen.** Typed events from FastAPI and
  from a same-origin frontend beacon, emitted as structured logs → Cloud
  Logging sink → BigQuery → Looker Studio, with marketing traffic coming from
  load-balancer request logs already being written. Zero new sub-processors,
  nothing to declare at DSPT or DTAC, no PECR question, no CSP change, no
  cookie banner. Costs pennies. The weakness is genuine: no funnel or retention
  UI out of the box, and dashboards are work rather than a signup.

- **PostHog Cloud (EU) — rejected, given the decision to assume patient
  data.** It was the recommendation in the first draft and remains the best
  tool on the merits: product analytics, feature flags, experiments, surveys,
  session replay and error tracking in one platform, EU hosting, DPA, SOC 2, a
  HIPAA BAA available on paid plans, and a free tier Quill would not exceed. It
  is recorded here rather than deleted because the analysis is the reason for
  the rejection, not an argument against revisiting it. What excludes it is
  not price and not capability, but that autocapture, GeoIP enrichment, URL
  capture, session replay and backend event properties all carry PHI in a
  default setup — every one of them a control that must be configured
  correctly and stay correct — and that a processor holding behavioural data
  from a clinical surface is a standing declaration on the assurance record.

- **A note for anyone revisiting PostHog later.** Its self-hosting is now
  hobby-only: an MIT-licensed Docker Compose deployment with one project, no
  commercial support, no Kubernetes, several features missing. It is not an
  enterprise fallback, so a future adoption would be on the EU-cloud terms.

- **Matomo, self-hosted or Matomo Cloud EU.** Full data ownership, GPL,
  on-premise, mature GDPR tooling, genuinely strong for lane A. Weaker for lane
  B — a web analytics product first, with funnels, retention and cohort
  analysis partly behind paid plugins (heatmaps €199/yr, session recording
  €149/yr, A/B testing €249/yr). Cloud starts at €29/month for 50,000 *hits*,
  and every event, download and outbound click is a hit. Self-hosting adds a
  fourth stateful database service (MySQL/MariaDB) to a stack already running
  three Postgres instances, on a team of one, with a permanent patching
  obligation. An unpatched self-hosted analytics server is a worse DSPT finding
  than a well-documented EU processor, and this objection applies to every
  self-hosting option below too.

- **Plausible or Umami on the marketing site only.** Cookie-free,
  aggregate-only, EU-hosted, roughly £9–19/month, and can be self-hosted.
  Comfortably inside the statistical purposes exception, and a single script
  tag in `page.html`. Still adds a sub-processor for something the
  load-balancer logs largely already answer, so it is held as the **fallback
  for lane A** rather than adopted: reach for it only if the log-derived
  dashboards prove too coarse to guide marketing decisions.

- **Warehouse-native (Mitzu, Kubit, Snowplow).** The genuine 2026 direction of
  travel: keep first-party behavioural data in the warehouse and point a
  product-analytics UI at it. Premature now — priced and scoped for
  organisations with data teams — but this plan lands Quill's data exactly
  where those tools expect to find it, so adopting one later is a connection
  rather than a migration. That is a further argument for the chosen route: it
  is the same architecture, minus the UI, and the UI can be bought later.

- **Error tracking: GCP-native first, GlitchTip as fallback.** Frontend errors
  posted to Quill's own backend, logged as structured entries and surfaced via
  Cloud Error Reporting, keeps the zero-vendor property. It is weaker than a
  dedicated tool at grouping and source maps. GlitchTip is the strongest
  fallback if that proves painful — Sentry SDK protocol, four containers rather
  than forty, free to self-host, EU instance available — but it is another
  stateful service to patch, so it is a considered second step, not a starting
  point.

## Phase 0: event catalogue

Vendor-independent, and the foundation for everything after it. This is what
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
- [ ] Add generated event types under `frontend/src/types/` and a loader in
      `backend/app/analytics/` reading the YAML via PyYAML
- [ ] Seed 20–40 events using object-action naming (`assessment_started`,
      `assessment_completed`, `signup_form_submitted`); cap the catalogue at
      200 permanently
- [ ] Add a CI check rejecting any capture call whose event or property is not
      in the catalogue, and any property name matching a PHI denylist
- [ ] Backend tests for the loader and the denylist (`just ub`)

## Phase 1: the sink

Build the destination before the producers, so the first real event has
somewhere to land.

- [ ] Add an `analytics` logger in `backend/app/analytics/`, emitting through
      the existing `logging_config.py` JSON pipeline with a distinct log name
      so it can be routed independently of application logs
- [ ] Add an `infra/modules/analytics` Terraform module: a Cloud Logging sink
      filtered to the analytics log name, a BigQuery dataset, and a table
      expiration implementing the retention decision
- [ ] Confirm the sink filter cannot match application logs, so no incidental
      log line is ever routed into the analytics dataset
- [ ] Build the first Looker Studio dashboard against the dataset
- [ ] Document the query patterns for funnels and retention, since these are
      SQL rather than UI from here on

## Phase 2: marketing site

Zero client-side JavaScript, zero cookies, zero consent question.

- [ ] Route load-balancer request logs for the frontend backend service into
      the analytics dataset, and check `var.log_sample_rate` is set so the
      sample is representative
- [ ] Truncate or drop client IP at ingest — IP is personal data, and it is
      not needed for aggregate traffic analysis
- [ ] Emit a server-side conversion event when a public form is submitted, so
      conversion is measured where it actually happens rather than in the
      browser
- [ ] Build the traffic and conversion dashboard: sources, pages, conversion
      rate, with bot traffic filtered
- [ ] Reassess after a month of data — if the answers are too coarse to guide
      marketing decisions, revisit Plausible for lane A only

## Phase 3: teaching app

- [ ] Add `frontend/src/lib/analytics/` with a `useAnalytics` hook posting
      catalogue-checked events to a first-party backend endpoint via
      `lib/api.ts` — same-origin, so the CSP is untouched
- [ ] Add the receiving endpoint in the backend, validating every event
      against the catalogue and rejecting anything undeclared, with rate
      limiting via the existing `slowapi` setup
- [ ] Add a route-to-event-name map in `RootLayout.tsx` so no raw URL or
      document title ever leaves the client
- [ ] Use pseudonymous analytics-only identifiers — never email, NHS number,
      patient or subject IDs
- [ ] Add a hard client-side guard that no-ops every capture on routes behind
      `RequireClinical`, with tests covering it
- [ ] Add an analytics opt-out toggle to `Settings.tsx`, honoured before any
      event is emitted, with `.stories.tsx` and `.test.tsx` per the component
      rules
- [ ] Update the privacy policy to describe the processing, the purpose and
      the retention period

## Phase 4: frontend error tracking

Closes the lane C gap that has no owner today.

- [ ] Add a React error boundary and a global handler posting sanitised error
      reports to the backend via `lib/api.ts`
- [ ] Strip URLs, form values and user-entered text from reports before they
      leave the client — an error message is as capable of carrying PHI as an
      analytics event
- [ ] Surface the reports through Cloud Error Reporting, and alert on them via
      the existing `infra/modules/monitoring` notification channels
- [ ] Reassess after a month — if grouping and source-map handling prove too
      weak to act on, evaluate self-hosted GlitchTip as a second step

## Prerequisites

Blocking, before any analytics ships:

- [ ] Cookie policy written, replacing the current stub — no consent banner is
      required, but the strictly necessary session and CSRF cookies must still
      be clearly described, so the policy is needed either way
- [ ] Privacy policy updated with the processing, purpose and retention period
- [ ] DPIA covering the analytics processing, recording that no third-party
      processor is involved and that PECR does not engage
- [ ] Retention period set for the analytics dataset, folded into the
      outstanding UK GDPR data-retention decision in `todo.md`

## Decisions

- **Assume patient data arrives tomorrow** — the explicit direction, and the
  decision that determines everything else. Behavioural instrumentation creates
  the exposure before any clinical field is sent, so the instrumentation has to
  be safe from the first event, not retrofitted when clinical data lands.

- **No third-party analytics processor on any surface** — including the
  marketing site, where the PHI risk is nil but the sub-processor declaration
  is not. Keeping the vendor count at zero means there is no residency claim to
  evidence, no annual contract review, and no configuration that must stay
  correct to remain safe.

- **The cost caveat does not bind** — both the chosen and the rejected route
  run at £0/month. The conservative route is paid for in engineering time and
  in funnels-as-SQL, not in money, so there is nothing to hold off for.

- **Build the catalogue before the sink** — the catalogue is the interface, so
  changing sinks, or connecting a warehouse-native UI later, is a configuration
  change rather than a rewrite of hundreds of call sites. It is also what makes
  the PHI denylist enforceable in CI rather than aspirational.

- **Server-side and same-origin by default** — no device storage means PECR
  does not engage, which is a stronger position than qualifying for the
  statistical purposes exception, because there is no argument to defend at
  audit. It also leaves the CSP untouched.

- **Session replay is excluded outright** — the highest-value and
  highest-risk feature in the box, and not worth a category of risk that cannot
  be fully controlled on a clinical surface.

- **Plausible and GlitchTip are held as named fallbacks, not adopted** — each
  addresses a specific weakness of the chosen route (coarse marketing data,
  weak error grouping). Naming them now means a future decision starts from
  evidence about which weakness actually bit, rather than from a fresh survey.

- **What would revisit this plan** — a decision that patient data will *not*
  arrive, or the analytical convenience gap demonstrably costing product
  decisions. Both are reversals of an explicit stance, so both need a
  deliberate human call rather than drift.

## Open questions

- [ ] Should the `todo.md` feature-flag strategy stay in-code and in Terraform?
      With no analytics vendor adopted, the flag infrastructure that a platform
      would have supplied has to be answered on its own terms
- [ ] What retention period applies to the analytics dataset, and does it
      differ from application log retention?
- [ ] Is a sampled load-balancer log stream representative enough for marketing
      decisions, or does `log_sample_rate` need raising on the frontend service?

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

Cost:

- [Google Cloud — BigQuery pricing](https://cloud.google.com/bigquery/pricing)
- [MonitoringCost — GCP Cloud Operations suite pricing 2026](https://monitoringcost.com/gcp-monitoring-cost)
- [OneUptime — calculating and optimising Cloud Logging costs](https://oneuptime.com/blog/post/2026-02-17-how-to-calculate-and-optimize-cloud-logging-costs-by-analyzing-ingestion-volume/view)

Tooling:

- [PostHog — privacy controls for session replay](https://posthog.com/docs/session-replay/privacy)
- [PostHog — HIPAA compliance](https://posthog.com/docs/privacy/hipaa-compliance)
- [PostHog — self-hosting disclaimer](https://posthog.com/docs/self-host/open-source/disclaimer)
- [ProductQuant — PostHog PII and PHI exposure checklist](https://productquant.dev/blog/posthog-pii-phi-exposure-checklist/)
- [Flexprice — PostHog pricing guide 2026](https://flexprice.io/blog/posthog-pricing-guide)
- [StackScored — Matomo pricing 2026](https://www.stackscored.com/pricing/analytics/matomo/)
- [Analytics Alternatives — Matomo review, cloud pricing vs self-hosted](https://analytics-alternatives.com/matomo-review-2026/)
- [OpenPanel — self-hosted web analytics 2026](https://openpanel.dev/articles/self-hosted-web-analytics)
- [GlitchTip — hosted architecture](https://glitchtip.com/documentation/hosted-architecture/)
- [DanubeData — self-hosting Sentry or GlitchTip in 2026](https://danubedata.ro/blog/self-host-sentry-glitchtip-error-tracking-2026)

Practice:

- [Digital Applied — an event taxonomy that won't rot](https://www.digitalapplied.com/blog/product-analytics-event-taxonomy-tracking-plan-2026)
- [Snowplow — warehouse-native product analytics on first-party behavioural data](https://snowplow.io/blog/warehouse-native-product-analytics-on-snowplow)
- [Mitzu — warehouse-native vs first-generation product analytics](https://mitzu.io/post/warehouse-native-vs-first-generation-product-analytics/)
- [Lokker — GDPR-compliant session replay tools with PII masking](https://lokker.com/compare/session-replay-tools)
