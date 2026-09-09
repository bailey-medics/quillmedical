# Clinical passport plan

Oncology registrars in the South West utilise a "SACT passport" and a
"radiotherapy passport": a portable record of the clinical competencies
they have been assessed as holding, who signed each one off, when, and
on what evidence. Today this lives in paper booklets scanned and copied
into digital portfolios. Quill Medical already has the vocabulary for
competencies (CBAC, `shared/competencies.yaml`) but nothing that records
the **sign-off** itself: the two-party act of a trainee presenting
evidence and a named assessor accepting accountability for it. This
plan adds a Clinical Passport that holds those sign-offs as portable,
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
  own signature, which is why the plan records the assessor identity in
  the sign-off file and the commit trailers rather than relying on
  who merged.

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
  attachment sidecars; timestamp identifiers; structured commit
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
  where they already live, in `shared/competency-definitions.yaml`,
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

- **A passport is not a defined set of competencies** — there is no
  grouping in the shared definitions saying which competencies make up
  "the SACT passport". Membership of a passport is local policy: the
  South West's list will not match another region's, and encoding one
  view centrally would impose it on everyone. A passport simply holds
  the sign-offs its holder has accumulated. If a checklist is wanted
  later it belongs to an organisation, not to a competency definition.

- **The passport does not grant CBAC competencies** — a signed-off
  passport competency is evidence an administrator may act on, not an
  automatic change to `additional_competencies`. Automatic granting is
  a future item (see below) because it turns an educational record
  into an access-control input and needs clinical safety review.

- **Passport competencies are gated by CBAC** — two feature-admin
  competencies: `hold_clinical_passport` (may own a passport and
  request sign-off) and `sign_off_clinical_passport` (may sign off).
  Self-sign-off is refused at the API regardless of competencies. A
  competency definition may narrow who can sign it off by base
  profession.

- **Assessors may be external to Quill** — most consultants who sign a
  registrar's passport will never otherwise use Quill. The holder
  invites them, they register through the existing invite-token flow,
  and they hold `sign_off_clinical_passport` and nothing else. See
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

### Standards this maps onto

The aim is to sit on existing standards rather than add another one.
Git, YAML and Markdown are storage, not a standard we are inventing;
the vocabulary and the interchange format come from elsewhere.

- **Content**: the first set of competencies is drafted from working
  clinical
  knowledge, then checked against the UK SACT Board's _Prescriber
  competencies for reviewing and prescribing SACT_ (November 2023),
  which reportedly covers medical prescribers at ST level and above.
  Aligning to it matters for adoption rather than for building, so it
  is a later task in Phase 0, not a prerequisite.

- **Competency definition shape**: the 1EdTech CASE model — items with
  a
  synthetic identifier, a separate human coding scheme, and hierarchy
  expressed as associations rather than nesting.

- **Sign-off export**: Open Badges 3.0, which is itself a W3C
  verifiable credential and already provides
  `achievementType: "Competency"`, `Result.achievedLevel` against a
  named scale, `validUntil`, `Alignment` into a framework, and
  `Evidence.narrative` typed as Markdown. Field names in
  `sign-off.yaml` are chosen so this mapping stays mechanical.
  Storage stays YAML, because the person whose record it is must be
  able to read it; the badge is what leaves the building.

- **Practitioner export**: FHIR UK Core `Practitioner.qualification`,
  which already carries a coded qualification, a validity period and
  an issuing organisation.

- **Provenance**: the PRSB Provenance Data Standard as the conceptual
  shape for who recorded what, where and when.

Two gaps no standard closes, which remain ours to build: two-party
sign-off, since a verifiable credential has one issuer and one
signature; and binding a signing key to a GMC number, for which no UK
trust registry exists.

### Three ways in, and two levels of trust

A holder does three things with a passport, and the design falls out of
the difference between them.

- **Upload a certificate** — a course attendance, a qualification, an
  external award. The file itself is a binary; the passport stores what
  it is, who issued it, when, and which competencies it relates to.

- **Request a sign-off** — pick a competency, name an assessor, and
  send them a link. They review and sign.

- **Keep a logbook** — start a logbook against any competency and
  record each procedure as it happens.

The first and third are **self-declared evidence**: the holder enters
them, nobody countersigns, and they are claims about activity. The
second is a **two-party assessment**: a named person accepts
accountability for a judgement. Only that one is signed.

Keeping those apart is the whole point. A logbook of two hundred
bronchoscopies proves activity, not competence. The consultant's
signature is what turns evidence into a conclusion, and the system must
never blur the two by appearing to draw the conclusion itself.

### On-disk layout of a passport

One git repository per holder, mirroring VPR's sharding, with content
addressed evidence outside git.

```text
passports/<s1>/<s2>/<32-hex-uuid>/
  .git/
  .gitignore                        # contains "files/"
  README.md                         # plain English: what this is, how to read it
  passport.yaml                     # holder identity and schema version
  competencies.yaml                 # derived index: every competency and its state
  certificates/
    2025-11-04-bronchoscopy-course/
      certificate.yaml              # issuer, dates, competencies it relates to
      attachment_1.yaml             # sidecar: sha256, size, media type, filename
  logbook/
    perform_bronchoscopy/
      2025.yaml                     # a year of entries, one list
      2026.yaml
    perform_thoracic_ultrasound/
      2026.yaml
  sign-offs/
    2026-03-14-perform-bronchoscopy/
      sign-off.yaml                 # the signed record
      sign-off.sig                  # assessor's detached signature over it
      reflection.md                 # holder narrative, optional
      assessment.md                 # assessor narrative, optional
      attachments/
        attachment_1.yaml           # sidecar: sha256, size, media type, filename
  signers/
    <fingerprint>.pem               # assessor certificates used in this passport
    ca.pem                          # the issuing deployment's CA certificate
  files/                            # gitignored, content-addressed evidence blobs
    sha256/ab/cd/<64-hex>
```

Two levels, deliberately. `competencies.yaml` answers the question
asked ninety-nine times out of a hundred — is this person signed off —
and the directories beneath hold the detail that only matters at an
ARCP panel, an audit, or a concern.

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

- **`passport.yaml`** — holder's user id, a snapshot of name and
  registrations at creation, and a `schema_version` for the passport
  layout itself. Nothing else: there is no enrolment step and no list
  of frameworks to join.

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

- **Sign-off folder names are for humans** —
  `<observed-date>-<competency-slug>`, so the directory listing reads
  as a chronology of clinical work. A second sign-off for the same
  competency observed on the same day gets `-2`. Names are fixed at
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
  `holder` and `signed_off_by` blocks each with user id, name, role,
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
  a free-text description. The binary itself never enters git: it is
  hashed into `files/sha256/` and referenced by an attachment sidecar,
  exactly as evidence attached to a sign-off is. A certificate is the
  holder's own claim and carries no signature.

- **Logbook files** — one file per competency per year, holding a list
  of entries. A year is a natural bound: files stay small enough to
  read, the count of files stays sane across a career, and appending is
  a small diff. Each entry records the date, setting, whether the
  procedure was supervised or independent, the supervisor where there
  was one, the indication, the outcome and free-text notes. An entry
  may name further competencies it also counts towards, so an unusual
  case need not be duplicated. Entries are the holder's own record and
  carry no signature.

- **Failures are recorded like anything else.** An unsuccessful
  procedure, an abandoned attempt or a declined sign-off is part of the
  record. The alternative — a record that only shows successes — is
  worth less to everyone reading it.

- **Every file must make sense alone.** The human label travels beside
  every identifier even though it is derivable, because a sign-off
  read on its own, years later, with no other file to hand, has to be
  intelligible. The id stays authoritative; the label is a convenience
  copy, and where they disagree the id wins. Files carry a one-line
  YAML comment saying what they are.

- **Timestamp ids** — `YYYYMMDDTHHMMSS.sssZ-<uuid4>`, generated
  server-side with VPR's monotonic rule. These identify a sign-off
  permanently; they no longer appear in folder names or in the index.

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
  it. Two things close that hole: the store rejects any non-fast-forward
  update, and every sign-off's `content_hash` is appended to a
  `passport_signoff_log` table outside the repository, with its
  timestamp and the commit it arrived in. That log, not the repository,
  is what makes tampering detectable, and it is append-only with no
  update or delete path in the application.

- **Content hashing follows Doorstop's discipline** — the hash covers
  a canonical serialisation of the semantically significant fields
  only, with the contributing and non-contributing fields written down
  in the schema. Correcting a typo in a comment must not invalidate a
  signature; changing the level must. The same fingerprint drives
  reassessment, if we later choose to detect a competency definition
  changing under sign-offs already made.

- **Signing, at two levels with different meanings** — the assessor's
  detached signature over `sign-off.yaml` alone is the professional
  act: narrow, covering exactly what they saw on screen and pressed
  sign on, and checkable with `openssl` decades later. The commit
  signature, made with the same key, seals the tree state and proves
  who changed the repository and when. The distinction matters because
  `competencies.yaml` is regenerated on every write, so a commit's tree
  contains sign-offs given by other consultants; a commit signature
  alone would have each assessor sealing colleagues' judgements they
  never saw. Requests, withdrawals and declines are unsigned. See
  "Signing and verification" below.

- **A sign-off pins the evidence it was given** — the record stores
  the logbook count for that competency at the moment of signing, a
  digest over the entries it covered, and the certificates in view.
  Not as a threshold that was met, but as a record of what was in
  front of the assessor when they decided. That is the part that
  matters if a sign-off is ever questioned.

- **`meaning` is recorded on every signature** — one of
  `directly observed`, `reviewed evidence`, or `countersigned`. These
  are clinically different acts, and a record that does not say which
  one happened is weaker than it looks.

- **Git library** — pygit2 (libgit2, the same engine VPR uses),
  in-process, with `create_commit_with_signature` for signed commits.
  No shelling out to `git` and nothing driven by `pexpect`, which is
  where DCSP's push code stalled.

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

### Signing and verification

The passport's value is that a third party can trust it without asking
Quill. Every sign-off is therefore signed from the first release, but
key handling is kept proportionate: assessors never manage keys, and
the only new infrastructure is two secrets.

- **Deployment certificate authority** — each Quill deployment holds
  one ECDSA P-256 key pair and a self-signed CA certificate, generated
  once by a `just passport-ca` recipe, with the private key in Secret
  Manager in production and a `SecretStr` setting in development. It
  signs assessor certificates and nothing else. The CA certificate is
  published at `GET /api/passport/ca.pem` and written into every
  exported bundle. This closes the gap VPR left open: an assessor's
  certificate chains to a known issuer, so verification proves the
  identity the deployment asserted, not merely possession of a key.

- **Per-assessor keys, server-custodied** — when a user gains
  `sign_off_clinical_passport`, the server generates an ECDSA P-256 key
  pair and issues a certificate in VPR's layout: `CN` is the name, `O`
  the registration authority, X.520 `serialNumber` the registration
  number, a SAN URI of the form `quill://GMC/1234567`, key usage
  `digitalSignature` and `contentCommitment`, validity twelve months.
  The private key is encrypted with a key-encryption key from settings
  (`PASSPORT_SIGNING_KEK`, in Secret Manager) and stored in the
  `passport_signer` table. Assessors never see or handle a key.

- **Step-up authentication makes key use a deliberate act** — because
  the server holds the key, signing must require more than a live
  session. The sign-off endpoint requires a fresh TOTP code, checked
  with the existing `verify_totp_code` in `backend/app/security.py`,
  and refuses without one. The session proves who is logged in; the
  code proves they are present and intend this sign-off now. This is
  the passport's equivalent of a wet signature.

- **What is signed** — the canonical form of `sign-off.yaml`
  (sorted keys, minus the `signature` block) is hashed with SHA-256 to
  give `content_hash`, and that hash is signed. The `signature` block
  holds `algorithm: ecdsa-p256-sha256`, `value` (base64 DER),
  `certificate_fingerprint` (SHA-256 of the DER certificate) and
  `signed_at`. The signer's certificate is written once to
  `signers/<fingerprint>.pem` in the passport repository and the CA
  certificate to `signers/ca.pem`, so the repository verifies itself.

- **Signed commits** — the commit recording a sign-off carries a
  signature over the commit buffer in its `gpgsig` header, in VPR's
  JSON container (signature, public key, certificate), made with the
  same key through pygit2. The file and the commit therefore vouch for
  each other: the file proves what was signed, the commit proves when
  it entered the history.

- **Verification** —
  `GET /api/passport/{id}/sign-offs/{signoff_id}/verify`
  recomputes the hash, checks the signature against the certificate in
  `signers/`, checks the chain to the CA, and checks the certificate
  was valid at `signed_at`. The exported bundle includes a `VERIFY.md`
  with the `openssl` commands that do the same offline. The PDF prints
  the content hash and certificate fingerprint on every sign-off
  and a QR code that opens the verify endpoint.

- **Expiry and revocation** — an expired or revoked certificate
  (assessor leaves, competency removed, suspected compromise) blocks
  new signatures and does not disturb signatures made while it was
  valid. `not_before`, `not_after`, `revoked_at` and `revoked_reason`
  live on `passport_signer` and are reported by the verify endpoint.
  Renewal issues a new certificate and a new `signers/` file. There is
  no revocation list inside the bundle in phase 1; the verify endpoint
  is the revocation source of truth, and the future items say what an
  offline list would add.

- **Limits stated honestly** — the deployment asserts the registration
  number the assessor declared; it does not check the GMC register.
  The certificate's `O` and `serialNumber` mean "as declared to
  Quill", and the verify endpoint says so alongside the
  `registration_verified` flag described under external assessors.

### External assessors

- **The problem** — the consultant who observes a registrar deliver a
  SACT cycle is often not a Quill user and cannot be asked to become a
  staff user of a system their trust does not run. The holder must be
  able to bring their own assessor.

- **Invite by the holder** — the holder, or an admin of their
  organisation, invites an assessor by email with their name,
  registration authority and number. This writes a
  `passport_assessor_invite` row and emails a signed invite link,
  reusing `create_invite_token` and `decode_invite_token` in
  `backend/app/security.py` with a new `user_type` of
  `passport_assessor`. Tokens are single-use and expire after fourteen
  days; the row records who invited whom and for which passport.

- **Acceptance** — the link opens `/passport/assessors/accept`. A new
  user registers with name, email, password and mandatory TOTP setup
  (signing needs it); an existing user signs in. Either way the result
  is a user with `system_permissions` of `single-user`, no
  organisation membership, a base profession chosen from a short list,
  the declared registrations in `professional_registrations`, and
  `sign_off_clinical_passport` in `additional_competencies`. The signing
  key and certificate are issued at that moment.

- **Scope of access** — an external assessor sees and acts on exactly
  the sign-offs they are named on through `passport_signoff_request`
  rows, and nothing else: not the holder's full passport, not other
  holders, no patient data, no organisation pages. `GET
/api/passport/{id}` returns 403 to them; the inbox returns only their
  requests; the sign-off page renders one sign-off and its evidence.

- **Feature gating** — `requires_feature("passport")` checks the
  caller's organisations, and an external assessor has none. The
  inbox, sign-off and decline routes therefore gate on the passport
  holder's organisation having the feature, resolved from the request
  row. This is a sibling dependency next to `requires_feature` in
  `backend/app/features/gating.py`, not a change to it.

- **Registration verification** — the registration is self-declared at
  invite and confirmed by the assessor on acceptance.
  `sign-off.yaml` records `assessor.registration_verified: false`
  until an admin of the holder's organisation marks the assessor
  verified (by hand against the GMC register in phase 1), and the flag
  applies to sign-offs signed after that point. The PDF renders it.
  The record stays honest about what Quill checked.

- **Revocation** — an admin of the inviting organisation can revoke an
  external assessor, which revokes their certificate and removes
  `sign_off_clinical_passport`. Signed sign-offs stand.

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

- **`passport_signer`** — `user_id`, `public_key_pem`,
  `private_key_encrypted`, `certificate_pem`, `certificate_fingerprint`,
  `not_before`, `not_after`, `created_at`, `revoked_at`,
  `revoked_reason`. One row per issued certificate; the current one is
  the newest unrevoked row. The private key never leaves this table
  unencrypted and is decrypted only inside the sign-off request.

- **`passport_assessor_invite`** — `id`, `passport_id`,
  `invited_by_user_id`, `email`, `name`, `registration_authority`,
  `registration_number`, `token_hash`, `expires_at`, `accepted_at`,
  `accepted_user_id`. Workflow for bringing an external assessor in;
  consumed once.

- **`passport_signoff_log`** — `id`, `passport_id`, `signoff_id`,
  `content_hash`, `commit_sha`, `logged_at`. Append-only, written on
  every sign-off, never updated or deleted. This is the tamper-evidence
  backstop for force-push, not a projection of the record.

- **Nothing else** — no sign-off table, no per-competency status
  table, no cached progress. A holder's passport page reads their
  repository. A programme director's cross-trainee view is a future
  item that will need a projection, and is listed under future work.

### Rendering and export

- **Markdown** — the passport is rendered on demand from
  `passport.yaml` and the sign-off files into a single
  `passport.md` (front page with holder identity, one table row per
  competency with
  its current level, assessor and date, and an appendix of every
  sign-off in full including caveats and superseded records). The
  files are canonical; the rendered Markdown is a view and is not
  stored in the repository.

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
  directory (YAML, Markdown, sidecars, evidence blobs), the rendered
  `passport.md` and `passport.pdf`, `VERIFY.md` with the `openssl`
  commands to check a signature offline, and a `git bundle` of the full
  history. The README is the highest-value file in the bundle and costs
  nothing. This is the portable artefact a registrar carries between
  trusts. CSV export and import of a bundle into another deployment are
  both future items.

### API surface

All routes under `/api/passport`, all requiring authentication, CSRF on
mutations, `requires_feature("passport")`, and the CBAC competencies
above. Additive only, per `.claude/rules/backend.md`.

- `POST /api/passport` — create the caller's passport.
  `hold_clinical_passport`.
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
  assessor. `sign_off_clinical_passport`.
- `POST /api/passport/{id}/sign-offs/{signoff_id}/sign-off` —
  assessor signs, with level, caveats, optional assessment narrative
  and a fresh `totp_code`. Refused if the assessor is the holder, is
  not named on the request, has no valid certificate, or the code is
  missing or wrong. Signs the sign-off, writes the file, makes the
  signed commit and closes the request.
- `GET /api/passport/{id}/sign-offs/{signoff_id}/verify` —
  recomputes and checks the signature, chain and validity window;
  readable by anyone who may read the sign-off.
- `GET /api/passport/ca.pem` — the deployment CA certificate. Public.
- `POST /api/passport/{id}/assessors/invite` — holder or organisation
  admin invites an external assessor. `hold_clinical_passport`, rate
  limited.
- `POST /api/passport/assessors/accept` — public; consumes the invite
  token, registers or links the user, issues the signing certificate.
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
- `GET /api/passport/{id}/export.md`, `export.pdf`, `export.zip`.
- `GET /api/passport/competencies` — the competency definitions with
  their levels, for populating the request form.

### Frontend

- **Routes** — `/passport` (my passport), `/passport/competency/:id`
  (history and request form), `/passport/inbox` (assessor),
  `/passport/sign-off/:signOffId`, `/passport/assessors/accept`
  (invite landing, `GuestOnly` or signed in) and
  `/passport/verify/:signOffId` (the page the PDF's QR code opens).
  Guarded with `RequireAuth`, `RequireFeature feature="passport"` and
  the CBAC hooks; the assessor routes use a holder-organisation gate
  because external assessors have no organisation.

- **Components in `frontend/src/components/passport/`** —
  `PassportDomainProgress` (per-domain summary from derived status),
  `CompetencyRow`, `SignOffCard` (one sign-off in full with
  status, assessor snapshot, caveats, evidence links),
  `SignOffRequestForm`, `SignOffForm` (level, caveats, narrative, the
  declaration checkbox and the TOTP code field), `AssessorDeclaration`
  (the fixed declaration text), `EvidenceUploader`,
  `PassportExportButtons`, `CertificateUploader`, `CertificateCard`,
  `LogbookEntryForm`, `LogbookTable` (entries and a count, never a
  target), `InviteAssessorForm`, `SignatureBadge`
  (signed, unverified registration, expired, revoked) and
  `VerificationPanel` (the verify endpoint's result). Each with
  `.stories.tsx` and `.test.tsx`, built from `BaseCard`, `ButtonPair`,
  `Icon` and the design system.

- **Pages in `frontend/src/pages/passport/`** — thin compositions of
  the above with the `Stack gap="lg"` pattern and no Container.

### Validation and safety

- **Schemas** — Pydantic models with `extra="forbid"` for
  `passport.yaml`, `sign-off.yaml`, certificates, logbook files and
  sidecars;
  the same models validate on read, so a hand-edited or imported file
  that fails validation is rejected rather than half-parsed.

- **Definition CI gate** — a validator under `backend/app/features/`
  in the style of `features/teaching/tooling/validate.py` that checks
  the passport fields added to the competency definitions: every
  assessor base profession exists, level lists are well-formed,
  versions are immutable once published (a changed file with the same
  version fails).

- **Guard clauses** — every route validates the passport exists, the
  caller's relationship to it, the sign-off's current status allows
  the transition, and the assessor is not the holder, before touching
  storage.

- **No PHI** — passports contain no patient data by design. Evidence
  uploads are the one risk (a scanned DOPS form might name a patient);
  the upload form carries a declaration that evidence is anonymised,
  and this is recorded in the hazard log.

- **Audit** — the git history is the audit trail. Exports are logged
  (who, which passport, when) in the existing application log with no
  content.

- **Key handling** — private keys exist in plaintext only inside the
  sign-off request handler, never in logs, responses or exports. The
  KEK and CA key are `SecretStr` settings sourced from Secret Manager.
  Losing the CA key means new assessors cannot be issued certificates
  until a new CA is created and published; existing signatures remain
  verifiable against the old CA certificate kept in `signers/`.

- **External assessor boundary** — every route an external assessor can
  reach resolves the passport from a request row naming them, and no
  route lists passports, users or organisations to them. The
  authorisation tests include an external assessor row in the matrix.

## Phase 0: competency content and clinical safety

- [ ] Draft the first competencies from working clinical knowledge:
      the procedures, their levels where levels are meaningful, who may
      sign each one off, and any expiry interval. Do not wait on
      official documents.
- [ ] Later, and not as a blocker: check the draft against the UK SACT
      Board's _Prescriber competencies for reviewing and prescribing
      SACT_ (November 2023), the South West passports and the RCR
      entrustment scales.
- [ ] Rename `shared/competencies.yaml` to
      `shared/competency-definitions.yaml` so it cannot be confused
      with a passport's own `competencies.yaml`. Touches the loader
      constant in `backend/app/cbac/competencies.py`, the list in
      `frontend/scripts/generate-json-from-yaml.ts`, the four frontend
      files importing the generated JSON, `backend/tests/test_competencies.py`
      and three live docs pages. Edit `.github/copilot-instructions.md`
      rather than `CLAUDE.md` and re-run `/sync-copilot-config`; leave
      historical plan documents untouched.
- [ ] Add the `sact` and `radiotherapy` categories and their
      competencies to `shared/competency-definitions.yaml`, with
      `display_name`, `category` and `risk_level`.
- [ ] Add `hold_clinical_passport` and `sign_off_clinical_passport` to
      `shared/competency-definitions.yaml` under the feature-admin
      category, and to the appropriate base professions in
      `shared/base-professions.yaml`.
- [ ] Add the optional passport fields — `levels`,
      `expires_after_months`, and the base professions that may sign
      off — to the competencies that need them. Every field is
      optional, so existing entries are untouched.
- [ ] Run `yarn generate:types` in `frontend/` and commit the generated
      JSON.
- [ ] Add hazard log entries for the passport: wrong assessor signs,
      holder signs off their own, evidence contains patient data, exported PDF
      diverges from repository, a competency definition changed under
      sign-offs already made, external
      assessor declares a registration they do not hold, signing key or
      CA key compromise, sign-off made from a stolen session without
      the step-up code.

## Phase 1: core store and record model

- [ ] Create `backend/app/features/passport/` with `paths.py` (typed
      relative paths, no I/O, after VPR's `crates/core/src/paths/`),
      `ids.py` (timestamp id generator with monotonic rule),
      `schemas.py` (Pydantic models for `passport.yaml`,
      `sign-off.yaml`, certificates, logbook files and sidecars), and
      `definitions.py` (reads the passport fields from
      `shared/competency-definitions.yaml`).
- [ ] Implement `store.py` with the `PassportStore` interface and the
      local filesystem backend, including `init_and_commit` with
      whole-directory cleanup on failure and `write_and_commit_files`
      with rollback.
- [ ] Implement `commits.py`: the commit message renderer with the
      closed action vocabulary, reserved trailer keys and single-line
      value validation.
- [ ] Implement `certificates.py` and `logbook.py`: create, amend and
      remove self-declared evidence, each as one validated write and
      one unsigned commit, with the year-file append for logbook
      entries.
- [ ] Implement `index.py`: regenerate `competencies.yaml` from the
      sign-off folders on every write, with the folder-naming and
      collision rules, and a self-heal that rebuilds stale references.
- [ ] Implement content hashing with an explicit contributing-field
      list, and tests proving a comment edit does not change the hash
      while a level change does.
- [ ] Add the `passport_signoff_log` model and migration, and reject
      non-fast-forward updates in the store.
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

## Phase 3: signing and verification

- [ ] Add a `just passport-ca` recipe that generates the deployment CA
      key pair and self-signed certificate with `cryptography`, and
      document storing the key in Secret Manager in
      `docs/docs/infrastructure/gcp.md`.
- [ ] Add `PASSPORT_CA_KEY`, `PASSPORT_CA_CERT` and
      `PASSPORT_SIGNING_KEK` to `backend/app/config.py` as `SecretStr`.
- [ ] Add the `passport_signer` model and migration.
- [ ] Implement `signing.py`: key generation, certificate issuance in
      VPR's subject layout, KEK encryption and decryption of private
      keys, canonical YAML serialisation, content hashing, sign,
      verify, chain check and validity-at-time check.
- [ ] Issue a certificate wherever `sign_off_clinical_passport` is
      granted: user provisioning, admin competency edits and invite
      acceptance; revoke it wherever the competency is removed.
- [ ] Add signed commits to the store through pygit2's
      `create_commit_with_signature`, and write `signers/<fingerprint>.pem`
      and `signers/ca.pem` into the repository on first use.
- [ ] Require and check a fresh TOTP code on the sign-off service call.
- [ ] Implement the verify function and the `VERIFY.md` template for
      bundles.
- [ ] Tests: sign and verify round trip; a single changed byte in the
      YAML fails; a certificate from another CA fails; a certificate
      expired at `signed_at` fails while one expired afterwards passes;
      a revoked signer cannot sign; a missing or wrong TOTP code is
      refused with no file written; `openssl` verifies a fixture bundle
      (skipped when `openssl` is absent).

## Phase 4: API

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

## Phase 5: rendering and export

- [ ] Implement `render.py`: passport files to `passport.md`, with the
      front page, per-domain tables, and the full sign-off appendix
      including superseded records.
- [ ] Implement `pdf.py` with ReportLab `platypus`: a document
      template, per-domain tables, the sign-off appendix,
      `content_hash` per sign-off and the head commit in the footer.
      Follow `features/teaching/certificate.py` in parsing style
      config defensively, so a malformed value degrades to a default
      rather than failing the download.
- [ ] Implement the zip bundle export including a `git bundle` of the
      repository.
- [ ] Tests: rendered Markdown snapshot per fixture passport, PDF
      generation succeeds and contains the hashes, export logging
      records no content.

## Phase 6: external assessors

- [ ] Extend `create_invite_token` and `decode_invite_token` in
      `backend/app/security.py` to accept the `passport_assessor` user
      type, with tests for expiry and single use.
- [ ] Add the `passport_assessor_invite` model and migration.
- [ ] Add the invite endpoint and an email template alongside
      `features/teaching/email_templates.py`; rate limit invites per
      holder per day.
- [ ] Add the accept endpoint: register or link the user, store
      registrations, add `sign_off_clinical_passport`, issue the signing
      certificate, consume the invite.
- [ ] Add the holder-organisation feature gate for assessor routes next
      to `requires_feature` in `backend/app/features/gating.py`.
- [ ] Add the verify-registration and revoke endpoints for organisation
      admins.
- [ ] Tests: an external assessor cannot read a passport, another
      assessor's requests, users or organisations; a consumed or
      expired token is refused; revocation blocks signing and leaves
      earlier signatures verifiable.

## Phase 7: frontend

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
      `hold_clinical_passport` or `sign_off_clinical_passport`.
- [ ] Frontend tests with `just uf src/components/passport` and
      `just uf src/pages/passport`; Storybook tests with `just sbt`.

## Phase 8: hardening and launch

- [ ] End-to-end test: holder requests, assessor signs, holder exports
      PDF, hash on PDF matches repository.
- [ ] Security review of upload handling (type sniffing, size limits,
      path containment, symlink refusal), of the authorisation matrix
      including external assessors, and of key handling (no key in
      logs, responses or exports).
- [ ] Rehearse CA key loss and recovery: create a second CA, publish
      it, confirm old signatures still verify against the retained CA
      certificate.
- [ ] Clinical safety review of the competency definitions and the
      declaration text with the Clinical Safety Officer; record in the
      hazard log.
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

- **Assessor-held keys** — moving from server-custodied keys to keys
  the assessor holds (a hardware token or NHS smartcard), so a
  signature no longer depends on trusting the deployment. The
  certificate layout and verify path are unchanged; only where the
  private key lives moves.

- **Offline revocation** — a signed revocation list inside every
  exported bundle, so a reader with no network can tell a revoked
  certificate from a valid one. Phase 1 relies on the verify endpoint.

- **Register lookup** — checking a declared registration against the
  GMC, NMC or HCPC register through their APIs, replacing the by-hand
  verification an organisation admin does in phase 1. This is the same
  item the CBAC documentation already lists.

- **Verifier role** — a third party who confirms an assessor was
  entitled to sign, as in the UKONS model. Model as a second
  sign-off kind referencing the first.

- **Automatic CBAC grant** — a signed-off passport competency raising a
  request to add the matching id to `additional_competencies`, with
  administrator approval. Requires clinical safety review because it
  couples an educational record to access control.

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

- **CSV export** — one row per sign-off, for the common case of
  someone importing into a spreadsheet or another system by hand.
  Deliberately not part of the bundle, which stays YAML and Markdown.

- **ESR and portfolio export** — a structured export (CSV or FHIR
  `Practitioner` and related resources) for trusts that record the SACT
  passport on the Electronic Staff Record.

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

- **One competency registry, not two** — the passport adds optional
  fields to `shared/competency-definitions.yaml` rather than
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

- **Sign from the first release, with server-custodied keys and a
  deployment CA** — a passport that only Quill can vouch for is not
  portable, so signatures are in scope now. Asking consultants to hold
  keys would stall adoption, so the server holds them, encrypted, and
  a fresh TOTP code is required to use one. A deployment CA gives the
  chain validation VPR lacked at the cost of two secrets. Assessor-held
  keys are a future item that changes nothing in the file format.

- **Sign the sign-off file and the commit, not just the commit** —
  the file-level signature travels with the YAML, is checkable with
  `openssl` and survives any future change of git tooling; the commit
  signature ties the sign-off to its place in history. Either alone
  leaves a gap.

- **External assessors through the existing invite-token flow, scoped
  to their requests** — the organisations and external access plan
  already established invite-only registration with a signed link, so
  the passport reuses it rather than adding a second mechanism. Their
  access is resolved from the request rows that name them, and
  nothing else, which is the least-privilege shape and the easiest to
  test.

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
  once signed. That also keeps each signature over a whole small file
  with a stable hash, rather than over a fragment of a growing one.

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
  statement and break the signature covering it. It also makes
  progression visible, which is worth having.

- **Two levels of trust, kept visibly apart** — certificates and
  logbook entries are the holder's own claims and carry no signature;
  a sign-off is a second person accepting accountability and is
  signed. Blurring them would let a thick logbook masquerade as a
  judgement. The interface should make which is which obvious without
  anyone having to think about it.

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

- **Self-sign-off refused at the API** — regardless of competencies
  held, because the whole value of the record is a second named person
  accepting accountability, after Turva's "contribution is not
  approval."

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

- **Assessor eligibility** — whether "consultant or above" is right for
  every competency or whether some allow senior registrars or specialist
  nurses to sign off. The definition supports either; the content is
  a clinical decision.

- **Evidence retention** — how long evidence blobs are kept after an
  sign-off is superseded, and whether a holder may remove evidence
  they uploaded in error. Phase 1 keeps everything.

- **Who holds the CA** — one CA per deployment is the design; whether
  the South West deanery or a trust should instead be the issuer, so a
  certificate says who trained the assessor rather than which software
  ran, is a governance question for the clinical safety review.

- **Verifying external assessors** — whether by-hand register checks by
  an organisation admin are acceptable to the deanery for phase 1, or
  whether sign-offs from unverified assessors should not count
  towards completion until verified.

- **What the product is called** — "Clinical passport" is the working
  title, but `clinical` already means "depends on FHIR and EHRbase,
  i.e. patient data" in this codebase (`RequireClinical`), and a
  passport holds no patient data at all. _Practice passport_ avoids
  the clash, alliterates and matches "scope of practice";
  _competency passport_ matches UKONS naming; _capability passport_
  matches the RCR's "capabilities in practice". The module, API and
  feature key stay plain `passport` whichever is chosen, and the CBAC
  ids above should follow the final name.

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

- **Whether to store Open Badges JSON directly** instead of YAML with
  an export step. It would remove any drift between our format and the
  standard, at the cost of a record the holder can no longer read
  unaided and much worse diffs. Current answer is no, but it should be
  a recorded decision rather than an omission.

- **Who should own the framework** — the research is emphatic that
  adoption, not format, decides whether this travels. The RCR, the UK
  SACT Board, or a deanery owning the competency list would matter more
  than anything in this plan. Worth establishing before building
  Phase 5 onwards.

- **Organisation scoping** — the organisation-scoped access findings
  plan (`2026-09-06-org-scoped-access-findings.md`) may change how
  "admin of the holder's organisation" is evaluated; the passport
  should adopt whatever that plan lands rather than invent a scope.
