# Clinician passport plan

Oncology registrars in the South West utilise a "SACT passport" and a
"radiotherapy passport": a portable record of the clinical competencies
they have been assessed as holding, who signed each one off, when, and
on what evidence. Today this lives in paper booklets scanned and copied
into digital portfolios. Quill Medical already has the vocabulary for
competencies (CBAC, `shared/competencies.yaml`) but nothing that records
the **sign-off** itself: the two-party act of a trainee presenting
evidence and a named assessor accepting accountability for it. This
plan adds a Clinician Passport that holds those sign-offs as portable,
versioned, human-readable files — one git repository per holder, a
YAML index of where every competency stands, and one immutable signed
YAML record per sign-off — rendered on demand to Markdown and PDF
printouts. It follows the file-first model of VPR and Turva, and just
as deliberately defers the projection and cache layer until user
numbers or latency demand it.

The first half of this document is the research: what the four
reference repositories do, what the wider standards landscape already
solves, and what both teach us. The second half is the design and
phased work that falls out of it.

Two findings shape everything below. Nobody has published a
competency record with a named assessor stored in git, so there is no
implementation to copy, only adjacent designs. And portability between
NHS trusts has repeatedly turned out to be a governance problem rather
than a technical one, so the format matters less than who owns the
competency framework — which makes the open question about ownership
the most important one in this document.

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

- **Source caveat, and why it does not block anything** — the UKONS and
  NHS England pages were not readable from this session (network egress
  is blocked to those domains), so the domain description above comes
  from search summaries and general knowledge. That is enough to build
  on. The first competencies are drafted from working clinical
  knowledge of
  what these passports contain.

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
  exact shape a competency sign-off wants.

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
  _all interactive queries are served from projections; git and raw
  files are never on the hot path_. The invariants written for the
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
  plan does not adopt the pinning wholesale, but takes the lesson: a
  record must carry enough of its own context to be read later. Every
  sign-off stores the human label beside every id, so it stays
  intelligible if a definition later changes. What VPR would have
  called pinning the version it was
  made against is deliberately not carried.

- **Typed artefact contract** — `specifications/archive/spec-archive.md`
  lines 56 to 79 define every safety artefact as having versioning,
  named ownership, an audit trail, visibility control, a lifecycle
  status and evidence linkage, and requires new artefact types to
  support all six. A competency sign-off fits this contract exactly.

- **Contribution is not approval** — the central governance principle
  (`specifications/core-specification.md`): contributors provide input,
  approvers accept accountability, delegation does not remove
  accountability and is recorded, and every artefact has a named owner
  at all times. Turva allows that owner to change, because its
  artefacts are hazards belonging to a project. A passport does not:
  the record belongs permanently to the person it describes, and there
  is no transfer.

- **Decisions are time-bound to system state** — a decision is valid
  only in the context in which it was made. For a passport this means
  a sign-off is valid for the definitions and evidence in place at the
  time of signing. The passport handles this by storing the words
  alongside the ids rather than by versioning a registry.

- **Approval record minimum** — name and role of approver, date, any
  conditions or caveats. Reviewers must genuinely review: "review is
  not a formality."

- **Derived, not entered** — risk level is computed from severity and
  likelihood and users cannot override it. A passport's overall status
  per domain must likewise be derived from the sign-offs, never
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
  is at once the form schema, the user interface, the help text and the
  default content. A `### Heading` declares a field, and bracket tokens
  such as `[select]`, `[date]`, `[calculate] [L] [S]` and `[readonly]`
  choose the widget. It is a compact idea, and it lets someone define a
  form by writing a document rather than by writing code. The trade-off
  is that a field is identified by the words shown to the user, which
  ties the data to its presentation.

- **Filename-as-identity** — new entries are numbered by
  `max(numbers) + 1` over filenames, with no lock and an
  acknowledged `hazard-1` versus `hazard-01` problem.

- **Derived values computed in the browser** — the risk matrix is
  evaluated in JavaScript from strings in a Markdown file, and the
  JavaScript is untested. Turva's specification later made
  server-side derivation a principle.

- **Sign-off was free text** — the compliance sign-off template has
  "Name approver with date (perhaps could link to officers page)" and
  officers are Markdown files disjoint from Django users. There is no
  verification that a named approver exists, no signature, no
  timestamp beyond what was typed, and `models.py:212` reads
  `# TODO #38 - audit functionality`.

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
  registration, and the sign-off carries a snapshot of that identity
  at signing time.

- **Placeholder values** in `placeholders.yml` fed to
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
  The passport takes the opposite path: a competency sign-off is a
  file the holder can carry.

- **Label taxonomy with the decision in the name** —
  `.github/labels.yml` defines `severity-*`, `likelihood-*` and
  `risk-level-1-acceptable` through `risk-level-5-unacceptable`, with
  the required action baked into the identifier. The transferable part
  is the word, not the number: a label that states its own meaning
  needs no lookup table. The passport takes the word and leaves the
  ordinal, naming levels `supervised` and `unsupervised` and taking
  their order from the definition instead.

- **Initial versus residual via milestones** — the same record carries
  two assessment points distinguished by milestone rather than by
  duplication. The passport equivalent is initial sign-off and
  reassessment on one competency.

- **Never delete, only close or deprecate** — hazards are never deleted;
  they are closed with justification or labelled deprecated.

- **Approval as a git primitive** — the approvals table is replaced by
  "the nominated approver merges the pull request"; dates come from
  `git-revision-date-localized`; GPG-signed commits are "a further
  attestation to the correct identity of the committer." Elegant for a
  repository owner's approval, but a passport needs the _assessor's_
  own act, which is why the plan records the assessor identity in the
  sign-off file and the commit trailers rather than relying on who
  merged.

- **No frontmatter, no validation** — none of the ten documents have
  YAML frontmatter; metadata is prose under a "Document Management"
  heading; `download.md` references an undefined `project_slug`
  variable and nothing in CI would catch it. The passport must have a
  validated schema and a CI check over the competency definitions.

- **Single-person variables file** — `variables.yml` names one Clinical
  Safety Officer. A passport has many assessors, so people are
  referenced by identifier from a registry, not by scalar variables.

- **PDF export that works** — `mkdocs-with-pdf` (WeasyPrint underneath)
  is enabled, and the Dockerfile lists the native dependencies it
  needs: `python3-cffi python3-brotli libpango-1.0-0 libpangoft2-1.0-0`.
  This is the working reference for printouts among the four repos.

### Prior art beyond the four repositories

Two rounds of web research were run over the standards landscape, the
git-as-record-store literature, the PRSB, and identifier design. The
full reports are working notes rather than repository content. Most
standards bodies' own sites were blocked by the network proxy, so
claims below marked _unverified_ rest on search summaries and should be
confirmed before being acted on.

- **Nobody has done this.** Competency _frameworks_ published as YAML
  and Markdown in git are common. Competency _records_ carrying a named
  assessor, in git, could not be found anywhere public. Every project
  that started that way pushed records out of git and into a tracker,
  a spreadsheet or a database.

- **The one UK success for regulated documents in git** is
  `GSTT-CSC/QMS-Template` from Guy's and St Thomas', whose README
  states it has survived 18 internal and 3 external ISO 13485 audits by
  two notified bodies. It uses no cryptography at all: the signature is
  a pull request approval plus a controlled merge. Useful calibration
  on how much cryptography auditors actually require.

- **The one loud abandonment** is OpenRegulatory, who wrote the
  canonical Markdown QMS templates and now publish "GitHub QMS: We No
  Longer Recommend It", on the grounds that the pattern breaks as soon
  as non-technical people are involved. _Unverified_ — their site was
  blocked. DCSP reached the same conclusion independently and answered
  it by building an application so nobody had to touch git, which is
  the answer this plan also takes.

- **Portability is a governance problem, not a technical one.** The NHS
  Digital Staff Passport used W3C verifiable credentials, had national
  backing and an ESR integration, reached four trusts, and was retired
  on 5 December 2025. Over the same period the statutory and mandatory
  training arrangement — a policy agreement with no new software —
  reached 262 organisations accepting each other's prior training.
  Same problem, opposite outcomes, and the difference was not the
  format. _Unverified._

- **The niche is partly occupied.** Compassly, an NHS Innovation
  Accelerator company, hosts the UKONS SACT passport along with BOPA
  and ACCEND frameworks, reportedly across 100+ NHS organisations. Its
  format is closed, so portability is vendor-mediated. Nursing,
  pharmacy and AHP oncology competency is therefore covered. The
  uncovered cell is **medical registrars and their local clinical
  competencies** — a Leeds standard operating procedure reportedly
  still requires specialist registrars to repeat level 1 SACT
  assessment on every trust move. That is the wedge, and it is
  narrower and more defensible than "a competency passport".
  _Unverified._

- **The PRSB has no competency framework.** Its roughly 25 standards
  are all patient record content standards. Its Provenance Data
  Standard is worth borrowing conceptually, since who made an entry,
  where and when is structurally what a sign-off records. PRSB is also
  in flux: NHS England reportedly did not renew its contract past
  December 2025. It is not a realistic route to originating a
  standard. _Unverified._

- **Standards say do not put hierarchy in identifiers.** 1EdTech CASE,
  read directly from its schema, makes `CFItem.identifier` a UUID
  described as "synthetic", keeps the readable code in a separate
  `humanCodingScheme` field, and expresses hierarchy in separate
  association objects. SNOMED CT, the largest clinical hierarchy in
  existence, puts no meaning in its identifiers at all and permits
  multiple parents. ESCO reportedly derived skill URIs from
  hierarchical allocation and then re-issued them as random values
  specifically to stop that dependency. OPCS-4's 4.10 to 4.11 revision
  removed 73 codes and needed a published equivalences table. The
  conclusion is in the design below.

- **Doorstop is the best structural model found.** It stores one YAML
  item per file in git for requirements management, and its `reviewed`
  fingerprint hashes only the semantically significant fields, with a
  documented list of what does and does not contribute. Cosmetic edits
  do not invalidate a review; substantive ones do.

### Patterns adopted and lessons learned

- **Adopt: files canonical, one git repository per holder, sharded
  directories, YAML for structure and Markdown for narrative, binaries
  content-addressed outside git** — from VPR.

- **Adopt: artefact-as-folder with a YAML envelope, a Markdown body and
  attachments listed by hash; timestamp identifiers; structured commit
  messages with reserved author trailers; single branch; nothing
  deleted** — from VPR.

- **Adopt: records carry their own context; contribution is not
  approval; the holder owns the record permanently; approval record
  carries name, role, date and caveats; derived status is computed
  server-side; corrections are new records** — from Turva and the
  DCB0129 template, with ownership narrowed to fit a personal record.

- **Adopt: per-holder write lock in Postgres plus HEAD assertion; test
  where the rule lives with no side effects on rejection; fault
  injection on cleanup paths** — from VPR.

- **Adopt: self-describing labels rather than numbered ones; initial
  and later sign-offs on one competency; a validated schema with a CI
  gate** — from the DCB0129 template.

- **Learned: Markdown headings make poor field identifiers;
  filename-derived numbering races; derived values belong on the
  server; free-text sign-off cannot be verified; one identity
  namespace, not two; the versioning primitive must be on the write
  path from the start** — from DCSP, which is the only one of the four
  that shipped a working markdown-as-record system and therefore the
  only one whose choices have been tested. Most of these are recorded
  in its own TODO comments, and Turva's later specification moves away
  from several of them.

- **Learned: do not build a projection layer before there is a query to
  serve** — from VPR's own restraint, which specified projections
  carefully and shipped none.

## Proposed design

### One vocabulary, no second registry

CBAC answers "what may this user do in Quill right now." The passport
answers "what has this person been assessed as competent to do, by
whom, on what evidence." They share one competency vocabulary and
nothing else.

- **There is no separate framework registry** — competencies live
  where they already live, in `shared/competency-definitions/`,
  extended with a few optional fields. No second directory, no second
  schema, no second validator, and no second place to look when
  something is wrong.

- **Levels are named, ordered and optional, declared per competency** —
  never numbered. A number means nothing without a lookup, and every
  stored record is wrong the moment a scale gains a step. Order comes
  from the order they are listed in:

  ```yaml
  - id: perform_bronchoscopy
    display_name: "Perform bronchoscopy"
    levels:
      - id: supervised
        name: "Can perform with supervision available"
      - id: unsupervised
        name: "Can perform independently"
    expires_after_months: 12
  ```

  Every added field is optional, so a competency without them behaves
  exactly as it does today and CBAC is untouched. A competency may
  declare one level, or none at all where the honest answer is simply
  signed off or not. Cannulation needs no scale; prescribing systemic
  anti-cancer therapy does. The slug names the procedure and the level
  says how far along the holder is, so a permission-shaped string can
  be composed at the point of use — `perform_bronchoscopy:unsupervised`
  — without ever storing it that way.

- **A competency may be a whole capability, not an atomic act** —
  "manage the acutely unwell patient" rests on cannulation, airway
  assessment, escalation and a dozen other things, and is still one
  thing a consultant watches and signs. So is "deliver the acute
  oncology take". Both shapes belong in the catalogue: the granular act
  where that is what gets assessed, and the composite capability where
  that is. What decides it is what a person is actually signed off for
  on the day, never how neatly the capability decomposes. This is why
  the RCR's capabilities in practice sit alongside
  `perform_lumbar_puncture` without conflict — they are the same kind
  of thing at different grain, and the passport records whichever the
  assessor used.

- **A passport is not a defined set of competencies** — there is no
  grouping in the shared definitions saying which competencies make up
  "the SACT passport". Membership of a passport is local policy: the
  South West's list will not match another region's, and encoding one
  view centrally would impose it on everyone. A passport simply holds
  the sign-offs its holder has accumulated.

- **A site or organisation may curate a shortlist, as a convenience
  only** — an oncology centre will want its common competencies to
  hand rather than making people search a few thousand definitions.
  That shortlist is Quill configuration held in Postgres, never part
  of a passport, so an exported record never carries one trust's
  opinion of what matters into another. It suggests and never gates:
  the picker shows "commonly used here" first with a full search
  beneath it reaching every competency, and nothing is hidden or
  refused. The wording matters as much as the behaviour — "commonly
  used here" rather than "required", or a convenience list quietly
  becomes a syllabus, which is the sufficiency judgement the passport
  deliberately refuses to make.

- **The passport does not grant CBAC competencies** — a signed-off
  passport competency is evidence an administrator may act on, not an
  automatic change to `additional_competencies`. Automatic granting is
  a future item (see below) because it turns an educational record
  into an access-control input, which is a decision to take
  deliberately rather than a side effect of shipping the passport.

- **One competency gates the whole feature** —
  `access_clinician_passport`, a feature-admin competency meaning this
  person uses the passport. Holding one and signing one are not
  separate privileges, because they are not separate people: a
  consultant of thirty years still needs new competencies signed off,
  and a registrar signed off for thoracic ultrasound last year is
  often exactly the right person to sign off a junior this year.
  Splitting them would encode a seniority model that does not match
  how clinical training actually works.

- **What actually constrains a sign-off** is not a CBAC flag:
  - Self-sign-off is refused at the API, always. This is the only
    hard rule, and it is the one that matters, because the whole value
    of the record is a second named person.
  - The holder chooses their assessor, so the judgement about who is
    appropriate sits with the person being assessed and their
    supervisor, where it belongs.

  Nothing else. There is no eligibility rule, no list of who may sign
  what, and no requirement that a signer holds the competency
  themselves. Who is fit to assess someone is a clinical judgement made
  by clinicians, and it varies by procedure, by department and by the
  people involved in ways no rule table would survive.

  The system records rather than polices. A sign-off names its
  assessor, their role and their registration, so anyone reading the
  record can judge whether it was appropriate. Enforcing professional
  judgement the software cannot verify would be the same mistake as
  judging sufficiency from a logbook count.

- **Assessors may be external to Quill** — most consultants who sign a
  registrar's passport will never otherwise use Quill. The holder
  invites them, they register through the existing invite-token flow,
  and they hold `access_clinician_passport` and nothing else. See
  "External assessors" below.

### Competency identifiers

- **Flat, stable, human-readable slugs.** `prescribe_sact_cycle_1`,
  not `/prescribing/chemotherapy`. A path-shaped identifier bakes a
  taxonomy into every stored record, and taxonomies get reorganised.
  ESCO tried hierarchical identifiers and reversed the decision; CASE
  and SNOMED CT never did it. The rule that keeps a slug safe: **it may
  describe the act, never the act's classification.**

- **Hierarchy lives in the competency definition**, as a multi-valued
  `parents:` list, and paths, directories and menus are generated from
  it. Nothing is lost: the repository can still be laid out
  hierarchically, because what a sign-off references is the id inside
  the file, so reorganising the taxonomy becomes a cosmetic commit
  rather than a migration that invalidates history. Multiple parents
  are supported because they are real — prescribing chemotherapy
  belongs under prescribing and under oncology at once, which a single
  path cannot express.

- **Ids are permanent and never reused.** A competency that is
  withdrawn is deprecated, not deleted, with a graded successor —
  `same_as`, `replaced_by`, `possibly_equivalent_to` or `split_into` —
  and a recorded reason, after SNOMED's historical association model.
  Re-parenting must be a non-breaking change; if it breaks something,
  hierarchy has leaked into identity.

- **CI enforces it**: ids unique including the deprecated graveyard,
  no `/` in an id, and no path-shaped reference in any sign-off.

- **Mappings, not identity, carry the standards.** Each competency in
  a competency definition may carry `mappings.snomed` (plural — a
  can map to several concepts), `mappings.opcs4`, and RCR
  capability-in-practice numbers, each version-stamped. SNOMED CT is
  free in the UK under the national licence, though it needs a TRUD
  registration and an annual declaration.

- **One flag on the existing set.** `prescribe_controlled_schedule_2`
  embeds a statutory classification. Far more stable than a clinical
  taxonomy and defensible, but drugs do get rescheduled; it is the one
  current id worth revisiting.

### Standards we checked, and what we took

Git, YAML and Markdown are storage rather than a standard we are
inventing. Beyond that we take lessons from existing standards, and
implement none of them, because nothing consumes an export today. When
something does, the future items say where to look.

- **Content**: the first set of competencies is drafted from working
  clinical knowledge, then checked against the UK SACT Board's
  _Prescriber competencies for reviewing and prescribing SACT_
  (November 2023), which reportedly covers medical prescribers at ST
  level and above. Aligning to it matters for adoption rather than for
  building, so it is a later task in Phase 0 and not a prerequisite.

- **Identifiers**: 1EdTech CASE and SNOMED CT both keep classification
  out of identifiers entirely. That lesson is applied in full — see
  the identifier section above — and is the only thing taken from
  either.

- **Provenance**: the PRSB Provenance Data Standard is a useful way to
  think about a sign-off, since who recorded what, where and when is
  structurally what one is.

Two gaps the research flagged, both now settled rather than open.
**Two-party sign-off** turned out not to be a gap: only the assessor
attests, and they attest to a record already containing the holder's
contributions, so nothing separate from the holder is needed.
**Binding a key to a GMC number** is closed by not making the claim —
registrations are recorded as data with a verified flag, and there is
no certificate to seal them into.

### Ways in, and two levels of trust

A holder does five things with a passport, and the design falls out of
the difference between them.

- **Upload a certificate** — a course attendance, a qualification, an
  external award. The file itself is a binary; the passport stores what
  it is, who issued it, when, and which competencies it relates to.

- **Request a sign-off** — pick a competency, name an assessor, and
  send them a link. They review and sign.

- **Keep a logbook** — start a logbook against any competency and
  record each procedure as it happens.

- **Write a reflection** — on a case, a complaint, a significant
  event. Often tied to no competency at all.

- **Record continuing professional development** — teaching days,
  grand rounds, conferences, whether or not a certificate came with
  them.

All but one are **self-declared evidence**: the holder enters them,
nobody countersigns, and they are claims about what happened. The
exception is the sign-off, a **two-party assessment** where a named
person accepts accountability for a judgement.

Keeping those apart is the whole point. A logbook of two hundred
bronchoscopies proves activity, not competence. The consultant's
sign-off is what turns evidence into a conclusion, and the system must
never blur the two by appearing to draw the conclusion itself.

### On-disk layout of a passport

One git repository per holder, mirroring VPR's sharding, with content
addressed evidence outside git.

```text
passports/<s1>/<s2>/<32-hex-uuid>/
  .git/
  .gitignore                        # contains "files/"
  README.md                         # plain English: what this is, how to read it
  manifest.yaml                     # what this passport is: id, format, dates
  profile.yaml                      # who this passport belongs to
  competencies.yaml                 # derived index: every competency and its state
  certificates/
    2025-11-04-bronchoscopy-course/
      certificate.yaml              # issuer, dates, competencies, attachments details
  logbook/
    perform_bronchoscopy/
      2026-03-14-143207.yaml        # one entry, named when it was written, attachment details
      2026-03-14-143512.yaml
    perform_thoracic_ultrasound/
      2026-03-21-091044.yaml
  reflections/
    2026-03-14-difficult-airway/
      reflection.md                 # YAML frontmatter, then the writing, attachment details
  cpd/
    2026/
      2026-02-11-171930.yaml        # one activity: conference, grand round, course
  sign-offs/
    2026-03-14-perform-bronchoscopy/
      sign-off.yaml                 # the record, and its content hash
      reflection.md                 # holder narrative, optional
      assessment.md                 # assessor narrative, optional
  files/                            # gitignored, content-addressed evidence blobs
    sha256/ab/cd/<64-hex>
```

Two levels, deliberately. `competencies.yaml` answers the question
asked ninety-nine times out of a hundred — is this person signed off —
and the directories beneath hold the detail that only matters at an
ARCP panel, an audit, or a concern.

Evidence is listed inside the record that refers to it, so a record
naming one attachment and a record naming five look the same:

```yaml
attachments:
  - hash: sha256:ab12cd34…
    filename: bronchoscopy-course-certificate.pdf
    size_bytes: 104857
    media_type: application/pdf
  - hash: sha256:7f4e9a21…
    filename: course-transcript.pdf
    size_bytes: 38214
    media_type: application/pdf
```

The hash is the pointer. `sha256:ab12cd34…` resolves to
`files/sha256/ab/12/ab12cd34…`, so no path is stored and nothing can
drift out of step. Every record file carries the list at its top level,
except a reflection, which carries it in frontmatter like everything
else it holds.

The grouping differs by record type, and the rule is worth stating
because it looks inconsistent until you see it. **Where a directory is
the competency, it is named by the competency id verbatim. Where a
directory is a human label, it is named for reading and the
authoritative id lives inside the file.** So `logbook/` groups by
competency id, because a logbook entry is about one procedure and
"show me my bronchoscopy logbook" should be one directory. Certificates
and sign-offs stay flat with the competency as a field, because both
legitimately span several competencies at once — one course supports
three of them, and one clinic produces a single sign-off covering
several.

- **`manifest.yaml`** — what this passport _is_, as distinct from what
  it contains:

  ```yaml
  # What this passport is. Read alongside README.md.
  passport_id: 3f2a8c1e4b7d49f0a6c2e8b1d5a7f309
  schema_version: 1
  created_by: Quill Medical
  created_at: 2026-09-10
  ```

  Everything else in the repository is the holder's record; this one
  file describes the shape of it, and anyone opening a passport years
  from now reads it first to know what they are holding. `passport_id`
  matters more than it looks: without it the identifier exists only in
  the directory path, so a copied or renamed folder loses it.

  There is no jurisdiction here. A passport belongs to a person, and a
  person may practise in more than one country, so pinning the record
  to a single one would split a career that is not split. Each
  registration names its own body, and each sign-off records where it
  happened and under whose registration it was given. Where an act
  genuinely differs between countries — certifying death, say — that is
  a different competency with its own id, which the identifier rules
  already handle.

- **`profile.yaml`** — the holder's user id, name and current
  registrations, regenerated whenever any of them changes rather than
  frozen at creation. It is the one place the passport says whose it
  is, which is why no other record repeats it.

- **`competencies.yaml`** — the derived index, regenerated on every
  write and never hand-edited. One entry per competency the holder has
  evidence for, carrying `id`, human `name`, `status`, the
  current `level` where the competency has levels, `signed_on`,
  `signed_off_by`, `expires_on`, a
  `sign_off` naming the folder that holds the record,
  `previous_sign_offs` listing earlier ones newest first, a
  `logbook_entries` count, and `certificates` naming the folders that
  relate to this competency. If it ever disagrees with the directories
  beneath, they win and it is rebuilt.

- **Expiry is recorded and nothing more** — where a competency
  declares an interval, the sign-off carries `expires_on` and the
  index shows it. Nothing acts on it: no expired status, no reminders,
  no dropping back to a lower level, no bar on anything. The date is
  there to be read by a person who can judge what it means. Acting on
  it is a future item, deliberately, and the rule for what a lapsed
  sign-off implies is a clinical decision that has not been made.

- **Counts, never comparisons** — the index reports
  `logbook_entries: 38`. It never carries a target, a percentage, a
  progress bar or a ready-or-not status, because the number needed is
  a judgement belonging to the assessor and not to the software. See
  the decision below.

- **Entry filenames are the moment they were written** —
  `2026-03-14-143207.yaml`, date then hours, minutes and seconds. No
  colons, which Windows rejects. This is deliberately the time Quill
  wrote the file rather than the clinical date, for two reasons: the
  server always knows it, so nobody types anything; and it is unique
  without a hash suffix, which reads as noise to anyone who is not a
  developer. Seconds make collisions vanishingly unlikely, and the
  server bumps to the next second if two ever land together.

  The clinical date lives inside the file as `performed_on`, without a
  time, because nobody recalls whether a procedure was at 09:30 or
  11:00 when they log five of them on a Friday evening. One
  consequence: a folder listing is ordered by when things were logged,
  not when they happened. That only affects someone browsing raw
  files — the rendered passport and the PDF sort by `performed_on`.

- **Sign-off folder names are for humans** —
  `<observed-date>-<competency-slug>`, so the directory listing reads
  as a chronology of clinical work. A second sign-off for the same
  competency observed on the same day gets `-2` (or higher number). Names are fixed at
  creation and never reused, because the name is the only handle
  `competencies.yaml` uses. References there are bare folder names
  rather than paths, so the layout can change later without rewriting
  every entry.

- **`sign-off.yaml`** — the record itself, and the thing that is
  signed. Fields: `id` (a timestamp id), the `competency` block with
  both `id` and human `name`, `kind` (see below), `status`
  (`requested`, `signed_off`,
  `declined`, `superseded`), `level` with `id` and `name` where the
  competency declares levels, `observed_on`, `signed_at`,
  `expires_on`,
  a `signed_off_by` block with the assessor's user id, name, role,
  registrations, `registration_verified` and care location as they
  were at signing, `meaning` (see the commit model), `comments`,
  `corrects` naming a superseded sign-off, and `content_hash`.

- **Three reasons for a later sign-off, and only one supersedes** —
  `kind` records which:
  - `initial` — the first sign-off for this competency.
  - `progression` — a higher level than before, for example supervised
    in March and unsupervised in September. The earlier record stays
    correct and valid; the holder simply moved on.
  - `reassessment` — the same level confirmed again.
  - `correction` — the earlier record was wrong. This is the only kind
    that sets `corrects` and marks the earlier sign-off `superseded`.

  Progression and reassessment supersede nothing. Conflating them with
  correction would quietly imply that an assessor had got something
  wrong when they had not.

- **`certificate.yaml`** — what the certificate is, the issuing body,
  the date awarded and any expiry, the competencies it relates to, and
  a free-text description, plus the `attachments` list. The binary
  itself never enters git: it is hashed into `files/sha256/` and named
  by that hash in the list, exactly as evidence attached to a sign-off
  is. A certificate is the holder's own claim, with nobody
  countersigning it.

- **Logbook entries** — one file per procedure, grouped into a folder
  per competency, so every record in the passport is its own file and
  the logbook stops being the one exception. Each records
  `performed_on`, the setting, whether it was supervised or
  independent, the supervisor where there was one, the indication, the
  outcome and free-text notes. An entry may name further competencies
  it also counts towards, so an unusual case need not be duplicated.
  Entries are the holder's own record, with nobody countersigning.

  ```yaml
  # logbook/perform_bronchoscopy/2026-03-14-143207.yaml
  performed_on: 2026-03-12
  setting: Bristol Royal Infirmary
  supervision: supervised
  supervisor: Dr Amara Okonkwo
  indication: Suspected endobronchial lesion
  outcome: Successful
  notes: Straightforward. Biopsies taken from right upper lobe.
  ```

- **`reflection.md`** — YAML frontmatter carrying the date, a title,
  any competencies it relates to and the `attachments` list, then the
  writing itself. The prose is the substance here, which is why the
  structure sits in frontmatter rather than in a separate file the way
  a sign-off's does.

- **CPD entries** — one file per activity, grouped into a folder per
  year. Each records the date, what it was, its type — conference,
  grand round, teaching day, course — hours where they are claimed,
  and optionally the competencies it relates to or a certificate
  folder that evidences it. Grouping by year is not file management:
  UK appraisal runs annually and asks what you did this year, so the
  grouping matches how the record is used.

- [ ] We need to figure out how to show a tally each year of CPD points (hours)

- **Failures are recorded like anything else.** An unsuccessful
  procedure, an abandoned attempt or a declined sign-off is part of the
  record. The alternative — a record that only shows successes — is
  worth less to everyone reading it.

- **Every file must make sense alone, within its passport.** The human
  label travels beside every identifier even though it is derivable,
  because a sign-off read years later has to be intelligible. The one
  thing not repeated is who the passport belongs to: that is in
  `profile.yaml`, and copying it into every record would leave dozens
  of stale names behind the first time somebody marries. The id stays authoritative; the label is a convenience
  copy, and where they disagree the id wins. Files carry a one-line
  YAML comment saying what they are.

- **Timestamp ids in files** — `YYYYMMDDTHHMMSS.sssZ-<uuid4>`, generated
  server-side with VPR's monotonic rule. These identify a sign-off
  permanently; they no longer appear in folder names or in the index.

- **Evidence** — uploaded files are hashed, stored under
  `files/sha256/` and listed by hash in the record that refers to
  them. Phase 1 stores blobs in
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
  `Competency: <id>`, `Sign-Off: <folder-name>`. Trailer keys are
  reserved and values are validated single-line text. No narrative and
  no patient data in messages.

- **Three clocks, kept apart** — `observed_on` is when the work was
  watched, `signed_at` is when the assessor signed, and the commit
  timestamp is when the file was written. In practice these are not
  the same day: a consultant may take days or weeks to sign off
  something they observed, so the gap is normal rather than
  exceptional. Record all three faithfully, show the first two on the
  PDF, and never present one as another. The gap is itself a quality
  signal a panel can weigh; the system records it and draws no
  conclusion from it.

- **Git author and committer** — the actor's display name and Quill
  email as git author; a fixed system identity as committer.

- **Single branch** — `refs/heads/main` only. No branches, no merges,
  no rewrites. Backfills and repairs are new commits.

- **Git alone is not an audit trail, and the plan must not claim it
  is.** A force push rewrites history and git cannot tell you who did
  it. Two things close that hole, neither needing a new table. The
  store rejects any non-fast-forward update, so a rewrite cannot arrive
  through the application at all. And the bucket keeps object versions,
  so a replaced bundle leaves its predecessors behind — the same
  generation numbers already used for compare-and-swap, with versioning
  switched on.

- **Content hashing follows Doorstop's discipline** — the hash covers
  a canonical serialisation of the semantically significant fields
  only, with the contributing and non-contributing fields written down
  in the schema. Correcting a typo in a comment must not change the
  hash; changing the level must. The same fingerprint drives
  reassessment, if we later choose to detect a competency definition
  changing under sign-offs already made.

- **A sign-off pins the evidence it was given** — the record stores
  the logbook count for that competency at the moment of signing, a
  digest over the entries it covered, and the certificates in view.
  Not as a threshold that was met, but as a record of what was in
  front of the assessor when they decided. That is the part that
  matters if a sign-off is ever questioned.

- **`meaning` is recorded on every sign-off** — one of
  `directly observed`, `reviewed evidence`, or `countersigned`. These
  are clinically different acts, and a record that does not say which
  one happened is weaker than it looks.

- **Git library** — pygit2 (libgit2, the same engine VPR uses),
  in-process. No shelling out to `git` and nothing driven by
  `pexpect`, which is where DCSP's push code stalled.

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
  per sign-off, so the round trip is cheap at passport volumes.

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

### Tamper-evidence and assurance

Nothing is cryptographically signed. That is a deliberate decision
rather than a gap, and it is worth stating plainly because the obvious
assumption runs the other way.

- **Why no keys** — any signing key would be held by Quill and used by
  Quill's server, so a signature would assert exactly what the
  database already asserts. It defends against nobody who matters:
  anyone with application access can make the server sign anything,
  and anyone with only storage access is already caught by the hashes
  below. Keys become worth having when somebody other than Quill holds
  them, which is a future item. The research supports the proportion:
  Guy's and St Thomas' passed three external ISO 13485 audits on a
  system whose signature was a pull request approval and a controlled
  merge.

- **`content_hash` on every sign-off** — SHA-256 over a canonical
  serialisation of the semantically significant fields, after
  Doorstop's discipline. Reformatting the YAML, reordering keys or
  fixing a typo in a comment must not change it; changing the level,
  the dates or the assessor must. The hash is printed on the PDF and
  in the export, so a printed passport can be checked against the
  record.

  **Contributing fields** — `id`, `competency.id`, `kind`, `status`,
  `level.id`, `observed_on`, `signed_at`, `expires_on`, `meaning`,
  `corrects`, the assessor's user id and registrations, the care
  location, and every attachment hash.

  **Non-contributing** — `content_hash` itself, since a file cannot
  contain its own fingerprint; every human `name` label, which is a
  convenience copy of an id that does contribute; `comments`; and the
  narrative files beside the record. Changing a label or tidying a
  comment leaves the fingerprint alone, which is the point.

  **Canonical form** means keys sorted, no comments, no trailing
  whitespace, dates as ISO strings, and the whole thing serialised the
  same way every time. Two implementations that disagree about
  canonical form will disagree about whether a record has changed, so
  it belongs in the schema rather than in whichever function got
  written first.

- **Git's object hashes** carry the same guarantee across the whole
  repository, and the commit history records who changed what and
  when.

- **Ordinary session authentication, and a declaration** — signing off
  is authenticated exactly as everything else in Quill is, with no
  step-up and no passport-specific rule. Access tokens last fifteen
  minutes and refresh tokens seven days; TOTP is available and, as
  elsewhere in Quill including teaching, optional. No clinical system
  asks a consultant to re-authenticate to sign a discharge summary,
  and asking for a code per sign-off would mean fishing out a phone
  five times after a clinic — friction landing exactly where adoption
  is most fragile.

  What makes it a deliberate act is the declaration: fixed text the
  assessor confirms before signing, which is what a wet signature
  actually is. Someone reads a statement and puts their name to it.

- **Verification** —
  `GET /api/passport/{id}/sign-offs/{signoff_id}/verify` recomputes the
  hash and reports whether the record is unchanged. The exported bundle
  includes a `VERIFY.md` with the `sha256sum` commands to do the same
  offline, with no software and no keys. The PDF prints the content
  hash on every sign-off and a QR code that opens the verify endpoint.

- **What this proves, and what it does not** — that a record has not
  changed since it was written, and that a named account signed it off
  after re-authenticating. It does not prove a professional
  registration, and it does not prove anything to a party who
  distrusts Quill itself. Both limits are stated rather than papered
  over.

- **Professional registrations are data on the record** — a list of
  plain key and value pairs, using the bodies already listed in
  `shared/jurisdiction-config.yaml`:

  ```yaml
  registrations:
    - body: GMC
      number: "1234567"
      verified: false # nobody has checked the register
    - body: CNOM
      number: "98765"
      verified: true
      verified_by: dr.patel@example.nhs.uk
      verified_on: 2026-04-02
  ```

  Quill does not check the GMC, NMC, GPhC or HCPC registers. An
  organisation admin can mark one verified after checking by hand, and
  until they do the record says so rather than implying otherwise.

  **Where they are stored**, and the distinction matters:
  - `User.professional_registrations` in Postgres is the live source,
    and the only one that is edited.
  - `profile.yaml` holds the **holder's** current set, regenerated
    whenever it changes, so the passport reads on its own without
    Quill.
  - Each `sign-off.yaml` holds the **assessor's** set inside
    `signed_off_by`, frozen as it was at signing. The holder's are not
    repeated there — they are in `profile.yaml`, and copying them into
    every record would leave stale names behind.

  **What they are used for**: showing a reader who signed and under
  what standing, and contributing to the sign-off's `content_hash` so
  an assessor's professional standing cannot be quietly rewritten
  afterwards. They gate nothing — no route, no level, no eligibility
  check consults them.

- **What the hash actually proves** — that this record has not changed
  since it was written. It does not prove a professional registration,
  and it proves nothing to anyone who distrusts Quill itself. The
  verify endpoint says exactly that rather than leaving a reader to
  assume more.

### External assessors

- **The problem** — the consultant who observes a registrar deliver a
  SACT cycle is external to the registrar's place, and often to Quill
  entirely. They cannot be asked to become staff of a trust they do
  not work for. The holder must be able to bring their own assessor.

  Two cases, and they converge. Someone with no Quill account at all,
  and someone who already uses Quill as staff at their own site.
  `external` names the relationship to _this_ place, not to Quill, so
  it fits both.

- **Invite by the holder** — the holder, or an admin of their
  organisation, invites an assessor by email with their name,
  registration authority and number. This writes a
  `passport_assessor_invite` row and emails a signed invite link,
  reusing `create_invite_token` and `decode_invite_token` in
  `backend/app/security.py` with a new `user_type` of
  `passport_assessor`. Tokens are single-use and expire after fourteen
  days; the row records who invited whom and for which passport.

- **Acceptance** — the link opens `/passport/assessors/accept`. A new
  user registers with name, email and password under Quill's ordinary
  account policy; an existing user signs in. Either way the result is
  a user with no platform role — the only one is `superadmin`, and
  they do not operate Quill — plus a base profession chosen from a
  short list, still to be designed, and the declared registrations in
  `professional_registrations`. Their standing comes entirely from the
  place membership below. Nothing about the passport imposes extra
  account requirements.

- **Membership at the holder's place, with an `external` capacity** —
  the assessor becomes a member of a place the holder is already a
  member of, holding `access_clinician_passport` there and nothing
  else. The system derives the place rather than asking: the
  narrowest one the holder holds, so a site where they have one and
  the organisation where they do not. A holder who sits only at
  organisation level is the ordinary case for a rotating trainee, not
  an exception to handle.

  The wider reach an organisation membership brings matters less than
  it first appears. Reach says only _where_ someone may act; what they
  may do there comes from competencies, and this assessor holds one.
  Whether the level matters at all depends on an open question below:
  whether bare membership with no competencies exposes anything at a
  place.

  The membership is honest rather than a device. A consultant who
  watched the procedure genuinely was there, which is why this is
  preferable to inventing an assessors organisation to hang a
  competency on.

  `external` is a new capacity alongside `staff` and `trainee`. It has
  to be new: `staff` is the one capacity with a live behavioural
  check, letting a member self-join a conversation in `messaging.py`,
  and a visiting assessor should not gain that. This fits what
  capacity already means in `models.py` — a different relationship to
  a place, never a ranking and never a permission check.

  **An assessor who already uses Quill gains this membership
  alongside their existing ones, not instead of them.** Memberships
  are per place and independent, so a consultant who is `staff` at
  their own site becomes `external` at the registrar's, holding
  `access_clinician_passport` there and nothing more. What they may do
  at their own site is untouched, and nothing they hold there reaches
  across. That independence is what makes one capacity per place the
  right shape rather than one role per person.

- **Membership persists after the request resolves.** Consultants
  supervise the same trainees repeatedly, so tearing it down and
  rebuilding it each time is churn for no gain. An admin of the
  organisation that place belongs to can see and remove it.

- **Scope of access** — an external assessor sees and acts on exactly
  the sign-offs they are named on through `passport_signoff_request`
  rows, and nothing else: not the holder's full passport, not other
  holders, no patient data, no organisation pages. `GET
/api/passport/{id}` returns 403 to them; the inbox returns only their
  requests; the sign-off page renders one sign-off and its evidence.

- **Feature gating** — once the assessor is a member of the holder's
  place, `requires_feature("passport")` resolves through it like
  anyone else's, so no sibling dependency is needed.

- **Registration verification** — the registration is self-declared at
  invite and confirmed by the assessor on acceptance.
  `sign-off.yaml` records `assessor.registration_verified: false`
  until an admin of the holder's organisation marks the assessor
  verified (by hand against the GMC register in phase 1), and the flag
  applies to sign-offs signed after that point. The PDF renders it.
  The record stays honest about what Quill checked.

- **Revocation** — an admin of the organisation that place belongs to
  can remove the membership, which takes `access_clinician_passport`
  with it since competencies are granted per place. Sign-offs they
  already made stand.

- **This depends on work in flight.** The platform-role plan removes
  every system permission but `superadmin`, and the membership plan
  makes competencies place-scoped. Both are the reason an assessor
  needs a place at all. Two questions belong to those plans rather
  than this one, and should be answered there: whether bare membership
  with no competencies exposes anything at a place, such as a staff
  list; and whether a holder inviting an assessor may create a
  membership without an administrator confirming it.

### What lives in Postgres

The core database holds coordination state and an index of existence,
not a copy of the record.

- **`passport`** — `id` (uuid), `user_id`, `created_at`, `head_commit`,
  `storage_generation`. One row per holder; the pointer to the
  repository.

- **`passport_signoff_request`** — `id`, `passport_id`, `signoff_id`,
  `competency_id`, `assessor_user_id`, `status`, `created_at`,
  `resolved_at`. This is workflow (an assessor's inbox is a query
  across many passports, which files cannot answer), not a projection
  of the record. The sign-off file is the record; this row is the
  request that led to it and is closed when the file is written.

- **`passport_assessor_invite`** — `id`, `passport_id`,
  `invited_by_user_id`, `email`, `name`, `registration_authority`,
  `registration_number`, `token_hash`, `expires_at`, `accepted_at`,
  `accepted_user_id`. Workflow for bringing an external assessor in;
  consumed once.

- **`site_common_competency`** — `site_id` or `organisation_id`,
  `competency_id`, `position`. An admin-curated shortlist for the
  picker, at site level with the organisation as fallback. Pure
  interface convenience: nothing reads it when deciding what a person
  may do or be signed off for.

- **Nothing else** — no sign-off table, no per-competency status
  table, no cached progress. A holder's passport page reads their
  repository. A programme director's cross-trainee view is a future
  item that will need a projection, and is listed under future work.

### Rendering and export

- **Markdown** — the passport is rendered on demand into a single
  `passport.md`: a front page with holder identity and registrations,
  one table row per competency giving its current level, assessor and
  date, then sections for the logbook, certificates, CPD and
  reflections, and an appendix of every sign-off in full including
  caveats and superseded records. Logbook and CPD entries sort by the
  clinical date they record, not by the filename, since the filename
  is the moment they were written. The files are canonical; the
  rendered Markdown is a view and is not stored in the repository.

- **PDF** — built with ReportLab, already a dependency in
  `backend/pyproject.toml` and already used for teaching certificates.
  Those use `pdfgen.canvas` for a fixed layout; the passport uses
  `platypus` instead, which handles flowing multi-page documents with
  paragraphs, tables and page templates. No new dependency and no new
  native libraries. Each sign-off carries its `content_hash` and the
  document footer carries the head commit hash, so a printed passport
  can be checked against the repository.

- **Bundle download** — a zip holding a plain-English `README.md`
  explaining what the bundle is and how to read it, the passport
  directory (YAML, Markdown, evidence blobs), the rendered
  `passport.md` and `passport.pdf`, `VERIFY.md` with the `sha256sum`
  commands to check the hashes offline, and a `git bundle` of the full
  history. The README is the highest-value file in the bundle and costs
  nothing. This is the portable artefact a registrar carries between
  trusts. CSV export and import of a bundle into another deployment are
  both future items.

### API surface

All routes under `/api/passport`, all requiring authentication, CSRF on
mutations, `requires_feature("passport")`, and the CBAC competencies
above. Additive only, per `.claude/rules/backend.md`.

- `POST /api/passport` — create the caller's passport.
  `access_clinician_passport`.
- `GET /api/passport/me` — the caller's passport with derived status
  per competency.
- `GET /api/passport/{id}` — a passport the caller may view: the holder,
  an assessor with an open request on it, or an admin of the holder's
  organisation.
- `POST /api/passport/{id}/competencies/{competency_id}/requests` —
  holder requests sign-off, naming an assessor, with `observed_on`,
  optional reflection and evidence uploads. Writes a `requested`
  sign-off and a request row.
- `GET /api/passport/requests/inbox` — the caller's open requests as an
  assessor. `access_clinician_passport`.
- `POST /api/passport/{id}/sign-offs/{signoff_id}/sign-off` —
  assessor signs, with level, caveats, optional assessment narrative
  and confirmation of the declaration. Refused if the assessor is the
  holder, is not named on the request, or the confirmation is
  missing or wrong. Signs the sign-off, writes the file, makes the
  commit and closes the request.
- `GET /api/passport/{id}/sign-offs/{signoff_id}/verify` —
  recomputes the hash and reports whether the record is unchanged;
  readable by anyone who may read the sign-off.
- `POST /api/passport/{id}/assessors/invite` — holder or organisation
  admin invites an external assessor. `access_clinician_passport`, rate
  limited.
- `POST /api/passport/assessors/accept` — public; consumes the invite
  token and registers or links the user.
- `POST /api/passport/assessors/{user_id}/verify-registration` and
  `POST /api/passport/assessors/{user_id}/revoke` — organisation admin.
- `POST /api/passport/{id}/sign-offs/{signoff_id}/decline` —
  assessor declines with a reason.
- `POST /api/passport/{id}/sign-offs/{signoff_id}/withdraw` —
  holder withdraws an open request.
- `POST /api/passport/{id}/certificates` — upload a certificate with
  its metadata and the competencies it relates to. `PATCH` and
  `DELETE` on `{certificate_id}` for corrections, since a certificate
  is self-declared and mistakes are ordinary.
- `POST /api/passport/{id}/logbook` — add an entry, naming the
  competency it counts towards. `PATCH` and `DELETE` on `{entry_id}`
  on the same reasoning.
- `GET /api/passport/{id}/logbook?competency=<id>` — a competency's
  entries with a count, and no target.
- `POST /api/passport/{id}/reflections` — add a reflection, with
  `PATCH` and `DELETE` on `{reflection_id}`. Holder only: nobody else
  reads or writes these, including organisation admins.
- `POST /api/passport/{id}/cpd` — add an activity, with `PATCH` and
  `DELETE` on `{entry_id}` on the same reasoning as the logbook.
- `GET /api/passport/{id}/export.md`, `export.pdf`, `export.zip`.
- `GET /api/passport/competencies` — the competency definitions with
  their levels, for populating the request form. Returns the caller's
  site shortlist first and everything else after it, both in one
  response, so the interface can suggest without restricting.
- `PUT /api/sites/{site_id}/common-competencies` — an admin curates
  the shortlist. Admin of that site's organisation only.

### Frontend

- **Routes** — `/passport` (my passport), `/passport/competency/:id`
  (history and request form), `/passport/logbook`,
  `/passport/reflections`, `/passport/cpd`, `/passport/inbox`
  (assessor), `/passport/sign-off/:signOffId`,
  `/passport/assessors/accept` (invite landing, `GuestOnly` or signed
  in) and `/passport/verify/:signOffId` (the page the PDF's QR code
  opens). Guarded with `RequireAuth`,
  `RequireFeature feature="passport"` and the CBAC hooks. External
  assessors reach the inbox and sign-off routes through the membership
  they gain on accepting an invitation, so no separate gate is needed.

- **Components in `frontend/src/components/passport/`** —
  `CompetencySummary` (current level per competency, from derived
  status),
  `CompetencyRow`, `SignOffCard` (one sign-off in full with
  status, assessor snapshot, caveats, evidence links),
  `SignOffRequestForm`, `SignOffForm` (level, caveats, narrative, the
  declaration checkbox), `AssessorDeclaration`
  (the fixed declaration text), `EvidenceUploader`,
  `PassportExportButtons`, `CertificateUploader`, `CertificateCard`,
  `LogbookEntryForm`, `LogbookTable` (entries and a count, never a
  target), `ReflectionEditor` (frontmatter fields plus the writing,
  with the anonymisation reminder), `CpdEntryForm`, `CpdTable`,
  `CompetencyPicker` (shortlist first, full search beneath,
  nothing hidden), `InviteAssessorForm`, `RegistrationBadge`
  (declared or verified) and `VerificationPanel` (the verify
  endpoint's result). Each with
  `.stories.tsx` and `.test.tsx`, built from `BaseCard`, `ButtonPair`,
  `Icon` and the design system.

- **Pages in `frontend/src/pages/passport/`** — thin compositions of
  the above with the `Stack gap="lg"` pattern and no Container.

- **The passport subtree is loaded on demand, and is the pilot for
  it** — every one of the fifty-one pages in `main.tsx` is a static
  import today, so the whole application ships as one entry chunk,
  measured at 309 kB gzipped on 10 September. The passport is the
  right place to change that first, and not because it is large.
  It is **double-gated** — `requires_feature("passport")` and
  `access_clinician_passport` — so most people who download it can
  never open it, and an external assessor reaches exactly one page of
  it. It is also unbuilt, so nothing that works today can break.

  `todo.md` already carries this as "code-split the router by area if
  the entry bundle needs to shrink", deferred on the grounds that
  roughly 70 per cent of the entry chunk is Mantine, React and React
  Router, which every route needs whatever we do. That reasoning is
  sound and unchanged: **this is not a plan to split the other fifty
  pages.** It is one feature carrying its own weight, proving the
  pattern on code with no users, and leaving admin, teaching,
  `/settings/totp` and the Markdown views exactly where they are until
  someone measures a reason to move them.

  Three things decide whether it is done correctly.

  - **Use React Router's `lazy`, and check the chunk actually
    moved.** `lazy: () => import("./pages/passport/...")` with the page
    exporting `Component`. Writing `element: import(...).then(...)`
    looks equivalent and defers nothing, because the import is fired
    during module evaluation; a stray fragment of exactly that shape
    once sat in this repository doing nothing at all. It is invisible
    in review and invisible at runtime, so the check is the build
    output — a passport chunk appears and the entry chunk shrinks — not
    the diff.

  - **`handle` stays on the route object, never inside the lazy
    module.** `isRouteSafeForReload` in `lib/swUpdateGate.ts` reads
    `handle.safeForReload` synchronously, before the destination has
    rendered and therefore before a lazy module has loaded. Move it and
    every passport route silently becomes unsafe-by-default and stops
    receiving updates — silently being the problem, since nothing
    fails, the tab simply stops updating.

  - **`vite:preloadError` must be handled first.** See below. This is a
    precondition, not a tidy-up.

- **Handling `vite:preloadError` is the precondition, and it is the
  whole app's problem rather than the passport's** — a tab holds the
  bundle it downloaded until it is reloaded, and the API-compatibility
  work established that an actively used tab can run for thirty days or
  more, because rotating refresh tokens mean it never re-logs-in. Every
  route's code is in memory today, so that tab navigates anywhere
  quite happily. Split the passport out and the same tab asks for a
  chunk hash the container stopped serving weeks ago, and the
  navigation throws.

  Two facts make this sharper than it first looks. **JavaScript never enters the
  precache manifest**: `globPatterns` in `vite.config.ts` covers logos
  and favicons only, so a lazy chunk is a live network fetch. And there is
  no service-worker offline fallback page, recorded in the offline
  plan. So the failure is not a slow page, it is a dead one, and it
  lands on the navigation rather than on the load — the user has
  already committed to going somewhere.

  The fix is small and belongs to the whole application: listen for
  `vite:preloadError` and route it through the existing update gate in
  `frontend/src/lib/swUpdateGate.ts`, which already knows how to decide
  whether reloading this route is safe and how to preserve in-progress
  work when it is not. Doing it here is not scope creep — nothing may be
  loaded on demand until it exists, so it is the first task of Phase 6
  rather than a follow-up.

- **Measure it in bytes, and write the number down** — the way
  `keepNames` was settled in `vite.config.ts`, which records 892,697
  against 930,826 bytes and concludes the 37 kB is worth paying. Record
  the entry chunk before and after, and the size of the passport chunk.
  Two cautions. Quote the **entry chunk gzipped**, since the figures
  already in the plans differ by roughly three times because some count
  the whole build; re-measure rather than citing either. And a
  configuration option that does nothing looks exactly like one that
  costs nothing, which is how the `esbuild.keepNames` mistake survived —
  so the measurement is the evidence that the split happened, not a
  footnote to it.

### Validation and safety

- **Schemas** — Pydantic models with `extra="forbid"` for
  `manifest.yaml`, `profile.yaml`, `sign-off.yaml`, certificates,
  logbook, reflections and CPD files;
  the same models validate on read, so a hand-edited or imported file
  that fails validation is rejected rather than half-parsed.

- **Definition CI gate** — a validator under `backend/app/features/`
  in the style of `features/teaching/tooling/validate.py` that checks
  the competency definitions: ids are unique across every file in the
  directory including any deprecated ones, no id contains a `/`, and
  level lists are well-formed. The uniqueness check is what makes
  splitting the directory safe, so it goes in before the split rather
  than after.

- **Guard clauses** — every route validates the passport exists, the
  caller's relationship to it, the sign-off's current status allows
  the transition, and the assessor is not the holder, before touching
  storage.

- **No PHI** — passports contain no patient data by design, and two
  places are where it would creep in. Evidence uploads, since a
  scanned procedure note or DOPS form names a patient; and
  reflections, which are written about real cases. Both carry a
  declaration that the content is anonymised, worded more firmly for
  reflections. These two are the whole surface: everything else the
  passport stores is about the holder, not a patient.

- **Audit** — the git history is the audit trail. Exports are logged
  (who, which passport, when) in the existing application log with no
  content.

- **No key material anywhere** — there are no signing keys to store,
  rotate, leak or lose, which is one of the reasons for not having
  any.

- **External assessor boundary** — every route an external assessor can
  reach resolves the passport from a request row naming them, and no
  route lists passports, users or organisations to them. Membership at
  the holder's place lets them reach the feature; it does not widen
  what they may see. The authorisation tests include an external
  assessor row in the matrix.

- **Reflections are holder-only** — not readable by an assessor, an
  organisation admin or anyone else, and excluded from any view but
  the holder's own. Written reflection can be disclosed in legal
  proceedings, and UK doctors are wary of it for good reason, so the
  narrower default is the safer one.

## Phase 0: competency content and clinical safety

- [x] Draft the first competencies, with their levels where levels are
      meaningful, into `shared/competency-definitions/oncology.yaml`.
      Sixteen entries, explicitly a proof of concept to be revised
      against the South West passports rather than a settled list.
- [x] Check the draft against the published frameworks. This happened
      **first** rather than later, because both documents turned out to
      be readable after all — the network notes earlier in this plan
      were about the UKONS and NHS England pages, not these. Drafting
      from them beat drafting from memory and correcting afterwards.
      - **RCR, _Clinical Oncology Specialty Training Curriculum_,
        August 2026** (implemented 5 August 2026), nineteen
        capabilities in practice. Its entrustment scale is words, not
        numbers — observe only, direct supervision, indirect or minimal
        supervision, unsupervised — which is the design this plan had
        already chosen, arrived at independently. It also uses a
        _different_ four-point scale for its generic capabilities
        (novice, developing, capable, expert), which is the clearest
        possible argument for declaring levels per competency rather
        than once globally.
      - **UK SACT Board, _Prescriber competencies for reviewing and
        prescribing SACT_, November 2023**, four levels: observation
        only, review and authorise administration, prescribe second
        cycle onwards, prescribe first cycle. Its paper record is a
        table of competency statements against "Supporting Statement /
        List of Evidence", "Date Achieved" and "Supervisor Signature",
        closed by a declaration — "I confirm that [name] has completed
        Level 2 competency" — which is `sign-off.yaml` and the
        assessor declaration, on paper. Its logbook is eight
        prescriptions recorded as regimen, date and supervisor
        signature: counted, never compared to a judgement of
        sufficiency.
      - Both scales are quoted verbatim rather than harmonised into one
        house scale. A sign-off should mean what the framework says it
        means, and a reader who knows the framework should need no
        lookup table.
      - Still outstanding, and the reason this list is provisional: the
        South West SACT and radiotherapy passports themselves.
- [x] Move `shared/competencies.yaml` into
      `shared/competency-definitions/`, split by kind. Landed as four
      files rather than the two first written here, one per kind of
      thing: `clinical.yaml` holds the patient-facing competencies —
      prescribing, procedures, certification, consent, imaging,
      specialty, patient records, and approving clinical letters, which
      is a judgement about a patient's record rather than about Quill.
      `clinical-admin.yaml` holds running the service —
      `access_clinic_admin` and `manage_users`. `teaching.yaml` and
      `passport.yaml` hold the gates on their own features. The loader
      globs the directory, so a file per feature costs nothing and each
      one arrives with its feature. They are different kinds of thing
      sharing
      one mechanism, and reading them side by side today makes that
      hard to see. The directory name removes the confusion with a
      passport's own `competencies.yaml`, and reading a directory now
      means splitting it later is a file move with no code change.
      Touches the loader in `backend/app/cbac/competencies.py`, which
      globs `*.yaml` and merges rather than opening one path; the
      list
      in `frontend/scripts/generate-json-from-yaml.ts`, which merges
      before emitting one JSON; the four frontend files importing the
      generated JSON; `backend/tests/test_competencies.py`; and three
      live docs pages. Edit `.github/copilot-instructions.md` rather
      than `CLAUDE.md` and re-run `/sync-copilot-config`; leave
      historical plan documents untouched.
      - **Found during the move: a CI check reads the catalogue too.**
        `.github/scripts/ci/check-competencies-not-deleted.sh` compared
        one hardcoded file across refs, and its "no catalogue on the
        base ref" guard returned success. Left alone it would have found
        no file on the branch and passed, silently retiring the check
        that no competency was deleted. It now concatenates every file
        in the directory before comparing — so moving an id between
        files is correctly not a deletion — and fails loudly when the
        base ref has a catalogue and the branch has none.
      - **The generated JSON is gitignored** (`frontend/.gitignore`
        line 15), so there is nothing to commit for the
        `yarn generate:types` step; the generator merges the directory
        into one `competencies.json` and the four importers are
        untouched. `frontend/src/generated/index.d.ts` had drifted,
        declaring `risk_level`, `category` and six other fields the YAML
        has never carried; corrected to `id`, `display_name` and
        `retired_on`.
- [x] Add the SACT and radiotherapy competencies. Landed in their own
      `shared/competency-definitions/oncology.yaml` rather than in
      `clinical.yaml`: they are clinical in kind, but they are the first
      set drafted for the passport and will be revised wholesale against
      the South West passports, which is easier when they are not
      interleaved with the general clinical set. The note about matching
      the live shape held for the entries without scales; those with one
      carry `levels`, which is what the passport needs and what the
      frameworks actually publish.
- [x] Add `access_clinician_passport` to
      `shared/competency-definitions/` under the feature-admin
      category, and to the appropriate base professions in
      `shared/base-professions.yaml`.
      - The competency lives in its own `passport.yaml` rather than
        alongside the teaching set.
      - Held by default by the fourteen professions that practise and
        accumulate assessed competencies — the four training grades,
        consultant, GP, both nursing grades, healthcare assistant, both
        pharmacy grades, physiotherapist, occupational therapist and
        paramedic. Not by patients, back-office staff or the teaching
        roles.
      - `requires_clinical_services` could not decide this: it is true
        for receptionists and patients as well, so the split is a
        judgement and is pinned by a test naming both halves. The
        healthcare assistant entry is the clearest case for including
        the unregistered grades — its `perform_venepuncture` already
        carries the comment "After competency training", which is
        exactly what a passport records.
- [x] Add the optional passport fields — `levels` and
      `expires_after_months` — to the competencies that need them.
      Both are optional, so existing entries are untouched. Note this
      needed `CompetencyEntry` in `backend/app/cbac/competencies.py`
      widening as well as the YAML: it sets `extra="forbid"`, so a new
      field is refused at load until the model knows about it. Levels
      are validated there too — ids unique within a competency, and no
      empty list, since omitting levels and declaring none of them must
      not be two different things. CBAC ignores both fields: holding a
      competency stays a yes or no question.
- [x] Run `yarn generate:types` in `frontend/`. Nothing to commit:
      `frontend/.gitignore` ignores `src/generated/*.json`, so the JSON
      is a build artefact rebuilt by the prebuild hook. Only the
      hand-written `index.d.ts` beside it is tracked, and it now
      declares `levels` and `expires_after_months`.
- [x] Know what can go wrong, and where each is answered. Recorded
      here rather than as separate entries elsewhere, so the answer sits
      beside the design it constrains:
      - **The wrong assessor signs.** Not prevented, deliberately —
        see the sign-off decision. The record names who signed, their
        role and their registration, so a reader can judge it, exactly
        as on paper.
      - **A holder signs off their own competency.** Refused at the
        API, the one hard rule, tested in Phase 3.
      - **Evidence or a reflection carries patient data.** Declarations
        on both upload paths; nothing else the passport stores is about
        a patient.
      - **An exported PDF diverges from the repository.** The PDF
        prints each sign-off's `content_hash` and the head commit, and
        `VERIFY.md` lets anyone check it offline with `sha256sum`.
      - **A competency definition changes under sign-offs already
        made.** Every sign-off stores the human label beside the id and
        the level's wording at signing, so it stays readable whatever
        the definition later says.
      - **An assessor declares a registration they do not hold.**
        Recorded as declared, never as verified, with
        `registration_verified` false until an admin checks the
        register by hand. The record says what Quill checked.
      - **A sign-off is made from an unattended logged-in session.**
        Not prevented by re-authentication, deliberately — the
        declaration is what makes it an act, and a code per sign-off
        would land friction where adoption is most fragile.

## Phase 1: core store and record model

Fifteen tasks, delivered as **one pull request of five reviewed
commits** rather than five pull requests: the record model, the store
and the service only make sense together, and a half-built passport
merged into `main` would be a feature nobody can use and nobody can
delete. The commits are the review unit; the pull request is the
feature.

The order is deliberate. Each unit is useful to review on its own, and
each depends only on the ones above it, so a change of mind at unit
three does not invalidate unit one.

- **Unit 1 — the pure core.** `paths.py`, `ids.py`, `schemas.py`,
  `definitions.py`. No I/O, no git, no database, so it is exhaustively
  testable and fast. This is where the record model is settled, which
  makes it the unit worth reading most carefully: everything below
  encodes whatever it decides.
- **Unit 2 — the store.** The `pygit2` dependency, `PassportStore` and
  its local backend, `commits.py`, and the refusal of non-fast-forward
  updates. The first unit that touches a disk.
- **Unit 3 — hashing and verification.** `content_hash` against the
  contributing-field list, the canonical form, the verify function and
  `VERIFY.md`. Separate from the store because a fingerprint that
  disagrees with itself across two implementations is the one bug that
  would quietly devalue every record.
- **Unit 4 — the self-declared records.** `certificates.py`,
  `logbook.py`, `reflections.py`, `cpd.py` and `index.py`. All four are
  editable by their holder, unlike a sign-off, and the index is derived
  from them.
- **Unit 5 — service and database.** `service.py` with the sign-off
  lifecycle, the `passport` and `passport_signoff_request` models, the
  migration, `site_common_competency`, and the per-passport advisory
  lock. Last because it is the only unit that needs Postgres, and
  because it composes everything above.

- [x] Create `backend/app/features/passport/` with `paths.py` (typed
      relative paths, no I/O, after VPR's `crates/core/src/paths/`),
      `ids.py` (timestamp id generator with monotonic rule),
      `schemas.py` (Pydantic models for `manifest.yaml`,
      `profile.yaml`, `sign-off.yaml`, certificates, logbook,
      reflections and CPD), and
      `definitions.py` (reads the passport fields from
      `shared/competency-definitions/`).
      - Landed in `fb80c6d2`, "add the record model and the on-disk
        layout", which is this unit under another name. The box went
        unticked at the time; noted here rather than silently corrected,
        because a plan that quietly gains ticks is worth less than one
        that says when it was wrong.
- [x] Implement `store.py` with the `PassportStore` interface and the
      local filesystem backend, including `init_and_commit` with
      whole-directory cleanup on failure and `write_and_commit_files`
      with rollback.
      - **Found during the build: libgit2 points HEAD at
        `refs/heads/master`** whatever the host's `init.defaultBranch`
        says, while this store commits to `refs/heads/main`. Without
        `set_head` on init the commits land on a branch HEAD does not
        follow, so a passport holding every record reads as empty —
        a fault that looks exactly like data loss and is not. Pinned by
        a test.
      - The cleanup on a failed *creation* only removes a directory this
        store created. One that already existed is left alone: it may
        hold something else, and removing it would destroy data the
        store never owned.
- [x] Implement `commits.py`: the commit message renderer with the
      closed action vocabulary, reserved trailer keys and single-line
      value validation. Values carrying a newline are **refused rather
      than stripped**: sanitising would change what the record says
      about a named person, silently, and a caller passing one has a bug
      worth surfacing. Without it a value could forge a second trailer.
- [x] Implement create, amend and remove for self-declared evidence,
      each as one validated write and one commit. All four are editable
      by the holder, unlike a sign-off. Reflections are holder-only, not
      readable by organisation admins.
      - Landed as **one `records.py`** rather than four modules. The
        four kinds differ only in where they are filed and what they
        validate against; splitting them would have meant four copies of
        the same write-and-rebuild path, which is exactly where two of
        them would eventually drift apart.
      - Added `serialise.py`, which nothing in the plan called for
        because nothing in the repository wrote YAML before. It is
        deliberately the opposite of the hashing module's canonical
        form: keys keep the order the model declares, lists indent,
        multi-line text becomes a readable block, and unset optionals
        are dropped. One form is for people, the other for
        fingerprinting.
- [x] Implement `index.py`: regenerate `competencies.yaml` on every
      write from the sign-off folders, the logbook and the
      certificates, since the index carries a `logbook_entries` count
      and the certificates relating to each competency. Includes the
      naming rules — date and competency slug for sign-off folders
      with `-2` on a same-day clash, write-time filenames for logbook
      and CPD entries with a bump to the next second — and a self-heal
      that rebuilds stale references.
      - **The index is written in the same commit as the record it
        summarises**, which needed a read-only overlay over the store so
        the rebuild sees the passport as it will be rather than as it
        is. Committing the records first and the index second would
        leave a commit in history whose summary disagrees with its own
        records — the precise state the "directories win" rule exists to
        prevent. Pinned by a test that counts commits.
      - The self-heal is not a repair step but a consequence: nothing
        writes an index entry by hand, so there is no code path that
        could produce a disagreement and leave it. A test tampers with
        the index directly and confirms the next ordinary write
        overwrites it.
- [x] Implement content hashing against the contributing-field list,
      with the canonical form defined in the schema rather than in the
      hashing function. Tests: editing a comment or a display label
      leaves the hash alone, changing the level or the assessor
      changes it, and re-serialising an unchanged record reproduces
      the same value.
      - `CONTRIBUTING` and `NON_CONTRIBUTING` sit together in
        `hashing.py`, the second carrying a reason per field. A reader's
        first question is always "what about X", and answering it
        explicitly is cheaper than inferring it from an absence. A test
        asserts the two lists never overlap.
      - **JSON rather than YAML for the canonical form.** YAML has
        several ways to write one value — quoted or bare, flow or block
        — and a canonical form must have exactly one. JSON with sorted
        keys and no inserted whitespace has one rendering per value,
        which is the whole property being bought.
      - A datetime normalises to UTC before formatting, so the same
        instant written in two timezones fingerprints identically.
        Attachment and registration lists sort, because the order two
        files were uploaded in says nothing about the decision.
- [x] Require confirmation of the declaration on the sign-off service
      call, with tests proving an unconfirmed request is refused and
      writes nothing. Both this and the self-sign-off refusal are guard
      clauses at the very top of `sign_off`, before a single byte is
      written, and both are tested for the thing that would be worst if
      they failed: not that they refuse, but that HEAD does not move and
      the record stays `requested`.
- [x] Implement the verify function and the `VERIFY.md` template for
      bundles, using `sha256sum` and no keys.
      - **A gap worth naming: `sha256sum` cannot check a
        `content_hash`.** It hashes whole files, while a `content_hash`
        covers selected fields — which is exactly what makes tidying a
        comment safe. So `VERIFY.md` offers what genuinely works offline
        with no software: every evidence blob is named by the hash of
        its own bytes and so is checkable with `sha256sum`, and `git
        fsck` and `git log` check the history. For a sign-off's own
        fingerprint it points the reader at the verify endpoint rather
        than printing a command that would not reproduce it.
      - The template says plainly what a match does **not** prove: not a
        professional registration, and nothing at all to a reader who
        distrusts Quill, since the same system computed the hash and
        stored it.
- [x] Reject non-fast-forward updates in the store, with a test
      proving a rewrite is refused. Two shapes are refused: a commit with
      no parent onto a repository that has history, which would discard
      every earlier commit, and one whose parents do not include the
      current HEAD.
- [x] Implement `blobs.py`: content-addressed evidence store with
      refusal to overwrite an existing hash. Writes land on a staging
      name and are moved into place, so a failure part-way through
      cannot leave a truncated file under a name that asserts its own
      hash — a reader finding a short file at a valid hash would have no
      way to tell it was incomplete. A test proves a filename carrying
      what looks like a patient identifier never reaches a path.
- [x] Implement `service.py`: create passport, request sign-off, sign
      off, decline, withdraw, supersede, each as one validated write
      and one commit, with the derived per-competency status function.
      - **`kind` is derived, not asked for.** A caller choosing it could
        imply an earlier assessor was mistaken, or hide a progression,
        so it is computed from the level's position on the scale
        relative to the last signed record. The one kind never derived
        is `correction`: saying an earlier record was wrong is a
        deliberate claim, made through `supersede_sign_off`.
      - `status_for` reports what the latest record says and draws no
        conclusion. An expired sign-off still reports `signed_off`,
        because what a lapsed sign-off implies has not been decided.
- [x] Add the `site_common_competency` model, with a constraint that
      exactly one of site and organisation is set. The **admin endpoint
      waits for Phase 3**, where the rest of the API lands; the model is
      here because the migration is. A test asserts the table carries no
      column that could be mistaken for permission — no `required`, no
      `mandatory`, no `enabled` — which is the structural half of
      "it suggests and never gates".
- [x] Add the `passport` and `passport_signoff_request` models and
      create the migration.
      - **In `features/passport/models.py`, not `app/models.py`**,
        following `features/teaching/models.py`: feature tables live in
        the feature package and import only `Base`. Registered for
        autogenerate in `alembic/env.py` beside teaching's.
      - **`just migrate` could not be used**, and this is worth knowing
        for anyone working in a second worktree: the recipe runs
        `alembic` inside the `quill_backend` container, which is
        bind-mounted to whichever worktree started the dev stack. From
        another worktree it autogenerates against code that does not
        include the change. The migration was instead generated by
        running the same three `alembic` commands against a throwaway
        Postgres mounted on this worktree, then checked with
        `check_migrations.py --all` and `alembic check`.
      - Purely additive: three new tables, a real `downgrade()`, no
        destructive operation and so no approval gate.
- [x] Implement the per-passport Postgres advisory lock in
      `locking.py`; the HEAD assertion was already in the store from
      unit 2. An advisory lock rather than a row lock because there is
      no row to lock — the thing being protected is a directory. Keyed
      on a hash of the passport id, so two holders writing at once never
      block each other, and namespaced so a passport lock cannot collide
      with an advisory lock taken elsewhere. Postgres releases it when
      the connection goes, so a crashed worker leaves nothing stuck.
      The lock itself needs Postgres and the unit suite runs on SQLite,
      so the key derivation is tested and the lock is exercised where a
      real database is available.
- [x] Unit tests with real temporary directories: every validation
      rule exhaustively where it lives, wiring tests proving no file or
      commit is written when validation fails, fault injection for the
      cleanup-failure path, monotonic id behaviour under a backwards
      clock, and concurrent-writer conflict. Run with
      `just ub -k passport`.
      - The concurrency test asserts `ConcurrentWriteError` from the
        store rather than a 409, since there is no router until Phase 3.
        Mapping the one to the other belongs with the routes.

## Phase 2: storage on Cloud Storage

- [x] Implement the GCS backend of `PassportStore`: bundle download,
      unbundle to a temporary directory, commit, re-bundle, upload with
      `if-generation-match`; blobs uploaded beside the bundle.
      - **It delegates the commit to `LocalPassportStore` rather than
        reimplementing it.** One write one commit, rollback, the rewrite
        refusal and the HEAD assertion are then written once and
        inherited, so the two backends cannot drift on the rules that
        matter. What the bucket adds is the part it genuinely does
        differently: compare-and-swap on the object generation, and
        `if_generation_match=0` so creation refuses to clobber an
        existing passport.
      - **Bundling shells out to `git`, against the plan's own "no
        shelling out" rule and `store.py`'s "no binary in the image".**
        libgit2 has no bundle support — pygit2 1.20 exposes
        `PackBuilder` and nothing that reads or writes the bundle
        format — so there is no in-process route to the one format
        holding a full history as a single object. The binary is already
        in the backend image for the teaching version-lock tests, and
        the calls are fixed argument lists with no shell. Writing a
        bundle by hand to avoid a subprocess would mean implementing a
        git format, which is the worse trade.
      - **The bucket is a constructor argument, not a settings read.**
        `test_features_import_boundary.py` pins that every module under
        `app.features.passport` imports without `app.config`, so a
        passport on disk stays readable by tooling with no application
        around it. The composition point lives outside the package, in
        `app/passport_storage.py`.
- [x] Add `PASSPORT_GCS_BUCKET` to `backend/app/config.py`, with
      `PASSPORT_LOCAL_ROOT` for development, and the composition point
      in `app/passport_storage.py` that chooses between them.
      - **`PASSPORT_STORAGE_BACKEND` was deliberately not added**, which
        is a departure from what this task originally said. The teaching
        settings it told us to follow turned out to carry the trap:
        `TEACHING_STORAGE_BACKEND` is set in `compose.dev.yml`,
        `compose.ci.yml` and `infra/main.tf` and read by nothing, since
        `get_storage_backend()` branches on whether the bucket is set.
        So a deployment can set it to `local` and still write to the
        bucket. A switch that looks like one and is not is worse than no
        switch, and it is the same species as the `esbuild.keepNames`
        mistake Phase 6 warns about: a configuration option that does
        nothing looks exactly like one that costs nothing. The bucket
        name alone decides, and a test asserts no second setting exists.
      - The stores are cached and the blob store always matches the
        passport store, because a record names evidence by hash — a
        passport in a bucket whose blobs are on a disk is a set of
        broken references.
- [x] Add the bucket and the Cloud Run service account IAM binding to
      Terraform, following the teaching bucket and the IAM note in
      `docs/docs/infrastructure/gcp.md`. Enable object versioning on
      the bucket: it is a one-line setting and it is what preserves a
      replaced bundle's predecessors, which is the backstop for a
      history rewrite.
      - **Its own `infra/modules/passport-storage/` rather than a second
        instance of `cloud-storage`**, which this task first pointed at.
        That module carries a lifecycle rule deleting at 365 days with
        no `with_state`, so it matches live objects as well as noncurrent
        ones. On a versioned bucket a Delete against a live object
        archives it rather than erasing it — the bytes survive as a
        noncurrent version — but the live object is gone, so the
        application reads the passport as absent. Recoverable by hand,
        and still an outage on a professional record. Teaching images
        tolerate it because CI re-uploads them; a passport has no such
        source. The new module has no lifecycle rule at all, which is
        the point of a separate module rather than a flag: nothing
        expires, and no setting could make it.
      - `force_destroy = false` in every environment, unlike the shared
        module which allows it outside prod. A staging passport is still
        somebody's record, so `terraform destroy` should refuse.
      - `public_access_prevention = "enforced"`, so an `allUsers` binding
        cannot be added later by hand.
      - **Not gated on an environment.** An empty bucket costs nothing
        until written to, so every environment has somewhere to put a
        passport rather than needing infrastructure work the day the
        feature is enabled. Whether the feature is on stays an
        organisation-level decision in the application.
      - `terraform validate` passes on the module standalone. The root
        configuration could not be validated locally — `versions.tf`
        requires Terraform >= 1.15.2 and this machine has 1.15.0 — but
        `.github/workflows/terraform.yml` runs `terraform plan` on pull
        requests, which is where the root check actually happens.
      - **Found alongside: the teaching bucket has the same rule live
        today.** Its oldest objects are from May 2026, so nothing has
        reached 365 days yet; the first would be around May 2027, and
        only for files CI has not re-uploaded since, because an upload
        resets the age. Adding `with_state = "ARCHIVED"` would make the
        rule do what its comment already claims. Left alone here: it
        changes teaching's production bucket and deserves its own review
        rather than riding along with passport work.
- [x] Tests against a fake GCS client covering generation mismatch,
      partial upload failure and re-open after failure.
      - **The fake implements the generation rule for real** rather than
        being a mock: every upload bumps the generation, and a mismatched
        `if_generation_match` raises the 412 the library raises. A
        `MagicMock` would accept any precondition and report success,
        which is precisely the bug these tests exist to catch.
      - Reaching the mismatch needed the fake to move the object
        _between_ a write's download and its upload. Restoring older
        bytes under the current generation does not test it: the store
        re-downloads inside the write, so it would read the newer
        generation and its precondition would match.
      - The repositories underneath are real git repositories bundled
        with real `git`, including a test proving the full history
        survives the round trip rather than just the tip — a bundle
        carrying only the latest state would pass every other test here
        and quietly destroy the audit trail.

## Phase 3: API

**Not every route listed under "API surface" belongs to this phase.**
Three need Phase 4 (`export.md`, `export.pdf`, `export.zip` — there is no
`render.py` or `pdf.py` yet) and four need Phase 5 (the external-assessor
flow: invite, accept, verify-registration, revoke — there is no invite
model, no `passport_assessor` token type and no `external` capacity).
Writing them now would mean stubs returning 501 and an OpenAPI spec
promising what does not work, so they arrive with the code behind them.

That leaves about twelve routes, delivered as three reviewed commits:
the schemas and the feature key, then the sign-off lifecycle, then the
self-declared records. `PUT /api/sites/{site_id}/common-competencies`
belongs to this phase — the model landed in Phase 1 and the endpoint was
explicitly deferred here.

- [x] Add the `/api/passport` router under
      `backend/app/features/passport/router.py` with the routes listed
      above, `requires_feature("passport")`, CBAC dependencies, CSRF on
      mutations and rate limiting on uploads and exports.
      - **Authorisation is three guard clauses**, applied before storage
        is touched. `_require_holder` for acts nobody else may perform;
        `_require_reader` for the holder or somebody named on a request
        row, which is how an external assessor's whole reach resolves in
        Phase 5; and `_checked_id`, because a passport id decides a
        filesystem path and must never reach the store unvalidated.
      - **An unauthorised read answers 404, not 403.** Whether a
        particular passport exists is not something a stranger is
        entitled to learn, and a 403 confirms it.
      - **Organisation admins are deliberately not admitted yet**, which
        narrows what the API surface above describes. How "admin of the
        holder's organisation" is evaluated is being settled by
        `2026-09-06-org-scoped-access-findings.md`; inventing a scope
        here that that plan then changes would be worse than shipping
        the narrower rule and widening it once it lands.
      - **Reflections use `_require_holder` where every other read uses
        `_require_reader`.** An assessor named on a request may read the
        sign-off they were asked about and still may not read a
        reflection. It is the one record type where a reader with
        legitimate access to the rest is refused, and a test asserts it.
      - **Rate limiting was not added.** The plan asks for it on uploads
        and exports, and neither exists yet — evidence upload and the
        three export routes both belong to later units. Adding limits to
        routes that cannot be called would be untestable decoration.
      - **Naming an attachment returns 501 rather than being ignored.**
        A caller believing evidence was attached when it was not is
        worse than an error, so the records refuse a hash until upload
        is built.
      - Found during the build: `service.py` kept its timestamp
        generator private, and certificates need ids too. Exposed as
        `service.next_id()` rather than instantiating a second
        generator, since the monotonic guarantee holds per instance —
        two would each be monotonic alone while issuing ids that
        interleave.
- [x] Register `passport` as an organisation feature key alongside
      `teaching`.
      - **Nothing to write: there is no registry.** `feature_key` is an
        unconstrained `String(50)` on `OrganisationFeature`; the toggle
        endpoint at `main.py:4332` takes any string as a path parameter;
        `RequireFeature` on the frontend takes a plain string. `teaching`
        is a convention held together by literals at its call sites, and
        nothing anywhere enumerates valid keys.
      - So `passport` becomes real when the router declares
        `requires_feature("passport")` and an admin enables it on an
        organisation through the existing endpoint. A constants module
        was considered and rejected: it would be the only such list in
        the codebase, and inventing a shared mechanism nobody asked for
        is a worse outcome than a documented convention.
- [x] Add Pydantic request and response schemas under
      `backend/app/schemas/passport.py` with `extra="forbid"`.
      - **Deliberately a second set, not the record models reused.**
        `app/features/passport/schemas.py` is the storage contract,
        validated on read as well as write because a passport is a
        portable directory somebody may have hand-edited. These are the
        API contract, held to the additive-only rule in
        `.claude/rules/backend.md`. Returning the record models directly
        would make every on-disk format change a breaking API change,
        and the storage layer could then never be refactored without a
        release cycle.
      - **The enums are imported from the record model rather than
        restated**, and a test asserts each field's annotation accepts
        exactly the record model's values. A second copy would drift:
        a CPD activity type added on disk and forgotten here would be
        storable but not submittable, or the reverse.
      - **A word-list test pins that nothing on the wire judges
        sufficiency.** Any response field gaining a name containing
        `target`, `progress`, `complete`, `ready` or similar fails it.
        The logbook returns `count` and stops, and the shortlist field
        is `commonly_used_here` rather than `required` — the wording
        matters as much as the behaviour, since a list presented as the
        set that matters quietly becomes a syllabus.
      - **Two confirmations are required rather than defaulted**:
        `declaration_confirmed` on signing, and `anonymised_confirmed`
        on a reflection. Both omitted is a validation error, not a
        false. Defaulting the first would make signing a click; the
        second guards one of only two places patient data could enter a
        passport.
      - Notes from the build: mypy's strict mode forbids implicit
        re-export, so a test cannot reach an imported enum through the
        API module; and it rejects `is` comparisons against `Literal`
        forms, so the vocabulary tests compare `get_args` on both sides
        instead. Both are mypy facts worth knowing before writing
        similar tests elsewhere.
- [ ] Add API tests: each route's authorisation matrix (holder,
      assessor, other user, admin), every state transition, self-sign
      refusal, and that the api-compatibility snapshot is additive.
- [ ] Update `docs/docs/code/fastapi/` and the Swagger index for the new
      module.

## Phase 4: rendering and export

- [ ] Implement `render.py`: passport files to `passport.md`, with the
      front page, a competency table, sections for logbook,
      certificates, CPD and reflections, and the full sign-off
      appendix including superseded records. Logbook and CPD sort by
      the clinical date inside the entry, not by filename.
- [ ] Implement `pdf.py` with ReportLab `platypus`: a document
      template, the competency table, the sign-off appendix,
      `content_hash` per sign-off and the head commit in the footer.
      Follow `features/teaching/certificate.py` in parsing style
      config defensively, so a malformed value degrades to a default
      rather than failing the download.
- [ ] Implement the zip bundle export including a `git bundle` of the
      repository.
- [ ] Tests: rendered Markdown snapshot per fixture passport, PDF
      generation succeeds and contains the hashes, export logging
      records no content.

## Phase 5: external assessors

- [ ] Add `external` and `patient` to `MEMBER_CAPACITIES` in
      `backend/app/models.py:671`, updating the assertion in
      `backend/tests/test_organisation_member_capacity.py` that pins
      the tuple. No migration: capacity is validated in Python, not by
      a database constraint. `patient` is added at the same time
      because the membership plan already anticipates it; what it
      means in business logic is settled there, not here.
- [ ] Extend `create_invite_token` and `decode_invite_token` in
      `backend/app/security.py` to accept the `passport_assessor` user
      type, with tests for expiry and single use.
- [ ] Add the `passport_assessor_invite` model and migration.
- [ ] Add the invite endpoint and an email template alongside
      `features/teaching/email_templates.py`; rate limit invites per
      holder per day.
- [ ] Add the accept endpoint: register or link the user, store
      registrations, derive the place from the holder's memberships
      taking the narrowest they hold, create the membership there with
      capacity `external`, grant `access_clinician_passport` at that
      place, and consume the invite. Tests: a holder sited under an
      organisation yields a site membership; a holder at organisation
      level only yields an organisation membership; and an assessor
      who already holds `staff` elsewhere keeps it, gaining the
      `external` membership alongside rather than in place of it.
- [ ] Confirm `requires_feature("passport")` resolves through the
      assessor's new membership, so no sibling gate is needed.
- [ ] Add the verify-registration and revoke endpoints for organisation
      admins.
- [ ] Tests: an external assessor cannot read a passport, another
      assessor's requests, users or organisations; a consumed or
      expired token is refused; and revoking an assessor's access
      leaves the sign-offs they already made intact.

## Phase 6: frontend

- [ ] **First, and before anything is loaded on demand: handle
      `vite:preloadError`.** Listen for it and route it through the
      update gate in `frontend/src/lib/swUpdateGate.ts`, so a tab
      running an old bundle that asks for a chunk the container no
      longer serves reloads where that is safe, and preserves
      in-progress work where it is not. Whole-app work rather than
      passport work, and the reason it sits here is that nothing may be
      split until it exists. Test it by requesting a chunk name that
      was never built and asserting the gate is consulted, rather than
      by deploying twice.
- [ ] Add `frontend/src/lib/passport/` API client functions using
      `api.ts` and types generated from the backend schemas.
- [ ] Build the components listed above in
      `frontend/src/components/passport/` with stories and tests; present
      any genuinely new component for review before implementing, per
      the component reuse hierarchy.
- [ ] Build the pages and register routes in `frontend/src/main.tsx`
      with `RequireAuth`, `RequireFeature feature="passport"` and CBAC
      hooks. Load the subtree on demand with React Router's
      `lazy: () => import(...)`, each page exporting `Component`, and
      keep `handle: { safeForReload: ... }` on the route object rather
      than in the lazy module — the gate reads it before the module
      loads. Never `element: import(...).then(...)`, which defers
      nothing.
- [ ] Prove the split in the build output rather than in the diff: a
      passport chunk exists, `index.html` does not reference it, and the
      entry chunk is smaller. Record the entry chunk gzipped before and
      after, and the passport chunk's size, in this plan and in the
      `vite.config.ts` comment beside `keepNames` if the shape matches.
      Baseline on 10 September, before any passport code: entry chunk
      1,106 kB raw, 309 kB gzipped, across 51 statically imported
      pages.
- [ ] Add the passport entry to navigation for users holding
      `access_clinician_passport`.
- [ ] Frontend tests with `just uf src/components/passport` and
      `just uf src/pages/passport`; Storybook tests with `just sbt`.

## Phase 7: hardening and launch

- [ ] End-to-end test: holder requests, assessor signs, holder exports
      PDF, hash on PDF matches repository.
- [ ] Security review of upload handling (type sniffing, size limits,
      path containment, symlink refusal) and of the authorisation
      matrix, including external assessors and the reflections
      holder-only rule.
- [ ] Enable the `passport` feature for the first South West
      organisation and onboard a small assessor group.
- [ ] Document the module under `docs/docs/backend/passport/index.md`
      and add a concepts page `docs/docs/concepts/clinician-passport.md`
      explaining the CBAC relationship.

## Future items, deliberately deferred

These are recorded now so the phase 1 design does not accidentally
close them off, and so nobody builds them before there is a need.

- **Projections and caches** — when a programme director needs "all
  registrars in the region signed off for a competency", or a holder's
  page is
  slow because reading and parsing a repository per request is
  measurable, add a projection layer with VPR's invariants: rows are
  non-authoritative, rebuildable from the repositories on demand, carry
  the commit hash they were built from, and have a documented lag. Do
  not build it before a query needs it.

- **Cryptographic signing, if a key ever sits outside Quill** — keys
  held by the assessor on a hardware token or an NHS smartcard, or an
  external trust anchor such as a college or deanery certificate
  authority. Either makes a signature mean something Quill cannot
  fake, which is the only thing that would make it worth the key
  management, the revocation and the offline verification list. The
  record format does not change: a signature would cover the same
  canonical fields the `content_hash` already covers.

- **Register lookup** — checking a declared registration against the
  GMC, NMC or HCPC register through their APIs, replacing the by-hand
  verification an organisation admin does in phase 1. This is the same
  item the CBAC documentation already lists.

- **Verifier role** — a third party who confirms an assessor was
  entitled to sign, as in the UKONS model. Model as a second
  sign-off kind referencing the first.

- **Automatic CBAC grant** — a signed-off passport competency raising a
  request to add the matching id to `additional_competencies`, with
  administrator approval. Deferred because it couples an educational
  record to access control: a sign-off would stop being a record of
  what someone was assessed as able to do and start deciding what they
  may do in the software. That is worth doing eventually and is not a
  thing to arrive by accident.

- **Import of a passport bundle** — accepting a zip or git bundle from
  another deployment, validating every file against the schemas,
  refusing symlinks and path traversal, showing a dry-run preview, and
  recording the import as a commit with provenance. VPR's Epic 13 lists
  the pieces.

- **Reassessment reminders** — computing due dates from
  `expires_after_months` and the latest sign-off, surfaced in the UI
  and by email. Computed on read from the files, never stored as a
  flag, after VPR's refusal to record what it cannot verify.

- **Acting on expiry** — reminders, a lapsed status, and a rule for
  what a lapsed sign-off implies. Phase 1 records `expires_on` and
  does nothing with it, because whether someone drops back to a lower
  level or to nothing at all is a clinical decision rather than a
  technical one.

- **Registration lapse cascading to grants** —
  `2026-09-06-org-scoped-access-findings.md` defers this here, along
  with ceiling expiry, on the grounds that only a record of how a
  competency was obtained can know it has lapsed. This plan records
  how but never writes to CBAC, so the cascade has no route yet. It
  arrives with automatic CBAC granting above, not before, and neither
  plan should assume the other has already done it.

- **Deriving the shortlist from use** — rather than an admin curating
  it, compute what is commonly signed off at a site and offer that.
  Self-maintaining and a truer reflection of local practice, but it
  needs data before it works, so an explicit list comes first.

- **Serving competencies from the API rather than the bundle** — the
  generated `competencies.json` is imported directly into React, so
  every competency ever defined ships to every browser. That will bite
  well before the YAML file becomes unwieldy, and splitting the file
  does not fix it. The fix is an endpoint and a dropped build-time
  import.

- **One file per competency** — Doorstop's model, if the directory ever
  grows past what category files can hold comfortably. Zero merge
  conflicts by construction and trivially greppable, at the cost of
  hundreds of files.

- **Machine-readable export, when something wants to read it** — no
  external system asks for one today, so building it now would shape
  the record around a consumer that does not exist. When one appears,
  the research points three ways: Open Badges 3.0 for a sign-off, which
  is itself a W3C verifiable credential and already carries a
  competency type, an achieved level against a named scale, an expiry
  and Markdown evidence; FHIR UK Core `Practitioner.qualification` for
  the practitioner view, carrying a coded qualification, validity
  period and issuing organisation; and plain CSV for the Electronic
  Staff Record and for anyone opening it in a spreadsheet. Storage
  stays YAML regardless, because the person whose record it is has to
  be able to read it.

- **Redaction retention** — VPR's relocation-with-tombstone model for
  the rare case a sign-off must be removed from routine view.
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

- **One repository per holder, not per organisation** — the holder is
  the atomic unit that moves between trusts, exactly as the patient is
  in VPR. Someone working across SACT and radiotherapy has one
  repository holding both.

- **Split by kind now, by size later** — clinical competencies and
  feature-admin competencies are different things sharing one
  mechanism: one describes what a person may do to a patient, the
  other what they may do to Quill. Separating those two is worth doing
  immediately, because reading them interleaved makes the distinction
  hard to see and invites the wrong risk level on the wrong entry.
  Splitting _further_ — by prescribing, procedures and so on — is a
  size problem and remains speculative, so it waits. The loader globs
  a directory either way, so later splits are file moves with no code
  change, and the nine category headers already in the file are the
  seam when the time comes. Recategorising then is cosmetic: the id
  inside is what everything references.

- **One competency registry, not two** — the passport adds optional
  fields to `shared/competency-definitions/` rather than
  introducing a parallel framework registry. One identifier for
  "prescribe SACT cycle 1" everywhere, nothing to drift, and no second
  schema or validator to maintain. What a passport contains is
  whatever its holder has evidence for; which competencies constitute
  a given regional passport is local policy and is deliberately not
  encoded centrally. The passport still does not write to CBAC,
  because granting access from an educational record is a clinical
  safety decision that has not been made.

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

- **Hashes and a declaration, not cryptographic signatures** —
  any key would be held and used by Quill's own server, so a signature
  would assert exactly what the database already asserts, and would
  defend against nobody: application access defeats it, and storage
  access is already caught by the hashes. What earns its place is a
  `content_hash` over the canonical significant fields, git's own
  object hashes, and a declaration the assessor confirms at the moment
  of signing — which is what a wet signature has always been, someone
  reading a statement and putting their name to it. Guy's and St Thomas' passed three external ISO
  13485 audits on a pull request approval, which is a useful measure of
  how much cryptography an auditor actually wants. Keys become
  worthwhile when somebody other than Quill holds one; until then they
  are a certificate authority, a key-encryption key, rotation,
  revocation and a phase of work in exchange for reassurance rather
  than assurance.

- **External assessors get a real membership at a real place, with a
  new capacity** — not an invented assessors organisation, and not a
  self-selected one. The consultant was genuinely there, so the
  membership states something true. The place is derived from the
  holder's own memberships rather than chosen, taking the narrowest
  one they hold, so nobody has to pick and nothing is asserted that
  the holder's record does not already say.
  `external` has to be a new capacity rather than reusing `staff`,
  because `staff` carries a live behavioural check that would let a
  visiting assessor self-join conversations. Their sign-off access is
  still resolved from the request rows that name them.

- **Registration is declared, and the record says so** — Quill cannot
  check the GMC register in phase 1, so it records
  `registration_verified` honestly and lets an organisation admin flip
  it after checking by hand. Pretending otherwise on a printed
  passport would be the false certainty VPR warns against.

- **pygit2 rather than shelling out** — in-process libgit2 gives signed
  commits, typed errors and no dependency on a `git` binary or a
  terminal, and it is the engine VPR already validated.

- **A two-level record: a derived index plus immutable sign-offs** —
  because the question people actually ask is "is this person signed
  off", and only an auditor or a panel needs to know by whom and on
  what evidence. The index serves the common case and is regenerated,
  never authored; the sign-off files are the record and never change
  once signed. That also keeps each hash over a whole small file with
  a stable value, rather than over a fragment of a growing one.

- **Flat slugs, hierarchy as metadata** — every standard that has faced
  this question answered it the same way, and ESCO reversed the
  opposite decision at EU scale. It costs nothing: hierarchical
  directories still work, because references are to ids inside files.

- **Human folder names, bare references** — `competencies.yaml` names a
  sign-off by its folder alone, with no path and no repeated id, both
  because the noise is real across fifty competencies and because a
  bare name survives a change of layout that a hardcoded path would
  not. The index is regenerated anyway, so a stale reference heals
  itself.

- **Folder names carry the observed date, not the signed date** —
  a consultant may take days or weeks to sign off work they watched,
  so the two genuinely differ. A registrar looking for something thinks
  of when they did it, not when the paperwork caught up, and the
  consultant signs a file containing the observed date, so it is not an
  unverified claim.

- **Git is storage, not the audit trail** — force push rewrites history
  and git cannot say who did it. Claiming git as the audit trail is
  where projects of this shape lose credibility, so the plan states the
  limit and adds the append-only digest log that actually closes it.

- **Sit on existing standards for vocabulary and interchange, not for
  storage** — CASE for the shape of a competency definition, Open
  Badges 3.0 for export,
  SNOMED and OPCS-4 as mappings, UK SACT Board for content. That makes
  git, YAML and Markdown a storage substrate with well-chosen mappings
  out, rather than a rival standard, which is a far easier thing to
  defend to a deanery.

- **Levels are words, declared per competency, and never numbered** —
  `level-3` needs a lookup table to mean anything, and every stored
  record becomes wrong the moment a scale gains or loses a step.
  `unsupervised` explains itself and survives the scale changing
  around it. Ordering comes from the order they are listed in, which
  is where a scale belongs. Declaring them per competency rather than
  globally matters because the honest number of
  levels genuinely differs: cannulation is signed off or it is not,
  while prescribing systemic anti-cancer therapy has a real middle
  state.

- **Progression is a new sign-off, not an edit** — moving from
  supervised to unsupervised writes a second record in its own folder.
  The earlier one is a named consultant's attestation that something
  was true at the time, and it was; overwriting it would destroy that
  statement and change the hash covering it. It also makes progression
  visible, which is worth having.

- **Two levels of trust, kept visibly apart** — certificates, logbook
  entries, reflections and CPD are the holder's own claims, entered by
  them alone; a sign-off is a second person accepting accountability.
  Blurring them would let a thick logbook masquerade as a
  judgement. The interface should make which is which obvious without
  anyone having to think about it.

- **A curated shortlist suggests; it never restricts** — an oncology
  centre needs its competencies to hand, but the moment a list is
  presented as the set that matters it becomes a syllabus the software
  is asserting. So the shortlist is interface furniture in Postgres,
  outside the passport, and every competency stays reachable through
  search. This is the same line as counting without comparing.

- **The passport counts evidence but never judges sufficiency** — it
  reports thirty-eight logged procedures and stops there. No target,
  no progress bar, no "requirements met". How many is enough is a
  clinical judgement that varies by trainee, by supervisor and over
  time, and a system that appears to have decided first invites the
  assessor to defer to it. This is the same principle as VPR's refusal
  to record what it cannot verify.

- **Self-declared evidence is editable; signed records are not** —
  a mistyped logbook date should be fixable in seconds. A sign-off is
  immutable once signed and is corrected only by superseding it. The
  difference follows from who is accountable for each.

- **A passport belongs permanently to the person it describes** —
  there is no transfer of ownership, and no API operation that could
  perform one. A competency record is a statement about a named
  individual, so reassigning it would be meaningless. Employers,
  supervisors and organisations come and go around the record; the
  holder does not change. This narrows Turva's transferable-ownership
  principle, which suits hazards owned by a project and does not suit
  a personal record.

- **The application is the only writer** — no clinician ever meets git.
  This is the failure that ended OpenRegulatory's pattern and that DCSP
  answered by building an application. Git here is invisible
  infrastructure, and the storage choice only pays off if the interface
  is genuinely good.

- **The passport frontend loads on demand, and nothing else changes** —
  the entry chunk is 309 kB gzipped with every page statically
  imported, and roughly seventy per cent of that is Mantine, React and
  React Router, which every route needs regardless. So splitting the
  application generally is poor value and stays deferred in `todo.md`.
  The passport is the exception on grounds other than size: it is
  gated twice over, by feature and by competency, so most people who
  download it can never open it, and an external assessor sees one page
  of it. Being unbuilt, it can adopt the pattern without risking
  anything that works today, which makes it the pilot rather than the
  beginning of a sweep. The cost is one precondition the application
  needs anyway — `vite:preloadError` routed through the update gate,
  without which a long-lived tab dies on navigation rather than on
  load, since JavaScript is not in the precache manifest and there is
  no offline fallback.

- **ReportLab for the PDF, not a second library** — it is already a
  dependency and already in the image, and its `platypus` module
  handles the flowing tabular document the passport needs, even though
  the existing certificate code only uses the fixed-layout canvas.
  WeasyPrint would give nicer styling through HTML and CSS, but it
  needs Pango, cairo and cffi added to the backend image, which is
  real build fragility for one developer to carry. There is also no
  server-side HTML pipeline to share, since the frontend is React, so
  the styling advantage is smaller than it first appears. If the PDF
  later needs elaborate layout, WeasyPrint remains available and
  nothing in the design depends on the choice.

- **One competency for the feature, not one for holding and one for
  signing** — everyone is both, at different times. A consultant still
  acquires new competencies and a registrar competent at a procedure
  is often the right person to supervise a junior at it. Two
  competencies would encode a seniority model that does not match
  clinical training, and would need constant admin correction as
  people move.

- **One attestation, the assessor's, covering everything** — the
  assessor signs off a record that already holds the holder's observed
  date, reflection and evidence references, so accepting it attests to
  all of that. Nothing separate is needed from the holder, who attests
  to nothing the assessor is not already vouching for. Their
  participation is attributed in the git history, exactly like their
  logbook and certificates.

- **Registrations are recorded, never certified** — both holder and
  assessor declare their GMC, NMC, GPhC or HCPC number as a plain key
  and value pair on the record, with a `verified` flag an admin can
  set after checking by hand. Quill checks no register, and the record
  says so rather than implying otherwise. This is also why VPR's
  approach of sealing a registration number into an X.509 certificate
  is not followed: it would make an unverified claim look verified to
  anyone who checked the certificate.

- **Self-sign-off is the only rule** — refused at the API regardless
  of competencies held, because the whole value of the record is a
  second named person accepting accountability, after Turva's
  "contribution is not approval." Nothing else is enforced. Who is fit
  to assess whom is a clinical judgement, varying by procedure,
  department and the people involved, and any rule table encoding it
  would be wrong somewhere on the day it shipped. The record names the
  assessor, their role and their registration, so a reader can judge
  for themselves. That is the same reasoning as counting a logbook
  without comparing it to a target.

  **This holds even where a framework states a rule.** The UK SACT
  Board recommends that Level 2 is assessed by a practitioner at Level
  3 or above, and Levels 3 and 4 by one at Level 4 or above, and that
  is precisely the kind of rule a system is tempted to encode. Quill
  records it and does not enforce it, because **paper does not enforce
  it either**. Nothing about a paper passport stops the wrong person
  signing; what makes the record trustworthy is that it says who did,
  in their own hand, for anyone to weigh afterwards. Enforcing it in
  software would not add a safeguard that the paper form has and we
  lack — it would invent one the profession has never had, and would
  fail on the day a locum consultant's level is not recorded in Quill
  because they have never used it. The competency definitions carry the
  framework's own wording, including its guidance on who should assess,
  so the rule reaches the person making the judgement rather than a
  validator.

- **Three clocks kept apart** — `observed_on` is entered by the holder,
  `signed_at` is set by the server when the assessor signs, and the
  commit timestamp is the commit timestamp. The PDF prints the first
  two and the head commit hash. Presenting one as another is the
  mistake VPR's roadmap warns against.

## Open questions

- **Which documents are the source of the competencies** — the South West SACT
  and radiotherapy passports need to be obtained from the user's wife
  or the deanery before Phase 0 can be completed; the domain notes
  above are from public summaries only.

- **Evidence retention** — how long evidence blobs are kept after an
  sign-off is superseded, and whether a holder may remove evidence
  they uploaded in error. Phase 1 keeps everything.

- **Verifying external assessors** — whether by-hand register checks by
  an organisation admin are acceptable to the deanery for phase 1, or
  whether sign-offs from unverified assessors should not count
  towards completion until verified.

- **What the product is called** — "Clinician passport" is the working
  title, but `clinical` already means "depends on FHIR and EHRbase,
  i.e. patient data" in this codebase (`RequireClinical`), and a
  passport holds no patient data at all. _Practice passport_ avoids
  the clash, alliterates and matches "scope of practice";
  _competency passport_ matches UKONS naming; _capability passport_
  matches the RCR's "capabilities in practice". The module, API and
  feature key stay plain `passport` whichever is chosen, and the CBAC
  ids above should follow the final name.

- **What happens when a genuinely required list arrives** — a deanery
  or college list of required competencies is coming, and it is not
  the same thing as a site's convenience shortlist. Showing "your
  programme requires these twenty, fourteen are signed off" is
  arguably reporting an external body's stated requirement rather than
  the software judging sufficiency, which would make it legitimate
  where a logbook target is not. That distinction needs deciding
  deliberately rather than drifting into a progress bar.

- **Whether logbook entries may carry patient identifiers** — surgical
  logbooks record anonymised patient references so entries can be
  audited. Allowing that would end the passport's freedom from patient
  data and change its retention, access and breach position entirely.
  The current design forbids identifiers and accepts weaker
  auditability, but that is a clinical governance call.

- **Whether anyone vouches for a logbook** — fifty countersignatures is
  unrealistic. A single batch confirmation covering a range of entries
  is realistic and close to what happens informally. The alternative is
  to leave the logbook self-declared and let the sign-off be the only
  place trust enters, which is the current design.

- **Whether reassessment runs from the observed or the signed date** —
  competence decays from when it was demonstrated, which argues for
  `observed_on`, but the administrative reading is `signed_at`. With
  gaps of weeks these differ materially. A clinical judgement rather
  than a technical one.

- **Who should own the framework** — the research is emphatic that
  adoption, not format, decides whether this travels. The RCR, the UK
  SACT Board, or a deanery owning the competency list would matter more
  than anything in this plan. Worth establishing before building
  Phase 5 onwards.

- **Organisation scoping** — the organisation-scoped access findings
  plan (`2026-09-06-org-scoped-access-findings.md`) may change how
  "admin of the holder's organisation" is evaluated; the passport
  should adopt whatever that plan lands rather than invent a scope.
