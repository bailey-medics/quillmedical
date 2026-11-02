# Clinician passport

A portable record of what a clinician has been assessed as able to do, who
signed each assessment off, when, and on what evidence.

One git repository per holder. The files are the record; the history is the
audit log. A registrar moving between trusts takes the whole thing with them,
and it stays readable in twenty years with no Quill and no database.

## Why files rather than rows

A database row cannot be handed to somebody. That is the whole argument, and
everything below follows from it.

- **The record must outlive the system that made it.** A directory of YAML and
  Markdown, with a `README.md` explaining what it is, can be read by anybody
  with a text editor. A row in `passport_signoff` can be read by anybody with
  the schema, the credentials and the software.
- **The audit trail must be the record, not a parallel copy.** Git already
  answers who changed what and when, and cannot be edited without the history
  showing it. A separate audit table is a second thing to keep honest.
- **Portability is the point, not a feature.** The zip export carries the
  canonical files byte for byte, both rendered views, and a `git bundle` of the
  full history.

The cost is that some questions files cannot answer, which is why a few tables
exist - see [Coordination](#coordination-in-postgres) below.

## The shape of a passport

```text
  <passport_id>/
    manifest.yaml          schema version, nothing else
    profile.yaml           who this is, and their registrations
    competencies.yaml      the derived index - rebuildable, never authoritative
    frameworks/
      <framework>/
        <competency>/
          sign-offs/       one folder per sign-off, named by its date and scope
          logbook/         procedures performed
    certificates/          courses and qualifications claimed
    cpd/                   continuing professional development, by year
    reflections/           holder-only prose
    files/                 evidence blobs, gitignored, addressed by hash
```

Every sign-off and logbook entry is about one competency, and every
competency belongs to one framework, so both live in one tree. A sign-off
folder is its date, then its scope where it has one, then `-2` for a
second that day: `frameworks/uk_sact_board_2023/uk_sact_board_2023_prescribe_sact/sign-offs/2026-04-02-lung/`.
A sign-off is identified, in Postgres and in the API, as
`<competency>.<folder>`, such as
`uk_sact_board_2023_prescribe_sact.2026-04-02-lung`. Which framework folder
a competency is in is found by looking, in `layout.py`, and only a
competency's first record is placed by the catalogue.

The layout is `schema_version` 2 in `manifest.yaml`, since 2 November 2026.
No real passport existed at 1, so none was moved, and a passport at 1 is
refused as not found rather than listed as if it held nothing.

`competencies.yaml` is derived. Anything it says can be recomputed from the
records beside it, so a disagreement between the two is always resolved in the
records' favour.

## Sign-offs and self-declared records

The distinction the passport keeps hardest:

- **A sign-off is countersigned.** A named assessor accepted accountability for
  a judgement about somebody else's practice. It carries who signed, what they
  based it on, what the record meant at the time, and a content hash.
- **Everything else is the holder's own claim.** Logbook entries, certificates,
  CPD and reflections are entered by the holder and countersigned by nobody.
- **A logbook entry may be confirmed, which is not a sign-off.** A holder
  can ask a supervisor to confirm one entry, as a paper log carries a
  signature beside each line. It says the procedure happened as recorded,
  and nothing about competence. The supervisor's name and standing are
  frozen on the entry as an assessor's are on a sign-off, and amending the
  entry clears them, since they confirmed what it said at the time.

The API and the interface both refuse to blur these. A certificate form shows
no declaration and no assessor, and a test pins that it never will.

`kind` on a sign-off is derived rather than chosen by a caller - letting one be
picked would allow a progression to be recorded as a correction, quietly
implying an earlier assessor had been wrong.

## Which competencies, and in what order

A passport records skills, never software permissions. Two separate
mechanisms decide what a holder is offered, and only the first refuses
anything.

- **`assessable: true` on a competency** in `shared/competency-definitions/`
  says somebody could watch it being done and sign it off. Every
  framework's competency carries it, and no permission does: a permission
  such as `manage_users` or `perform_cannulation` is checked by the code,
  while what a passport records is a framework's own copy, such as
  `clinical_perform_cannulation`. `ASSESSABLE_COMPETENCY_IDS` holds the active ones, and
  `definitions.assessable_ref` refuses anything else when a record is
  created: a sign-off request, logbook entry, certificate, reflection or
  CPD entry. Amending an existing record keeps the looser check, and
  reading never checks at all, so a competency withdrawn later leaves old
  records intact.
- **A holder's frameworks** decide which competencies they are offered.
  A framework is one published document as a set of competencies: a
  national curriculum, or one hospital's own sign-off sheet. Each is a
  file in `shared/competency-definitions/` that declares a `framework:`
  block, loaded and checked with the catalogue, and its items are the
  assessable entries of that file. A holder chooses the frameworks they
  work to, and `_offered_refs` in `router.py` refuses a new record
  against a competency in none of them. There is no way round: somebody
  who wants one adds its framework first. The choice lives in
  `profile.yaml` as `{id, name}` pairs, so an export reads correctly
  with no Quill. Amending keeps the looser check and reading never
  checks, so dropping a framework hides and freezes nothing.
- **Quill hosts each framework as written.** The words, the order and
  the levels are the document's, and no framework is mapped onto
  another: two frameworks' levels for the same act are both kept. A
  revised document is a new framework in a new file, so a sign-off
  keeps the words it was signed under.
- **Every framework's competencies are recorded in a passport and granted
  to nobody.** Anybody may publish a framework, Quill included: its
  "General clinical skills" is `clinical.yaml`. Every entry is assessable
  and starts with its framework's id and an underscore, which the loader
  checks, so the same procedure under two frameworks is two competencies.
  `validate_competency_ids` refuses them wherever a competency is granted,
  so a framework's statements never appear among the permissions. Until
  2 November 2026 a `passport_only` flag marked the frameworks this held
  for; it now holds for all of them, so the flag has gone. The
  permissions of the same names as Quill's skills are in
  `clinical-permissions.yaml`.
- **An organisation's lead frameworks** order the list a holder chooses
  from, on the create step and the Settings card. An admin with
  `manage_users` names them on the organisation's features page, and
  they come first for everybody the organisation reaches; the rest
  follow alphabetically. `frameworks_for` in `frameworks.py` works out
  the list for one holder, and `GET /api/passport/frameworks` hands it
  to the frontend, searched by words in a name or publisher and
  narrowed by specialty. They live in `org_unit_passport_framework`,
  because they are an organisation's setting and nothing in a holder's
  record.
- **A specialty is a filter and nothing else.** `shared/specialties.yaml`
  lists the words a framework may be filed under. Nobody chooses one.
  Until 7 October 2026 a holder chose specialties, which ordered one
  list of every competency. A profile written then still carries a
  `specialties` key, which is dropped when the profile is read.

See the [passport registrar portfolios plan](../../plans/2026-10-07-passport-registrar-portfolios-plan.md).

## The record and the catalogue

A passport reads from two places, and each answers its own question.
Neither replaces the other.

- **The catalogue says what a framework asks for today.** It is
  `shared/competency-definitions/`: which rows a framework's table lists,
  what each competency is called now, and what the framework is called.
- **The record says what was signed off, in what words, on that day.** A
  sign-off stores its competency's id and words (`CompetencyRef`), its
  level's (`LevelRef`) and its scope's (`ScopeRef`), beside their ids. The
  record is never rewritten to match the catalogue, even to fix a typo,
  because a sign-off is evidence of what somebody signed.
- **A framework's name is the one stored word the page overrides.** A
  profile stores each framework it works to as `{id, name}`, and the page
  shows the catalogue's name through `current_name` in `frameworks.py`,
  since #2321. The name says what the document is, not what anybody
  signed.

What each kind of change to the catalogue does:

- **Adding a competency** gives every passport working to that framework
  a new "Not asked" row. Nothing recorded changes.
- **Removing a competency** means retiring it with `retired_on`, never
  deleting it, so a record against it still opens.
  `check-competencies-not-deleted.sh` fails CI on a deleted id.
- **Rewording a competency is allowed only when the meaning is
  unchanged**, such as a typo or a capital letter. A change of meaning is
  a new id, because otherwise an old sign-off appears to certify words
  nobody signed.
- **A publisher's new edition is a new framework**, with a new id and a
  new file, such as `uk_sact_board_2026`.
- **Renaming a framework changes no sign-off.**

### Framework versions

Every framework carries a `version`, a whole number from 1 that Quill
bumps by exactly one with every change to its file, except comments,
spacing and `description`. A new version goes live when it merges, with
no admin step, as a teaching bank's does. There is no draft status: a
framework is offered as soon as it merges.

- **Every sign-off records `framework_version`**, copied from its
  framework when it is asked for, which is when it copies the words. It
  never changes after, and it counts towards the content hash.
- **The publisher's edition label goes in `description`**, which is shown
  to nobody, never in a field of its own: "Pilot edition", "Published
  November 2023". Until 2 November 2026 `version` held that label.
- **A framework's retired competency names `retired_in_version`**, the
  first version that left it out, beside `retired_on`.
- **CI checks the version moved.** The "Competency catalogue check" job
  runs `app.features.passport.tooling.check_framework_version`, which
  compares each framework file's parsed content with `origin/main`. A
  change with the same version, a jump of more than one, a version going
  down and a version moving alone all fail. A new framework starts at 1.
  It prints every reworded competency, level and scope, pass or fail,
  because a change of meaning needs a new id and only a person can tell.
  Two branches of one stack changing the same framework fail as a jump,
  so the lower one lands first.
- **The framework list route's `version` field is deprecated.** It still
  carries the edition label, now read from `description`, so an open tab
  keeps working, and nothing reads it.

See the [passport record and catalogue plan](../../plans/2026-11-01-passport-record-and-catalogue-plan.md).

## Scopes

Some competencies are signed off one part of practice at a time:
prescribing chemotherapy for lung cancer is assessed apart from
prescribing it for breast cancer, though both are the one act. Such a
competency declares `scopes` in its definition, beside `levels`.

- **A sign-off and a logbook entry each name one scope**, wherever the
  competency declares them, and neither is accepted without. A
  competency that declares none behaves as it always did.
- **Picked from the list, never typed.** A signed record cannot be
  edited, and the scope decides which sign-offs form one history:
  "Breast" and "breast cancer" would be two. Every list includes
  `other`, so nobody is blocked by a missing entry.
- **The derived index has one entry per competency and scope**, each
  with its own level and history. A first sign-off for a new scope is
  `initial`, not a reassessment below the level held for another.
- **A sign-off counts the logbook entries for its own scope** in the
  evidence it freezes.
- **Scope counts towards the content hash only when present**, so a
  sign-off made before scopes existed still verifies.

## Evidence is addressed by its own hash

A blob lives at `files/sha256/ab/cd/<64-hex>` and the record referring to it
stores only that hash. Three properties follow, and each removes a class of bug
rather than merely being tidy:

- **The same file stored twice is one file.** Nothing needs to detect the
  duplicate.
- **A blob cannot be replaced.** Its name *is* its hash, so writing different
  bytes there is a contradiction, and the store refuses rather than
  overwriting. A successful overwrite would silently change the meaning of
  every record naming that hash.
- **Corruption is detectable with no extra data.** Re-hashing the bytes and
  comparing with the filename is the whole check - which is what lets
  `VERIFY.md` in the export offer something a holder can run with no software.

**This is why evidence uploads pass through the application.** The address
cannot be computed without reading every byte, so the signed-URL pattern the
teaching videos use - where the browser uploads straight to GCS and the backend
never sees the file - cannot work here. A video is addressed by a generated id,
so nobody needs to look inside it; a passport blob is addressed by its content.

Size and type are checked at the route rather than in the store:
`ALLOWED_EVIDENCE_TYPES` in `router.py` admits PDF, JPEG, PNG, HEIC and WebP,
and `MAX_EVIDENCE_BYTES` caps a file at 8 MB, below the global 10 MB
request-body limit. Storing is separate from
admitting.

## Coordination in Postgres

Five tables, and none is a copy of the record: `passport` points at one
holder's repository, `passport_assessor_invite` brings an outside assessor in,
`org_unit_passport_framework` holds an organisation's lead frameworks, and
`passport_signoff_request` and `passport_logbook_confirmation_request` are
workflow.

An assessor's inbox is a cross-passport query - "what have I been asked to
sign?" - and no single repository can answer it. The row is the ask; each
record is read from its own passport. It closes when the file is written.
An ask to confirm a logbook entry is the same shape, in a table of its own
because a logbook entry has no sign-off folder to name.

These are the only concessions to the database, and deliberately not a
projection: nothing reads them to learn what a passport contains.

The `passport` row also holds `landing_view`, how the holder likes their home
page laid out: `by_competency` (the default) or `by_record`. It is set through
`PUT /api/passport/{passport_id}/landing-view`, by the holder alone and on a
read-only passport too, and it writes no commit. It lives on the row rather than
in the repository because it is a preference about showing the record, not part
of the record, so it is neither exported nor hashed.

## Authorisation

Two independent questions, and passing the first says nothing about the second.

- **`requires_feature("passport")`** - is the passport switched on for this
  person's organisation or site? It takes every org unit they belong to and the
  organisation above each, which is why an
  invited external assessor passes at either level.
- **Who may read this particular record** - resolved from the passport row and
  the request rows naming the caller. `_require_holder` for anything only the
  holder may do; `_require_reader` for reading the passport as a whole, which
  is also the holder alone; `_require_signoff_reader` for the holder or the
  assessor named on that one sign-off.

An accepted external assessor passes the feature gate and still gets a 404 on a
holder's passport; a request naming them opens that one sign-off and nothing
else. Organisation admins are
deliberately not readers yet - how "admin of the holder's organisation" should
be evaluated is being settled elsewhere, and inventing a scope here that that
work then changes would be worse than the narrower rule.

### Reading your own, wherever you work

The feature gate is waived for one case: a `GET` on the caller's own
passport, which is `/me` and anything beneath a `/{passport_id}` they hold.
Reading and exporting a passport come from owning it, so a holder who
belongs nowhere the passport is switched on can still open their record and
take it with them. Every write stays behind the gate, and
`entitlement.can_write` is false for them, so the pages show the record as
read-only.

### Passport cover

`passport_write` is held by entitlement. One way to get it is to belong to an
org unit whose cover is switched on: a `passport_write` feature row beside the
`passport` one, which only a superadmin may set. `cover.py` grants writing to
that org unit's `staff` and `trainee` members, and to anyone an administrator
adds in those capacities afterwards. A member of staff who leaves keeps it; a
trainee who is removed loses it. Switching cover off ends every grant it made.
A site may hold features, so cover can be on for one team without its whole
trust.

### Passport professions

An organisation can use the passport with clinical services switched off, so
four base professions exist for it alone, none of which needs clinical
services:

- **`passport_delegate`** - holds a passport and signs off other people's,
  through `assess_clinician_passport`. Writing to their own passport needs
  `passport_write`, which comes only from an organisation's enablement or an
  individual subscription.
- **`passport_clinical_lead`** - the clinician who leads the passport at
  their organisation or site. A label: it holds exactly what a delegate
  holds.
- **`passport_admin`** - holds `manage_passport`, a scoped manager that
  may give the four passport professions and grant
  `assess_clinician_passport`, at the org units its holder belongs to. It
  never needs `manage_users`. It may also give and take `passport_write`
  for members of its own org units, and it is the only whitelist allowed
  to name it. It holds `assess_clinician_passport` and `passport_write`
  too, so an admin may open the passport and keep one of their own. It is
  the only profession that carries `passport_write`.
- **`passport_external_assessor`** - given to a clinician from elsewhere who
  accepts an invitation to sign off one competency. Until 30 September 2026
  its id was `external_assessor`.

See `docs/docs/plans/2026-09-30-passport-professions-plan.md`.

**Exports and reflections are holder-only.** The zip copies the canonical files
including reflections, so it could never be anything else; the Markdown and PDF
could in principle be read by a named assessor, but an export hands over a
whole passport in one call, which is a different thing from reading the
sign-off you were named on. The Markdown export takes `?reflections=true` and
defaults to off, because a rendering handed to a panel or an employer must not
carry one by accident.

## Export

Three routes, over work in `export.py`:

- **`export.md`** - the whole passport as Markdown, for reading.
- **`export.pdf`** - for printing or handing over. Never carries reflections,
  and says so on the page.
- **`export.zip`** - the portable bundle, and the one that matters. Canonical
  files, both renderings, a `README.md` written for somebody who has never seen
  this system, `VERIFY.md` explaining how to check the hashes, and
  `passport.bundle` - a `git bundle` of the full history, which is the only
  file carrying who changed what and when.

A failed rendering is logged and skipped rather than raised: the record is
already in the archive by that point, and denying somebody the whole export
because a PDF broke would be the wrong trade.

## Storage backends

`PASSPORT_GCS_BUCKET` decides. Set means the bucket backend; unset means a
local directory under `PASSPORT_LOCAL_ROOT`. There is deliberately no second
setting naming "local" or "gcs" - a switch that looks like a switch and is not
is worse than no switch.

Evidence blobs always follow the passports, because a record naming a hash the
store cannot resolve is a broken reference.

The bucket backend uses generation-based compare-and-swap on a git bundle
rather than a mounted volume: the deployment has no shared filesystem, and two
concurrent writes must not silently lose one.

## Where the code is

- `backend/app/features/passport/` - the module. `router.py` is the route list,
  `store.py` and `gcs_store.py` the two backends, `blobs.py` content-addressed
  evidence, `export.py` the bundle, `render.py` and `pdf.py` the views.
- `backend/app/schemas/passport.py` - the API contract, separate from
  `features/passport/schemas.py`, which models what a file contains. They look
  similar today and answer to different rules: one is additive-only at the wire
  boundary, the other is validated on read as well as write.
- `backend/app/passport_storage.py` - the composition point, and the only place
  that knows how a backend is chosen. It sits outside the feature package
  because the passport's pure core under `features/passport` must import without
  `app.config`, so a passport on disk stays readable by tooling with no
  application around it.

## What the passport does not do

- **It does not grant access.** See
  [Clinician passport and CBAC](../../concepts/clinician-passport.md).
- **It does not judge sufficiency.** Counts are returned; targets, percentages
  and ready-or-not verdicts are not. How many procedures is enough belongs to
  the assessor, and an API that appeared to have decided first would invite
  them to defer to it.
- **It does not act on expiry.** `expires_on` is recorded and nothing reads it,
  because what a lapsed sign-off implies is a clinical decision rather than a
  technical one.
- **It does not verify a registration.** A registration is recorded as
  declared. Quill checks no register itself,
  and the response says so rather than implying otherwise.
