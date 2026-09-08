# Clinical passport plan

Oncology registrars in the South West need a "SACT passport" and a
"radiotherapy passport": a portable record of the clinical competencies
they have been assessed as holding, who signed each one off, when, and
on what evidence. Today this lives in paper booklets and PDFs that are
retyped at every rotation. Quill Medical already has the vocabulary for
competencies (CBAC, `shared/competencies.yaml`) but nothing that records
the *attestation* of a competency: the two-party act of a trainee
presenting evidence and a named assessor accepting accountability for
the sign-off. This plan adds a **Clinical Passport** framework that
holds those attestations as portable, versioned, human-readable files
(Markdown and YAML, one git repository per passport holder), rendered on
demand to Markdown and PDF printouts. It deliberately follows the
file-first model of VPR and Turva, and just as deliberately defers the
projection and cache layer until user numbers or latency demand it.

The first half of this document is the research: what the four
reference repositories do, what they got right, and what they wish
they had done. The second half is the design and phased work that
falls out of it.

## What a passport is, in the domain

- **SACT passport** — the UK Oncology Nursing Society (UKONS) Systemic
  Anti-Cancer Therapy competency passport is the national model. It is
  recordable as a clinical skill on the Electronic Staff Record (ESR),
  is explicitly designed to be portable between trusts, and has been
  extended beyond nursing to therapy radiographers and pharmacists. Its
  shape is: a list of competencies grouped by domain, each with a
  self-assessment, an assessor sign-off (name, role, date, signature),
  and a periodic reassessment.

- **Radiotherapy passport** — for clinical oncology registrars the
  reference is the Royal College of Radiologists (RCR) clinical oncology
  curriculum and its workplace-based assessments. The passport here is
  the same shape as SACT: competencies grouped by modality or site, each
  signed off by a consultant or approved trainer.

- **Assessor roles** — UKONS distinguishes the practitioner, the
  practice assessor who observes and signs, and a verifier who confirms
  the assessor was entitled to sign. The passport must support at least
  practitioner and assessor in phase 1, with verifier as a follow-on.

- **Source caveat** — the UKONS and NHS England pages were not readable
  from this session (network egress is blocked to those domains), so
  the domain description above comes from search summaries and general
  knowledge. Before Phase 1 begins, the actual South West SACT and
  radiotherapy passport documents must be obtained and encoded as the
  first framework (see Phase 1).

## Findings from the reference repositories

All four repositories were cloned and read in full at
`/home/user/turva-uk/digital-clinical-safety-platform`,
`/home/user/turva-uk/turva`, `/home/user/turva-uk/dcb0129-template` and
`/home/user/bailey-medics/vpr`. File paths below are relative to those
clones.

### VPR (bailey-medics/VPR)

VPR is a Rust workspace whose README says development has stopped, so
treat it as a well-documented design rather than a product. Its thesis
(`docs/src/overview.md`) is the one this plan adopts: **files as
canonical, projections for performance, patient as the atomic unit.**

- **Storage** — one git repository per record, sharded on disk as
  `<s1>/<s2>/<32-hex-uuid>/` so the UUID's first four hex characters
  become two directory levels (`crates/uuid/src/lib.rs`). Narrative
  content is Markdown, structured content is YAML, JSON is wire-only
  (`docs/src/technical/design-decisions.md`, "File format conventions").
  Binary attachments never enter git: they live in a gitignored
  content-addressed store `files/sha256/ab/cd/<hash>` with a YAML
  sidecar carrying hash, size, media type and original filename
  (`crates/files/src/files.rs`). Git LFS was considered and rejected
  (`docs/src/technical/file-storage.md`).

- **Artefact-as-folder** — a letter is a directory
  `correspondence/letter/<timestamp-id>/` holding `composition.yaml`
  (identity, authorship, time, structure), `body.md` (prose only) and
  `attachments/attachment_N.yaml` (metadata pointing at blobs). The
  YAML references the prose by path rather than embedding it
  (`docs/src/technical/clinical/communications/letters.md`). This is the
  exact shape a competency attestation wants.

- **Identifiers** — artefacts use a `TimestampId`,
  `YYYYMMDDTHHMMSS.sssZ-<uuid4>`, globally unique and chronologically
  sortable within one record. The generator enforces monotonicity by
  bumping to `previous + 1ms` if the clock has gone backwards
  (`crates/uuid/src/service.rs:800`). The docs are careful that
  timestamps give chronology, not identity.

- **Git is the audit log** — there is no separate event table. Every
  write is `write_and_commit_files` in
  `crates/core/src/versioned_files.rs`: write N files, one commit,
  best-effort rollback of files and created directories on failure.
  Repository creation removes the whole directory if the first commit
  fails, and surfaces a distinct `CleanupAfterInitialiseFailed` error
  if that cleanup itself fails so operators know residue exists.

- **Structured commit messages** — `<domain>:<action>: <summary>` with
  git trailers and no free prose. Actions are a closed enum: `create`,
  `update`, `superseded` (a clinical decision that prior content is
  obsolete, deliberately distinct from update) and `redact`. Trailers
  carry `Author-Name`, `Author-Role`, one `Author-Registration: GMC
  1234567` per registration, and a mandatory `Care-Location`. Those
  keys are reserved: callers cannot set them by hand, they are rendered
  only from validated structured data, and trailer values are rejected
  if they contain whitespace or newlines, so nothing can be spoofed by
  injection. The source repeats twice: no patient identifiers or
  clinical content in commit messages.

- **Signed commits** — the author may carry an ECDSA P-256 key and an
  X.509 certificate. The unsigned commit buffer is signed and the
  signature, public key and certificate are embedded in the commit's
  `gpgsig` header as a JSON container, so a commit is verifiable
  offline, years later, with no external service. Certificates put the
  registration authority in `O`, the registration number in X.520
  `serialNumber`, and a SAN URI `vpr://GMC/1234567`
  (`crates/certificates/src/lib.rs`). The rationale for X.509 over SSH
  or GPG keys is expiry, revocation and alignment with NHS PKI. Known
  gap: no CA chain validation, so a signature proves key possession,
  not identity.

- **Single branch, nothing deleted** — only `refs/heads/main` is ever
  authoritative (`docs/src/technical/design-decisions.md`). Messages are
  append-only and corrected by a new message carrying
  `corrects: <id>`; letters are editable because git keeps the history.
  Redaction is relocation to an encrypted retention repository with a
  tombstone left in history, and is explicitly neutral about blame
  (`docs/src/technical/redaction/index.md`).

- **Projections, deliberately absent** — there is no cache, index or
  projection code anywhere. The design
  (`docs/src/technical/design-decisions.md`, "Data flow and query
  model") is CQRS: files are truth, files are parsed into typed
  components, typed components are projected into a database, and
  *all interactive queries are served from projections; git and raw
  files are never on the hot path*. The invariants written for the
  future projection layer (`docs/src/llm/roadmap.md`, Epic 12) are the
  ones to adopt when we get there: projections are non-authoritative,
  disposable and rebuildable, link back to a commit hash, and have a
  documented acceptable lag.

- **Concurrency, designed not built** —
  `docs/src/technical/design-decisions-writing-workers.md`: one writer
  per record, a per-record lock taken from the relational database
  ("the database acts as a traffic light"), the HEAD commit recorded on
  read and asserted on write, crash before push means nothing changed,
  crash after push means the write completed. Stated non-goals: no
  distributed consensus, no message queues, no shared filesystem locks.
  "This approach is intentionally boring."

- **Honesty about what the system can know** — letters and messages
  refuse to record read receipts, acknowledgements, urgency or task
  state because "these concepts imply human cognition or behaviour that
  the system cannot verify and therefore does not assert." Alerting is
  a UI concern computed from timestamps.

- **Testing** — "test where the rule lives": exhaustive unit tests on
  the function that implements validation, and only wiring tests
  (errors propagate, **no side effects on rejection**) on callers.
  Real temporary directories rather than mocked filesystems. Fault
  injection to exercise cleanup-failure paths. Wrapper types such as
  `NonEmptyText` and `Sha256Hash` that cannot be constructed invalid.

- **Time semantics** — Epic 5 of the roadmap separates event time,
  documentation time and commit time, and insists git commit time is
  never presented as clinical event time. A sign-off has the same
  three clocks: the date the competency was observed, the date the
  assessor signed, and the moment the commit was written.

### Turva (turva-uk/turva)

Turva is the FastAPI, React 19 and Mantine successor to DCSP by the
same team. Its file-based document story lives almost entirely in
`specifications/` and two prototypes; the shipped `api/` is
authentication only. The specifications are strong on governance.

- **The reproducibility primitive** — `example_template/README.md`:
  "all we need to do is store the JSON array of answers and the git
  commit hash of the template, bind the two together and we can build
  the template with the given values." Structured answers plus a
  pinned template version render deterministically to Markdown. The
  plan adopts this: every attestation pins the framework version it was
  made against.

- **Typed artefact contract** — `specifications/archive/spec-archive.md`
  lines 56 to 79 define every safety artefact as having versioning,
  named ownership, an audit trail, visibility control, a lifecycle
  status and evidence linkage, and requires new artefact types to
  support all six. A competency attestation fits this contract exactly.

- **Contribution is not approval** — the central governance principle
  (`specifications/core-specification.md`): contributors provide input,
  approvers accept accountability, delegation does not remove
  accountability and is recorded, and every artefact has a named owner
  at all times. Trainee is owner and contributor; assessor is approver.

- **Decisions are time-bound to system state** — a decision is valid
  only in the context in which it was made. For a passport this means
  a sign-off is valid for the framework version and evidence at the
  time of signing, and a framework change may require re-attestation.

- **Approval record minimum** — name and role of approver, date, any
  conditions or caveats. Reviewers must genuinely review: "review is
  not a formality."

- **Derived, not entered** — risk level is computed from severity and
  likelihood and users cannot override it. A passport's overall status
  per domain must likewise be derived from the attestations, never
  typed.

- **Corrections are new versions** — "corrected transparently with a
  new version, not by silently editing history."

- **Repeating-folder template shape** — the frontend prototype's
  `template-example.json` marks a folder `is_repeating` with a
  `repeating_template_file_id`, rendering one file per data record.
  That is the `competencies/<id>/` layout below.

- **Sessions over JWT** — Turva chose server-side sessions because
  "clinical safety requires immediate invalidation." Quill uses short
  JWT access tokens with refresh; the point stands for revoking an
  assessor's ability to sign.

- **Not borrowable** — there is no file-backed API, locking, atomic
  write or PDF code in Turva. The roadmap ticks features the code does
  not have. Take the specifications, not the implementation.

- **A lesson in restraint** — `specifications/RATIONALIZATION-SUMMARY.md`
  records cutting the specs by 59 percent and deleting the 610-line
  "VMPT stack" document because "we use Git and Markdown. This is not a
  selling point in 2026." Use the mechanism, do not brand it.

### Digital Clinical Safety Platform (turva-uk/digital-clinical-safety-platform)

DCSP is the Django and MkDocs predecessor. It is the most complete
working example of markdown-as-record among the four, and its pain
points are the most instructive.

- **DB versus files** — `app/dcsp/app/models.py` holds only `Project`,
  `UserProfile`, `UserProjectAttribute` and `ProjectGroup`: identity,
  membership and two cache timestamps. Every hazard, officer, incident
  and sign-off is a Markdown file under
  `/projects/project_<pk>/CS-documents/docs/`. The project directory is
  a self-contained, cloneable safety file. The cost is that nothing is
  queryable: `entries_all_get` walks and regex-parses every file on
  every list, and TODO item 1 is getting the ordering right.

- **Markdown as schema** — the entry template (`hazard-template.md`)
  is simultaneously the form schema, the UI, the help text and the
  default content. A `### Heading` is a field; the heading text is the
  field's primary key; bracket tokens such as `[select]`, `[date]`,
  `[calculate] [L] [S]` and `[readonly]` set the widget. Renaming a
  heading silently orphans every existing record. Elegant for a demo,
  brittle as a system. Do not repeat.

- **Filename-as-identity** — new entries are numbered by
  `max(numbers) + 1` over filenames, with no lock and an
  acknowledged `hazard-1` versus `hazard-01` problem. Do not repeat.

- **Derived values computed in the browser** — the risk matrix is
  evaluated in JavaScript from strings in a Markdown file, and the
  JavaScript is untested. Do not repeat; derive server-side.

- **Sign-off was free text** — the compliance sign-off template has
  "Name approver with date (perhaps could link to officers page)" and
  officers are Markdown files disjoint from Django users. There is no
  verification that a named approver exists, no signature, no
  timestamp beyond what was typed, and `models.py:212` reads
  `# TODO #38 - audit functionality`. This is the gap the passport
  exists to close.

- **Versioning outsourced to a git push that was never finished** —
  `git_control.py` has an 829-line `GitController_on_hold` with commit
  and push driven by `pexpect`, and a comment `# TODO #19 - how will
  this work with lots of other users`. Only `clone` is live. Edits
  overwrite files in place, so there is no history at all. Lesson: the
  versioning primitive must be on the write path from day one, not a
  later integration.

- **Two identity namespaces** — Django users for access, officer files
  for people-in-the-record, never joined. The passport must have one
  identity: an assessor is a Quill user with a professional
  registration, and the attestation carries a snapshot of that identity
  at signing time.

- **Worth keeping** — placeholder values in `placeholders.yml` fed to
  `mkdocs-macros` via `INHERIT`; hazard-to-code traceability by parsing
  docstrings (`docstring_manipulation.py`), which shows the value of a
  first-class evidence link; and the nginx `X-Accel-Redirect` pattern
  for serving built static output behind an access check.

- **PDF** — not built. `download.md` reads "TODO NEED TO BUILD THIS
  FUNCTIONALITY". `mkdocs-with-pdf` appears only commented out.

### DCB0129 template (turva-uk/dcb0129-template)

A small Zensical (MkDocs-compatible) template for a DCB0129 clinical
safety management file. It is the file-based document model the other
two tools instantiate, and it makes one choice the passport must
invert.

- **Records are not files** — the governing documents are Markdown, but
  each hazard is a GitHub Issue. `hazard-log.md` is a pointer page. So
  the record set is not portable and does not belong to the author.
  The passport takes the opposite path: a competency attestation is a
  file the holder can carry.

- **Label taxonomy with the decision in the name** —
  `.github/labels.yml` defines `severity-*`, `likelihood-*` and
  `risk-level-1-acceptable` through `risk-level-5-unacceptable`, with
  the required action baked into the identifier. A prefix namespace,
  an ordinal and a human-readable state word sorts, filters and
  self-documents. The passport's level scheme should have this shape,
  for example `level-3-independent`.

- **Initial versus residual via milestones** — the same record carries
  two assessment points distinguished by milestone rather than by
  duplication. The passport equivalent is initial attestation and
  reassessment on one competency.

- **Never delete, only close or deprecate** — hazards are never deleted;
  they are closed with justification or labelled deprecated.

- **Approval as a git primitive** — the approvals table is replaced by
  "the nominated approver merges the pull request"; dates come from
  `git-revision-date-localized`; GPG-signed commits are "a further
  attestation to the correct identity of the committer." Elegant for a
  repository owner's approval, but a passport needs the *assessor's*
  attestation, which is why the plan records the assessor identity in
  the attestation file and the commit trailers rather than relying on
  who merged.

- **No frontmatter, no validation** — none of the ten documents have
  YAML frontmatter; metadata is prose under a "Document Management"
  heading; `download.md` references an undefined `project_slug`
  variable and nothing in CI would catch it. The passport must have a
  validated schema and a CI check over every framework file.

- **Single-person variables file** — `variables.yml` names one Clinical
  Safety Officer. A passport has many assessors, so people are
  referenced by identifier from a registry, not by scalar variables.

- **PDF export that works** — `mkdocs-with-pdf` (WeasyPrint underneath)
  is enabled, and the Dockerfile lists the native dependencies it
  needs: `python3-cffi python3-brotli libpango-1.0-0 libpangoft2-1.0-0`.
  This is the working reference for printouts among the four repos.

### Patterns adopted and anti-patterns avoided

- **Adopt: files canonical, one git repository per holder, sharded
  directories, YAML for structure and Markdown for narrative, binaries
  content-addressed outside git** — from VPR.

- **Adopt: artefact-as-folder with a YAML envelope, a Markdown body and
  attachment sidecars; timestamp identifiers; structured commit
  messages with reserved author trailers; single branch; nothing
  deleted** — from VPR.

- **Adopt: attestation pins the framework version; contribution is not
  approval; named owner at all times; approval record carries name,
  role, date and caveats; derived status is computed server-side;
  corrections are new records** — from Turva and the DCB0129 template.

- **Adopt: per-holder write lock in Postgres plus HEAD assertion; test
  where the rule lives with no side effects on rejection; fault
  injection on cleanup paths** — from VPR.

- **Adopt: the label shape `level-N-word`; initial and reassessment on
  one competency; a validated schema with a CI gate; WeasyPrint for
  PDF** — from the DCB0129 template.

- **Avoid: Markdown headings as schema; filename-derived identifiers;
  derived values in the browser; free-text sign-off; two identity
  namespaces; versioning deferred to an unbuilt integration; a
  projection layer before there is a query to serve** — from DCSP and
  from VPR's own restraint.

## Proposed design

### Two frameworks, one vocabulary

CBAC answers "what may this user do in Quill right now." The passport
answers "what has this person been assessed as competent to do, by
whom, on what evidence." They share the competency vocabulary and
nothing else in phase 1.

- **Competency types stay in CBAC** — every passport competency is an
  entry in `shared/competencies.yaml`. New categories `sact` and
  `radiotherapy` are added, with the individual competencies taken
  from the South West passport documents.

- **A passport framework groups competencies** — a new directory
  `shared/passport-frameworks/` holds one YAML file per framework and
  version, for example `sact-oncology-registrar/v1.yaml`. A framework
  lists domains, the competency ids in each domain, the level scheme,
  the evidence each competency needs, who may attest it, and its
  reassessment interval. A framework file is immutable once published;
  changes are a new version file.

- **The passport does not grant CBAC competencies** — a signed-off
  passport competency is evidence an administrator may act on, not an
  automatic change to `additional_competencies`. Automatic granting is
  a future item (see below) because it turns an educational record
  into an access-control input and needs clinical safety review.

- **Passport competencies are gated by CBAC** — two feature-admin
  competencies: `hold_clinical_passport` (may own a passport and
  request sign-off) and `attest_clinical_passport` (may sign off).
  Self-attestation is refused at the API regardless of competencies.
  Frameworks may narrow who can attest a given competency by base
  profession.

### On-disk layout of a passport

One git repository per holder, mirroring VPR's sharding, with content
addressed evidence outside git.

```text
passports/<s1>/<s2>/<32-hex-uuid>/
  .git/
  .gitignore                      # contains "files/"
  passport.yaml                   # holder snapshot, framework pins, schema version
  competencies/
    <competency_id>/
      <timestamp-id>/             # one attestation
        attestation.yaml          # structured record (see below)
        reflection.md             # holder narrative, optional
        assessment.md             # assessor narrative, optional
        attachments/
          attachment_1.yaml       # sidecar: sha256, size, media type, filename
  files/                          # gitignored, content-addressed evidence blobs
    sha256/ab/cd/<64-hex>
```

- **`passport.yaml`** — holder's user id, a snapshot of name and
  registrations at creation, the list of frameworks enrolled with their
  version and the SHA-256 of the framework file at enrolment, and a
  `schema_version` for the passport layout itself.

- **`attestation.yaml`** — the structured record. Fields: `id` (the
  timestamp id), `competency_id`, `framework` and `framework_version`
  and `framework_sha256`, `kind` (`initial` or `reassessment`),
  `status` (`requested`, `signed_off`, `declined`, `superseded`),
  `level` (from the framework's scheme), `observed_on` (clinical event
  date, entered), `signed_at` (set by the server when the assessor
  signs), `holder` and `assessor` blocks each with user id, name, role,
  registrations and care location as they were at signing, `caveats`
  free text, `corrects` optional id of a superseded attestation, and
  `content_hash` (SHA-256 over the canonical YAML minus the hash
  itself, printed on the PDF for verification).

- **Timestamp ids** — `YYYYMMDDTHHMMSS.sssZ-<uuid4>`, generated
  server-side with VPR's monotonic rule, so attestation folders sort
  chronologically within a competency.

- **Evidence** — uploaded files are hashed, stored under
  `files/sha256/` and referenced by sidecar. Phase 1 stores blobs in
  the same bucket prefix as the repository; the existing planned file
  storage architecture (MinIO and FHIR `DocumentReference`) is for
  patient documents and is not reused here.

### Commit model

- **One write, one commit** — every state change writes its files and
  commits in one operation with rollback on failure, after VPR's
  `write_and_commit_files`. There is no way to change a passport
  without a commit.

- **Message format** — `passport:<action>: <summary>` with `action` in
  `create`, `request`, `sign-off`, `decline`, `supersede`, `withdraw`.
  Trailers: `Actor-Name`, `Actor-Role`, `Actor-Registration` (one per
  registration), `Care-Location` (site or organisation name),
  `Competency: <id>`, `Attestation: <timestamp-id>`. Trailer keys are
  reserved and values are validated single-line text. No narrative and
  no patient data in messages.

- **Git author and committer** — the actor's display name and Quill
  email as git author; a fixed system identity as committer. Commit
  time is commit time; `observed_on` and `signed_at` in the YAML are
  the clinical and attestation times. Never present one as the other.

- **Single branch** — `refs/heads/main` only. No branches, no merges,
  no rewrites. Backfills and repairs are new commits.

- **Signing** — phase 1 signs nothing cryptographically. The
  `content_hash` in each attestation and the git object hashes give
  tamper evidence; identity assurance comes from the authenticated
  session. Per-assessor keys and embedded certificates are a future
  item.

### Where the repository lives

Cloud Run has no durable disk, and the only durable file store in the
current deployment is Cloud Storage (see
`docs/docs/infrastructure/gcp.md`). The passport store therefore has a
storage abstraction with two backends.

- **`PassportStore` interface** — `open(passport_id) -> working
  directory`, `commit(passport_id, expected_head, files, message)`,
  `read(passport_id, path)`, `blob_put`, `blob_get`. Core code sees a
  local directory and a git repository and nothing else.

- **Local backend** — a directory under a Docker volume in development
  and tests, mirroring the layout above exactly.

- **GCS backend** — each passport repository is held as a single `git
  bundle` object at `passports/<s1>/<s2>/<uuid>.bundle`, with evidence
  blobs beside it under `passports/<s1>/<s2>/<uuid>/files/sha256/...`.
  A write downloads the bundle to a temporary directory, unbundles,
  commits, re-bundles and uploads with `if-generation-match` set to
  the generation read at open time. Cloud Storage's generation check
  gives compare-and-swap for free, which is VPR's "assert HEAD on
  push" without any extra machinery. Repositories are a few kilobytes
  per attestation, so the round trip is cheap at passport volumes.

- **Alternative considered** — a Cloud Storage FUSE volume mounted on
  Cloud Run, letting the backend use plain filesystem git. Rejected for
  phase 1 because it is an infrastructure change, git over FUSE has
  many small-file writes with per-operation latency, and it gives no
  compare-and-swap. Revisit if the bundle round trip becomes a
  measurable cost.

### Concurrency

- **Per-passport lock** — a Postgres advisory lock keyed on the passport
  uuid is taken for the duration of any write, using the core database
  that every request already has. Different passports write in
  parallel; one passport writes serially. Lock release is automatic on
  connection loss.

- **HEAD assertion** — the head commit recorded at open is asserted at
  commit; the GCS generation is asserted at upload. Either mismatch is
  a `409 Conflict` and the caller retries from a fresh read.

- **No queues, no distributed locks, no conflict resolution** — after
  VPR's non-goals.

### What lives in Postgres

The core database holds coordination state and an index of existence,
not a copy of the record.

- **`passport`** — `id` (uuid), `user_id`, `created_at`, `head_commit`,
  `storage_generation`. One row per holder; the pointer to the
  repository.

- **`passport_signoff_request`** — `id`, `passport_id`, `attestation_id`,
  `competency_id`, `assessor_user_id`, `status`, `created_at`,
  `resolved_at`. This is workflow (an assessor's inbox is a query
  across many passports, which files cannot answer), not a projection
  of the record. The attestation file is the record; this row is the
  request that led to it and is closed when the file is written.

- **Nothing else** — no attestation table, no per-competency status
  table, no cached progress. A holder's passport page reads their
  repository. A programme director's cross-trainee view is a future
  item that will need a projection, and is listed under future work.

### Rendering and export

- **Markdown** — the passport is rendered on demand from
  `passport.yaml` and the attestation files into a single
  `passport.md` (front page with holder identity and framework
  versions, one section per domain, one table row per competency with
  its current level, assessor and date, and an appendix of every
  attestation in full including caveats and superseded records). The
  files are canonical; the rendered Markdown is a view and is not
  stored in the repository.

- **PDF** — the Markdown is converted to HTML with the `markdown`
  library already in `backend/pyproject.toml`, styled with a print
  stylesheet, and rendered by WeasyPrint. Each attestation carries its
  `content_hash` and the document footer carries the head commit hash,
  so a printed passport can be checked against the repository. The
  backend Dockerfile gains the Pango and cffi packages the DCB0129
  template lists. ReportLab (already used for teaching certificates)
  was considered and set aside because a multi-page tabular document
  is far easier to control from HTML and CSS.

- **Bundle download** — a zip of the passport directory (YAML,
  Markdown, sidecars, evidence blobs), the rendered `passport.md` and
  `passport.pdf`, and a `git bundle` of the full history. This is the
  portable artefact a registrar carries between trusts. Import of such
  a bundle into another Quill deployment is a future item.

### API surface

All routes under `/api/passport`, all requiring authentication, CSRF on
mutations, `requires_feature("passport")`, and the CBAC competencies
above. Additive only, per `.claude/rules/backend.md`.

- `POST /api/passport` — create the caller's passport and enrol in a
  framework. `hold_clinical_passport`.
- `GET /api/passport/me` — the caller's passport with derived status
  per competency.
- `GET /api/passport/{id}` — a passport the caller may view: the holder,
  an assessor with an open request on it, or an admin of the holder's
  organisation.
- `POST /api/passport/{id}/competencies/{competency_id}/requests` —
  holder requests sign-off, naming an assessor, with `observed_on`,
  optional reflection and evidence uploads. Writes a `requested`
  attestation and a request row.
- `GET /api/passport/requests/inbox` — the caller's open requests as an
  assessor. `attest_clinical_passport`.
- `POST /api/passport/{id}/attestations/{attestation_id}/sign-off` —
  assessor signs, with level, caveats and optional assessment
  narrative. Refused if the assessor is the holder or is not named on
  the request. Writes the file and closes the request.
- `POST /api/passport/{id}/attestations/{attestation_id}/decline` —
  assessor declines with a reason.
- `POST /api/passport/{id}/attestations/{attestation_id}/withdraw` —
  holder withdraws an open request.
- `GET /api/passport/{id}/export.md`, `export.pdf`, `export.zip`.
- `GET /api/passport/frameworks` — the published frameworks and
  versions.

### Frontend

- **Routes** — `/passport` (my passport), `/passport/competency/:id`
  (history and request form), `/passport/inbox` (assessor), and
  `/passport/sign-off/:attestationId`. Guarded with `RequireAuth`,
  `RequireFeature feature="passport"` and the CBAC hooks.

- **Components in `frontend/src/components/passport/`** —
  `PassportDomainProgress` (per-domain summary from derived status),
  `CompetencyRow`, `AttestationCard` (one attestation in full with
  status, assessor snapshot, caveats, evidence links),
  `SignOffRequestForm`, `SignOffForm` (level, caveats, narrative, the
  declaration checkbox), `AssessorDeclaration` (the fixed declaration
  text), `EvidenceUploader`, `PassportExportButtons`. Each with
  `.stories.tsx` and `.test.tsx`, built from `BaseCard`, `ButtonPair`,
  `Icon` and the design system.

- **Pages in `frontend/src/pages/passport/`** — thin compositions of
  the above with the `Stack gap="lg"` pattern and no Container.

### Validation and safety

- **Schemas** — Pydantic models with `extra="forbid"` for
  `passport.yaml`, `attestation.yaml`, sidecars and framework files;
  the same models validate on read, so a hand-edited or imported file
  that fails validation is rejected rather than half-parsed.

- **Framework CI gate** — a validator under `backend/app/features/`
  in the style of `features/teaching/tooling/validate.py` that checks
  every framework file: every competency id exists in CBAC, every
  attestor base profession exists, level schemes are well-formed,
  versions are immutable once published (a changed file with the same
  version fails).

- **Guard clauses** — every route validates the passport exists, the
  caller's relationship to it, the attestation's current status allows
  the transition, and the assessor is not the holder, before touching
  storage.

- **No PHI** — passports contain no patient data by design. Evidence
  uploads are the one risk (a scanned DOPS form might name a patient);
  the upload form carries a declaration that evidence is anonymised,
  and this is recorded in the hazard log.

- **Audit** — the git history is the audit trail. Exports are logged
  (who, which passport, when) in the existing application log with no
  content.

## Phase 0: framework content and clinical safety

- [ ] Obtain the South West SACT passport and the radiotherapy passport
      documents and list every competency, domain, level scheme,
      assessor role and reassessment interval.
- [ ] Add the `sact` and `radiotherapy` categories and their
      competencies to `shared/competencies.yaml`, with
      `display_name`, `category` and `risk_level`.
- [ ] Add `hold_clinical_passport` and `attest_clinical_passport` to
      `shared/competencies.yaml` under the feature-admin category, and
      to the appropriate base professions in
      `shared/base-professions.yaml`.
- [ ] Write `shared/passport-frameworks/sact-oncology-registrar/v1.yaml`
      and `shared/passport-frameworks/radiotherapy-oncology-registrar/v1.yaml`.
- [ ] Run `yarn generate:types` in `frontend/` and commit the generated
      JSON.
- [ ] Add hazard log entries for the passport: wrong assessor signs,
      holder self-attests, evidence contains patient data, exported PDF
      diverges from repository, stale framework version.

## Phase 1: core store and record model

- [ ] Create `backend/app/features/passport/` with `paths.py` (typed
      relative paths, no I/O, after VPR's `crates/core/src/paths/`),
      `ids.py` (timestamp id generator with monotonic rule),
      `schemas.py` (Pydantic models for `passport.yaml`,
      `attestation.yaml`, sidecars, frameworks), and `frameworks.py`
      (loader for `shared/passport-frameworks/`).
- [ ] Implement `store.py` with the `PassportStore` interface and the
      local filesystem backend, including `init_and_commit` with
      whole-directory cleanup on failure and `write_and_commit_files`
      with rollback.
- [ ] Implement `commits.py`: the commit message renderer with the
      closed action vocabulary, reserved trailer keys and single-line
      value validation.
- [ ] Implement `blobs.py`: content-addressed evidence store with
      sidecar metadata and refusal to overwrite an existing hash.
- [ ] Implement `service.py`: create passport, request sign-off, sign
      off, decline, withdraw, supersede, each as one validated write
      and one commit, with the derived per-competency status function.
- [ ] Add the `passport` and `passport_signoff_request` models to
      `backend/app/models.py` and create the migration with
      `just migrate "add clinical passport tables"`.
- [ ] Implement the per-passport Postgres advisory lock and HEAD
      assertion in the service layer.
- [ ] Unit tests with real temporary directories: every validation
      rule exhaustively where it lives, wiring tests proving no file or
      commit is written when validation fails, fault injection for the
      cleanup-failure path, monotonic id behaviour under a backwards
      clock, and concurrent-writer conflict returning 409. Run with
      `just ub -k passport`.

## Phase 2: storage on Cloud Storage

- [ ] Implement the GCS backend of `PassportStore`: bundle download,
      unbundle to a temporary directory, commit, re-bundle, upload with
      `if-generation-match`; blobs uploaded beside the bundle.
- [ ] Add `PASSPORT_STORAGE_BACKEND` and `PASSPORT_GCS_BUCKET` to
      `backend/app/config.py` following the teaching storage settings.
- [ ] Add the bucket and the Cloud Run service account IAM binding to
      Terraform, following the teaching bucket and the IAM note in
      `docs/docs/infrastructure/gcp.md`.
- [ ] Tests against a fake GCS client covering generation mismatch,
      partial upload failure and re-open after failure.

## Phase 3: API

- [ ] Add the `/api/passport` router under
      `backend/app/features/passport/router.py` with the routes listed
      above, `requires_feature("passport")`, CBAC dependencies, CSRF on
      mutations and rate limiting on uploads and exports.
- [ ] Register `passport` as an organisation feature key alongside
      `teaching`.
- [ ] Add Pydantic request and response schemas under
      `backend/app/schemas/passport.py` with `extra="forbid"`.
- [ ] Add API tests: each route's authorisation matrix (holder,
      assessor, other user, admin), every state transition, self-sign
      refusal, and that the api-compatibility snapshot is additive.
- [ ] Update `docs/docs/code/fastapi/` and the Swagger index for the new
      module.

## Phase 4: rendering and export

- [ ] Implement `render.py`: passport files to `passport.md`, with the
      front page, per-domain tables, and the full attestation appendix
      including superseded records.
- [ ] Add WeasyPrint to `backend/pyproject.toml` and the Pango and cffi
      packages to the backend Dockerfile; confirm the image still
      builds in CI.
- [ ] Implement `pdf.py`: Markdown to HTML with the existing `markdown`
      dependency, a print stylesheet, `content_hash` per attestation and
      the head commit in the footer.
- [ ] Implement the zip bundle export including a `git bundle` of the
      repository.
- [ ] Tests: rendered Markdown snapshot per fixture passport, PDF
      generation succeeds and contains the hashes, export logging
      records no content.

## Phase 5: frontend

- [ ] Add `frontend/src/lib/passport/` API client functions using
      `api.ts` and types generated from the backend schemas.
- [ ] Build the components listed above in
      `frontend/src/components/passport/` with stories and tests; present
      any genuinely new component for review before implementing, per
      the component reuse hierarchy.
- [ ] Build the pages and register routes in `frontend/src/main.tsx`
      with `RequireAuth`, `RequireFeature feature="passport"` and CBAC
      hooks.
- [ ] Add the passport entry to navigation for users holding
      `hold_clinical_passport` or `attest_clinical_passport`.
- [ ] Frontend tests with `just uf src/components/passport` and
      `just uf src/pages/passport`; Storybook tests with `just sbt`.

## Phase 6: hardening and launch

- [ ] End-to-end test: holder requests, assessor signs, holder exports
      PDF, hash on PDF matches repository.
- [ ] Security review of upload handling (type sniffing, size limits,
      path containment, symlink refusal) and of the authorisation
      matrix.
- [ ] Clinical safety review of the framework files and the declaration
      text with the Clinical Safety Officer; record in the hazard log.
- [ ] Enable the `passport` feature for the first South West
      organisation and onboard a small assessor group.
- [ ] Document the module under `docs/docs/backend/passport/index.md`
      and add a concepts page `docs/docs/concepts/clinical-passport.md`
      explaining the CBAC relationship.

## Future items, deliberately deferred

These are recorded now so the phase 1 design does not accidentally
close them off, and so nobody builds them before there is a need.

- **Projections and caches** — when a programme director needs "all
  registrars in the region by domain completion", or a holder's page is
  slow because reading and parsing a repository per request is
  measurable, add a projection layer with VPR's invariants: rows are
  non-authoritative, rebuildable from the repositories on demand, carry
  the commit hash they were built from, and have a documented lag. Do
  not build it before a query needs it.

- **Cryptographic signing** — per-assessor ECDSA keys and X.509
  certificates embedded in commits, after VPR's scheme, so a passport
  bundle is verifiable offline without Quill. Needs a key management
  story (where the private key lives, revocation) that is out of scope
  for phase 1.

- **Verifier role** — a third party who confirms an assessor was
  entitled to sign, as in the UKONS model. Model as a second
  attestation kind referencing the first.

- **External assessors** — consultants without Quill accounts signing
  via a time-limited invitation link, building on the external access
  work in the organisations and messaging plan. Phase 1 requires
  assessors to be Quill users.

- **Automatic CBAC grant** — a signed-off passport competency raising a
  request to add the matching id to `additional_competencies`, with
  administrator approval. Requires clinical safety review because it
  couples an educational record to access control.

- **Import of a passport bundle** — accepting a zip or git bundle from
  another deployment, validating every file against the schemas,
  refusing symlinks and path traversal, showing a dry-run preview, and
  recording the import as a commit with provenance. VPR's Epic 13 lists
  the pieces.

- **Reassessment reminders** — computing due dates from the framework's
  reassessment interval and the latest `signed_at`, surfaced in the UI
  and by email. Computed on read from the files, never stored as a
  flag, after VPR's refusal to record what it cannot verify.

- **ESR and portfolio export** — a structured export (CSV or FHIR
  `Practitioner` and related resources) for trusts that record the SACT
  passport on the Electronic Staff Record.

- **Redaction retention** — VPR's relocation-with-tombstone model for
  the rare case an attestation must be removed from routine view.
  Phase 1 has no delete at all, which is the safe default.

- **Cloud Storage FUSE** — if bundle round trips become a measurable
  cost, mount the bucket and let the store use plain filesystem git.

## Decisions

- **Files are canonical and git is the audit log** — because the
  passport must be portable across trusts and readable in twenty years
  without Quill. A database row cannot be handed to a registrar; a
  directory of YAML and Markdown with its history can. DCSP shows the
  cost of files without a versioning primitive on the write path, so
  every write is a commit from the first line of code.

- **One repository per holder, not per organisation or per framework**
  — the holder is the atomic unit that moves between trusts, exactly as
  the patient is in VPR. A holder enrolled in two frameworks has one
  repository with both.

- **Competency vocabulary stays in CBAC; frameworks and attestations
  are new** — one identifier for "prescribe SACT cycle 1" everywhere,
  and no duplicate registry to drift. The passport does not write to
  CBAC in phase 1 because granting access from an educational record
  is a clinical safety decision that has not been made.

- **Coordination in Postgres, record in files** — an assessor's inbox
  is a cross-passport query and files cannot serve it, so the request
  row lives in the database. It is workflow, not a copy of the record,
  and it closes when the file is written. This is the only concession
  to the database in phase 1 and it is not a projection.

- **Git bundle in Cloud Storage with generation-based compare-and-swap
  rather than a mounted volume** — because the deployment has no
  durable disk, the bucket pattern and IAM already exist for teaching,
  and `if-generation-match` gives VPR's optimistic concurrency with no
  new infrastructure. Passports are small and written rarely.

- **No projections until a query needs one** — VPR wrote the projection
  design and shipped none of it; DCSP shipped no queryable model and
  suffered. The right moment is when a real cross-passport query or a
  measured latency appears. The future-items section holds the
  invariants so it is built correctly when it is built.

- **No cryptographic signing in phase 1** — the authenticated session,
  the content hash on every attestation and git's object hashes give
  tamper evidence and attribution. Offline identity proof needs key
  management that would dominate the phase, so it is deferred with the
  design recorded.

- **WeasyPrint over ReportLab for the PDF** — the passport is a
  multi-page document of tables and prose that changes with every
  framework; HTML and CSS are the right tool. ReportLab stays for the
  fixed-layout teaching certificate. The native dependency cost is
  known from the DCB0129 template's Dockerfile.

- **Self-attestation refused at the API** — regardless of competencies
  held, because the whole value of the record is a second named person
  accepting accountability, after Turva's "contribution is not
  approval."

- **Three clocks kept apart** — `observed_on` is entered by the holder,
  `signed_at` is set by the server when the assessor signs, and the
  commit timestamp is the commit timestamp. The PDF prints the first
  two and the head commit hash. Presenting one as another is the
  mistake VPR's roadmap warns against.

## Open questions

- **Which documents are the source frameworks** — the South West SACT
  and radiotherapy passports need to be obtained from the user's wife
  or the deanery before Phase 0 can be completed; the domain notes
  above are from public summaries only.

- **Assessor eligibility** — whether "consultant or above" is right for
  every competency or whether some allow senior registrars or specialist
  nurses to attest. The framework file supports either; the content is
  a clinical decision.

- **Evidence retention** — how long evidence blobs are kept after an
  attestation is superseded, and whether a holder may remove evidence
  they uploaded in error. Phase 1 keeps everything.

- **Organisation scoping** — the organisation-scoped access findings
  plan (`2026-09-06-org-scoped-access-findings.md`) may change how
  "admin of the holder's organisation" is evaluated; the passport
  should adopt whatever that plan lands rather than invent a scope.
