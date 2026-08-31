# Analytics plan

Quill has no analytics of any kind. There is no web analytics on the public
site, no page-view counts in the app, and no error reporting — the
`ErrorBoundary` component catches unhandled React errors and writes them to
`console.error`, where nobody will ever see them. So three ordinary questions
have no answer today.

Those three questions are the entire scope of this plan:

1. **Where are things going wrong?**
2. **How many people visit the public site?**
3. **How many people visit each page of the authenticated app?**

That is deliberately much narrower than "analytics" usually means. There are no
funnels here, no retention curves, no cohort analysis, no session replay, no
experimentation. An earlier draft of this plan designed for all of that; it has
been cut back to the three questions above, and the section on what is
deliberately not being built records what was dropped and what would justify
revisiting it.

The scope is small but the constraints are not, which is why this is a plan
rather than a ticket. Analytics touches the Content Security Policy, the cookie
and privacy policies, the data protection impact assessment, the sub-processor
list, and — once clinical data lands — the NHS Data Security and Protection
Toolkit and Digital Technology Assessment Criteria assurance record. The
governing instruction is to build as though patient data could arrive tomorrow.
The UK legal position also changed materially this year: the Data (Use and
Access) Act 2025 amendments to the Privacy and Electronic Communications
Regulations came into force on 5 February 2026, creating a statistical purposes
exception that removes the cookie banner for qualifying first-party analytics,
while raising the penalties under those regulations to UK GDPR levels. Advice
written before 2026 is out of date on both halves of that.

The answer to all three questions is the same shape: **first-party, inside the
Google Cloud project Quill already runs, with no third-party analytics
processor anywhere.** Terms are spelled out on first use, and the abbreviations
that recur are collected in the glossary at the foot of this document.

## How each question gets answered

- **Where are things going wrong** — the existing `ErrorBoundary` and a global
  handler post sanitised reports to Quill's own backend, which logs them as
  structured entries. Cloud Error Reporting groups them and the existing alert
  channels in `infra/modules/monitoring` shout about them. No new service, and
  the catching half is already written.

- **Public site visitor numbers** — the load balancer already logs every
  request. `infra/modules/load-balancer/main.tf` sets `log_config { enable =
  true }` on both backend services, and those logs already flow to Cloud
  Logging today. This question needs no application code at all: it is a
  querying and dashboard problem, not a collection problem.

- **App page views** — this is the only one needing new client code. The app
  is a single-page application using `createBrowserRouter`, so navigating
  between pages never reaches the server; load-balancer logs see the initial
  document load and subsequent API calls, but not the twelve pages a user moved
  through. A small ping on route change is unavoidable. It sends a **page name
  from a fixed allow-list**, never a URL.

## What the constraints rule out

- **No third-party analytics processor, on any surface.** Including the public
  site, where the health-data risk is nil but the sub-processor declaration is
  not. Zero vendors means no data-residency claim to evidence, no annual
  contract review, and no vendor configuration that must stay correct to remain
  safe.

- **No Google Analytics.** It fails the statistical purposes exception three
  ways: Google is a joint controller rather than a processor; the data feeds
  Google's advertising systems, machine-learning models and benchmarking
  products, breaking the sole-purpose test; and the `_ga` cookie assigns a
  persistent client identifier, so the data is not aggregate-only.

- **No raw URLs, ever, from the authenticated app.** Behavioural data can
  reveal health status without containing a single clinical field: a URL path,
  a feature name, or the timing of actions can each disclose that a person has
  or is being treated for a condition. This is why page views are reported as
  allow-listed names rather than paths, and it is the single most important
  control in this plan.

- **No error text passed through unsanitised.** An error message is exactly as
  capable of carrying patient data as an analytics event, and rather more
  likely to, since it may quote whatever the code was handling when it failed.

- **No session replay.** The highest-value and highest-risk feature in the
  category, and outside the scope of all three questions anyway.

## The regulatory position, briefly

- **The Privacy and Electronic Communications Regulations are the UK's cookie
  law**, and they govern storing or reading anything on a user's device,
  whether or not it is personal data. UK GDPR asks a different question: is
  personal data being processed? Both need answering, but they are not the same
  question.

- **This plan does not engage those regulations at all.** Load-balancer logs
  and a server-side ping involve no storage on or access to the user's device.
  That is a stronger position than qualifying for the new statistical purposes
  exception, because there is no qualification argument to defend at audit.

- **Quill still needs a cookie policy, but not a consent banner.** The session
  and cross-site request forgery cookies it already sets are strictly necessary
  under Regulation 6(4) — essential to deliver a service the user explicitly
  requested — an exemption that long predates the 2025 Act. Strictly necessary
  means **tell, not ask**: users must still be clearly informed, which is why
  the stub cookie policy is a blocking prerequisite even though no banner is.

- **Consent banners have not gone away generally.** The 2025 Act carved out
  narrow low-risk categories; advertising and profiling cookies still require
  opt-in consent, and the Information Commissioner's Office has said that is
  where its enforcement attention sits. Nothing here should be read as a
  general finding that UK sites no longer need banners.

- **Every third-party processor is a permanent assurance liability.** The Data
  Security and Protection Toolkit is now aligned to the National Cyber Security
  Centre's Cyber Assessment Framework — outcome-based, evidencing that controls
  work — reaching large suppliers in 2025-26 and all organisations by 2026-27.
  Each sub-processor adds a declaration, an impact-assessment section, a
  residency claim, a retention policy and an annual review. For three counting
  questions, that price is not worth paying.

## Codebase fit

- **The error boundary already exists and already catches.**
  `frontend/src/components/error-boundary/ErrorBoundary.tsx` implements
  `componentDidCatch` and currently calls `console.error`. Question 1 is
  largely a matter of giving it a destination.

- **The load balancer already logs.**
  `infra/modules/load-balancer/main.tf` enables request logging on both the
  frontend and backend services at `var.log_sample_rate`. The data for question
  2 is already being produced and paid for.

- **Structured logging is already in place.** `backend/app/logging_config.py`
  emits JSON with a `RequestContextFilter` carrying `request_id` and `user_id`,
  and Cloud Run forwards it to Cloud Logging, which parses it natively. Both
  new log streams ride this existing pipeline rather than introducing one.

- **Rate limiting already exists.** `slowapi` is configured in
  `backend/app/main.py` with a `@limiter.limit(...)` decorator pattern to
  follow on the new ingest endpoints, both of which accept unauthenticated or
  cheaply-authenticated writes and must be limited.

- **The Content Security Policy never changes.** `caddy/prod/Caddyfile` sets
  `script-src 'self'` and `connect-src 'self'`. Everything here is same-origin,
  so the policy stays exactly as strict as it is today. A third-party vendor
  would have required either weakening it or standing up a proxy.

- **The client must not use raw `fetch`.** Per the project conventions, both
  the error report and the page-view ping post through
  `frontend/src/lib/api.ts`.

- **One injection point each.** `frontend/src/RootLayout.tsx` wraps the 63
  routes defined in `main.tsx` and is where the route-change hook and the
  route-to-name map belong.

## What this costs

- **Cloud Logging** — $0.50 per gibibyte ingested, with 50 gibibytes free each
  month. Quill is nowhere near that, and the load-balancer logs are already
  being ingested.
- **Log sink export to BigQuery** — free; the sink itself carries no charge.
- **BigQuery** — 10 GB of storage and 1 tebibyte of query processing free per
  month, then $0.02 per gigabyte per month. These rows are tiny.
- **Looker Studio** — free, and connects to BigQuery natively.
- **Cloud Error Reporting** — included with the operations suite; the reports
  arrive as structured log entries under the same free tier.

**Realistic running cost: £0 per month**, on infrastructure already
provisioned, inside a boundary already covered by existing terms.

For honesty: the rejected third-party options were also £0 at this volume.
Money was never the differentiator. What this route costs instead is the
engineering time below — modest, and mostly mechanical — and the analytical
depth described in the final section. For three counting questions, that is a
good trade.

## Phase 1: where things are going wrong

The first question asked, and the cheapest to answer, because the catching is
already built.

- [ ] Extend `componentDidCatch` in
      `frontend/src/components/error-boundary/ErrorBoundary.tsx` to report the
      error as well as logging it
- [ ] Add a global handler for unhandled promise rejections and errors thrown
      outside React's tree, which the boundary cannot see
- [ ] Sanitise before sending: strip URLs, query strings, form values and any
      user-entered text, keeping the error type, the message, the component
      stack and the release version
- [ ] Add a backend ingest endpoint accepting sanitised reports, rate-limited
      via the existing `slowapi` `@limiter.limit` pattern, and available to
      unauthenticated pages as well as signed-in ones
- [ ] Emit reports through the existing JSON logging pipeline in a shape Cloud
      Error Reporting recognises, so grouping works
- [ ] Alert on new and spiking error groups through the existing notification
      channels in `infra/modules/monitoring`
- [ ] Tests: sanitiser unit tests proving patient-shaped strings never survive
      it (`just uf`), and backend endpoint tests including the rate limit
      (`just ub`)
- [ ] Storybook story and test for any fallback UI change, per the component
      rules

## Phase 2: how many people visit the public site

No application code. This is infrastructure and a dashboard.

- [ ] Enable Log Analytics on the log bucket so the existing load-balancer logs
      can be queried with SQL immediately, at no additional Cloud Logging
      charge
- [ ] Check `var.log_sample_rate` on the frontend backend service — a sampled
      stream is fine for trends, but the sample rate has to be known to read
      the numbers correctly
- [ ] Truncate or drop the client IP address at ingest; it is personal data and
      is not needed to count visits
- [ ] Add an `infra/modules/analytics` Terraform module with a BigQuery dataset
      and a log sink, so history outlives the log bucket's retention window —
      30 days is too short to see a trend
- [ ] Build a Looker Studio dashboard: visits over time, pages, referrers,
      with bot and uptime-check traffic filtered out
- [ ] Set and apply a table expiration matching the retention decision

## Phase 3: which pages get used in the app

The only phase needing new client code, and the one carrying the real risk.

- [ ] Add a route-to-name allow-list mapping each of the 63 routes to a stable
      page name, so no URL or document title ever leaves the browser
- [ ] Add a route-change hook in `RootLayout.tsx` that posts the page name
      through `lib/api.ts`
- [ ] Add a backend endpoint that rejects any name not in the allow-list and
      logs accepted ones through the analytics logger, rate-limited as above
- [ ] Identify page views by a per-session random identifier rather than the
      user ID, so the counts are of sessions rather than of identified people —
      cheaper to justify, and sufficient for the question being asked
- [ ] Add a hard guard that no-ops the ping on routes behind `RequireClinical`,
      with tests proving it
- [ ] Add an opt-out toggle in `Settings.tsx`, honoured before any ping is
      sent, with `.stories.tsx` and `.test.tsx` per the component rules
- [ ] Extend the Looker Studio dashboard with page views per page over time
- [ ] Tests: allow-list rejection, clinical-route guard, opt-out honoured

## Prerequisites

Blocking, before any of this ships:

- [ ] Cookie policy written, replacing the current stub — no consent banner is
      required, but the strictly necessary session and cross-site request
      forgery cookies must still be clearly described
- [ ] Privacy policy updated to describe the error reporting and page-view
      counting, their purpose, and the retention period
- [ ] Data protection impact assessment covering both, recording that no
      third-party processor is involved and that the electronic communications
      regulations do not engage
- [ ] Retention period set for the analytics dataset, folded into the
      outstanding UK GDPR data-retention decision in `todo.md`

## Decisions

- **Scope is three questions, not a product analytics capability** — errors,
  public visits, app page views. Everything outside that is explicitly not
  being built, so the instrumentation stays small enough to audit by reading it.

- **Assume patient data arrives tomorrow** — the governing instruction.
  Behavioural instrumentation creates the exposure before any clinical field is
  sent, so it has to be safe from the first event rather than retrofitted.

- **No third-party processor on any surface** — including the public site.
  Three counting questions do not justify a permanent assurance liability.

- **An allow-list of page names, not a URL** — the single most important
  control here. A URL from a clinical route can disclose a patient's condition;
  a fixed name cannot. It also removes the need for a general event catalogue,
  since the allow-list is the whole schema at this scope.

- **Count sessions, not identified people** — a per-session random identifier
  answers "which pages get used" without linking behaviour to a named clinical
  user. The cost is that returning-user questions become unanswerable, which is
  outside the three questions anyway.

- **Server-side and same-origin throughout** — no device storage means the
  electronic communications regulations never engage, and the Content Security
  Policy stays untouched.

- **Ordered by the questions as asked** — errors first. Phase 2 needs no
  application code and could land first as a warm-up if that suits the
  scheduling better; Phases 1 and 2 are independent of each other, and Phase 3
  depends on the sink built in Phase 2.

## Not building, and what would change that

Recorded so that a later "shouldn't we have analytics?" conversation starts
from the reasoning rather than from scratch:

- **Funnels, retention curves and cohort analysis.** Not asked for. When they
  are wanted, the data will already be in BigQuery and they become SQL
  queries — more work than clicking a product analytics interface, but not a
  rebuild.

- **A typed event catalogue in `shared/`.** The earlier draft proposed one
  mirroring `competencies.yaml`, generated into TypeScript and read by PyYAML.
  At three questions it is overbuilt: the page-name allow-list is the schema.
  If event tracking ever grows past roughly a dozen distinct events, revisit
  it — untyped, ungoverned event names rot fast, and the catalogue is the
  standard defence.

- **PostHog Cloud (EU).** The best tool on the merits, with a free tier Quill
  would not exceed, and it would have supplied error tracking and feature flags
  in the same box. Excluded because a processor holding behavioural data from a
  clinical surface is a standing declaration on the assurance record, and
  because its default capture behaviour carries health data unless several
  controls are each configured correctly and stay correct. Worth noting for any
  future revisit: its self-hosting is now hobby-only, so adoption would be on
  the cloud terms.

- **Plausible or Umami for the public site.** Cookie-free, EU-hosted, about
  £9–19 per month, one script tag. Held as the fallback for question 2 if the
  log-derived dashboard proves too coarse to guide decisions — reach for it
  then, not before.

- **GlitchTip or Sentry for error tracking.** Cloud Error Reporting is weaker
  at grouping and at source maps than a dedicated tool. If Phase 1 produces
  reports too noisy or too anonymous to act on, self-hosted GlitchTip is the
  strongest fallback — Sentry protocol, four containers rather than forty — but
  it is another stateful service to patch, so it is a second step and not a
  starting point.

- **Warehouse-native analytics (Mitzu, Kubit, Snowplow).** The direction of
  travel for organisations with data teams. This plan happens to land Quill's
  data where those tools expect to find it, so adopting one later would be a
  connection rather than a migration.

## Glossary

- **CAF** — Cyber Assessment Framework. The National Cyber Security Centre's
  outcome-based security framework, to which the NHS Data Security and
  Protection Toolkit is now aligned.

- **CSP** — Content Security Policy. A browser security header declaring which
  origins a page may load scripts from and send requests to. Quill's is set in
  `caddy/prod/Caddyfile`.

- **DPIA** — data protection impact assessment. The written risk assessment UK
  GDPR requires before starting higher-risk processing.

- **DSPT** — Data Security and Protection Toolkit. NHS England's annual
  self-assessment of an organisation's data security, now aligned to the CAF.

- **DTAC** — Digital Technology Assessment Criteria. The NHS baseline
  assessment of a digital health product's safety, security, interoperability
  and usability. The DSPT assesses the organisation; the DTAC assesses the
  product.

- **DUAA** — Data (Use and Access) Act 2025. The UK Act that amended UK GDPR
  and PECR. Royal Assent 19 June 2025; main provisions in force 5 February
  2026; penalty and complaints provisions from 19 June 2026. It created the new
  cookie consent exceptions and raised PECR penalties to UK GDPR levels.

- **GDPR** — General Data Protection Regulation. "UK GDPR" is the retained UK
  version. It governs the processing of personal data.

- **ICO** — Information Commissioner's Office. The UK data protection
  regulator, which issues the guidance and levies the fines.

- **NCSC** — National Cyber Security Centre. The UK government body that
  authors the CAF.

- **PECR** — Privacy and Electronic Communications (EC Directive) Regulations
  2003. The UK's actual cookie law. It governs storing or reading anything on a
  user's device, whether or not that thing is personal data — a different
  question from UK GDPR's, which is about processing personal data.

- **PHI** — protected health information. Any data revealing a person's health
  status, including behavioural data that discloses it indirectly.

- **SPA** — single-page application. A web app that renders navigation in the
  browser rather than requesting a new document per page, which is why
  server-side logs cannot see page views in the authenticated app.

## Sources

Regulatory:

- [ICO — guidance on the use of storage and access technologies](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/about-this-guidance/)
- [ICO — what is special category data](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/)
- [Bird & Bird — current UK cookie laws, insights from the final ICO guidance](https://www.twobirds.com/en/insights/2026/current-uk-cookie-laws-insights-from-the-final-ico-guidance)
- [Data Protection Network — the DUAA and the five cookie exceptions](https://dpnetwork.org.uk/duaa-cookie-exceptions/)
- [Seresa — why GA4 does not qualify for the statistical purposes exception](https://seresa.io/blog/cookie-consent-tracking-data-loss/duaas-statistical-purposes-exception-doesnt-save-ga4)
- [NHS England — CAF-aligned DSPT guidance](https://digital.nhs.uk/cyber-and-data-security/guidance-and-resources/caf-aligned-dspt-guidance/audit-guides/strengthening-assurance-independent-assessment-summary-of-guides/cyber-assessment-framework-caf-aligned-data-security-and-protection-toolkit-dspt//)
- [EJN Labs — DSPT is now CAF-aligned, what NHS suppliers must do before 30 June 2026](https://ejnlabs.com/dspt-caf-aligned-nhs-suppliers/)

Cost:

- [Google Cloud — BigQuery pricing](https://cloud.google.com/bigquery/pricing)
- [MonitoringCost — GCP Cloud Operations suite pricing 2026](https://monitoringcost.com/gcp-monitoring-cost)
- [OneUptime — calculating and optimising Cloud Logging costs](https://oneuptime.com/blog/post/2026-02-17-how-to-calculate-and-optimize-cloud-logging-costs-by-analyzing-ingestion-volume/view)

Tooling, for the options not taken:

- [PostHog — privacy controls for session replay](https://posthog.com/docs/session-replay/privacy)
- [PostHog — self-hosting disclaimer](https://posthog.com/docs/self-host/open-source/disclaimer)
- [ProductQuant — PostHog PII and PHI exposure checklist](https://productquant.dev/blog/posthog-pii-phi-exposure-checklist/)
- [OpenPanel — self-hosted web analytics 2026](https://openpanel.dev/articles/self-hosted-web-analytics)
- [GlitchTip — hosted architecture](https://glitchtip.com/documentation/hosted-architecture/)
- [DanubeData — self-hosting Sentry or GlitchTip in 2026](https://danubedata.ro/blog/self-host-sentry-glitchtip-error-tracking-2026)
