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

The cost is that some questions files cannot answer, which is why one table
exists — see [Coordination](#coordination-in-postgres) below.

## The shape of a passport

```text
  <passport_id>/
    manifest.yaml          schema version, nothing else
    profile.yaml           who this is, and their registrations
    competencies.yaml      the derived index — rebuildable, never authoritative
    sign-offs/             one folder per sign-off, the countersigned records
    logbook/               procedures performed, by competency
    certificates/          courses and qualifications claimed
    cpd/                   continuing professional development, by year
    reflections/           holder-only prose
    files/                 evidence blobs, gitignored, addressed by hash
```

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

The API and the interface both refuse to blur these. A certificate form shows
no declaration and no assessor, and a test pins that it never will.

`kind` on a sign-off is derived rather than chosen by a caller — letting one be
picked would allow a progression to be recorded as a correction, quietly
implying an earlier assessor had been wrong.

## Which competencies, and in what order

A passport records skills, never software permissions. Two separate
mechanisms decide what a holder is offered, and only the first refuses
anything.

- **`assessable: true` on a competency** in `shared/competency-definitions/`
  says somebody could watch it being done and sign it off. It is opt-in,
  so a permission such as `manage_users` stays out unless somebody decides
  otherwise. `ASSESSABLE_COMPETENCY_IDS` holds the active ones, and
  `definitions.assessable_ref` refuses anything else when a record is
  created: a sign-off request, logbook entry, certificate, reflection or
  CPD entry. Amending an existing record keeps the looser check, and
  reading never checks at all, so a competency withdrawn later leaves old
  records intact.
- **A holder's specialties** order the competency picker and do nothing
  else. Each specialty is one file in `shared/passport-specialties/`
  listing its common competencies in order, loaded and checked at startup
  by `specialties.py`: every listed id must exist, be assessable and not
  be retired. The holder's choice lives in `profile.yaml` as `{id, name}`
  pairs, so an export reads correctly with no Quill. An empty list is
  Generic, meaning no specialty order, and a specialty id Quill no longer
  knows is kept rather than refused on read.

See the [passport specialties plan](../../plans/2026-09-26-passport-specialties-plan.md).

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
  comparing with the filename is the whole check — which is what lets
  `VERIFY.md` in the export offer something a holder can run with no software.

**This is why evidence uploads pass through the application.** The address
cannot be computed without reading every byte, so the signed-URL pattern the
teaching videos use — where the browser uploads straight to GCS and the backend
never sees the file — cannot work here. A video is addressed by a generated id,
so nobody needs to look inside it; a passport blob is addressed by its content.

Size and type are checked at the route rather than in the store:
`ALLOWED_EVIDENCE_TYPES` in `router.py` admits PDF, JPEG, PNG, HEIC and WebP,
and the global 10 MB request-body limit applies. Storing is separate from
admitting.

## Coordination in Postgres

One table, `passport_signoff_request`, and it is workflow rather than a copy of
the record.

An assessor's inbox is a cross-passport query — "what have I been asked to
sign?" — and no single repository can answer it. The row is the ask; each
record is read from its own passport. It closes when the file is written.

This is the only concession to the database, and deliberately not a projection:
nothing reads it to learn what a passport contains.

## Authorisation

Two independent questions, and passing the first says nothing about the second.

- **`requires_feature("passport")`** — is the passport switched on for this
  person's organisation or site? It unions organisation membership with site
  membership joined back up through `organisation_site`, which is why an
  invited external assessor passes at either level.
- **Who may read this particular record** — resolved from the passport row and
  the request rows naming the caller. `_require_holder` for anything only the
  holder may do; `_require_reader` for the holder or somebody named on a
  request against them.

An accepted external assessor passes the feature gate and still gets a 404 on a
holder's passport unless a request names them. Organisation admins are
deliberately not readers yet — how "admin of the holder's organisation" should
be evaluated is being settled elsewhere, and inventing a scope here that that
work then changes would be worse than the narrower rule.

**Exports and reflections are holder-only.** The zip copies the canonical files
including reflections, so it could never be anything else; the Markdown and PDF
could in principle be read by a named assessor, but an export hands over a
whole passport in one call, which is a different thing from reading the
sign-off you were named on. The Markdown export takes `?reflections=true` and
defaults to off, because a rendering handed to a panel or an employer must not
carry one by accident.

## Export

Three routes, over work in `export.py`:

- **`export.md`** — the whole passport as Markdown, for reading.
- **`export.pdf`** — for printing or handing over. Never carries reflections,
  and says so on the page.
- **`export.zip`** — the portable bundle, and the one that matters. Canonical
  files, both renderings, a `README.md` written for somebody who has never seen
  this system, `VERIFY.md` explaining how to check the hashes, and
  `passport.bundle` — a `git bundle` of the full history, which is the only
  file carrying who changed what and when.

A failed rendering is logged and skipped rather than raised: the record is
already in the archive by that point, and denying somebody the whole export
because a PDF broke would be the wrong trade.

## Storage backends

`PASSPORT_GCS_BUCKET` decides. Set means the bucket backend; unset means a
local directory under `PASSPORT_LOCAL_ROOT`. There is deliberately no second
setting naming "local" or "gcs" — a switch that looks like a switch and is not
is worse than no switch.

Evidence blobs always follow the passports, because a record naming a hash the
store cannot resolve is a broken reference.

The bucket backend uses generation-based compare-and-swap on a git bundle
rather than a mounted volume: the deployment has no shared filesystem, and two
concurrent writes must not silently lose one.

## Where the code is

- `backend/app/features/passport/` — the module. `router.py` is the route list,
  `store.py` and `gcs_store.py` the two backends, `blobs.py` content-addressed
  evidence, `export.py` the bundle, `render.py` and `pdf.py` the views.
- `backend/app/schemas/passport.py` — the API contract, separate from
  `features/passport/schemas.py`, which models what a file contains. They look
  similar today and answer to different rules: one is additive-only at the wire
  boundary, the other is validated on read as well as write.
- `backend/app/passport_storage.py` — the composition point, and the only place
  that knows how a backend is chosen. It sits outside the feature package
  because every module under `features/passport` must import without
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
- **It does not verify a registration.** `verified` stays false until an
  organisation admin has checked a register by hand. Quill checks none itself,
  and the response says so rather than implying otherwise.
