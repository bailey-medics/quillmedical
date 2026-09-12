# Features — Clinician passport

A portable record of assessed clinical competence: what the holder has been
signed off to do, by whom, when, and on what evidence.

The storage design is the thing to understand before reading the code. A
passport is **a git repository of YAML and Markdown**, one per holder, that the
holder can carry between trusts. The files are canonical. The database holds
only two things files genuinely cannot answer — where a repository is, and who
has been asked to sign what — so there is deliberately no sign-off table, no
per-competency status table and no cached progress.

Two properties run through every module below.

**Trust is recorded, never inferred.** A professional registration is
*declared* until somebody checks a register, and the model says so with an
explicit flag rather than by omission. A sign-off records which of three
clinically different acts it was — directly observed, reviewed evidence, or
countersigned — because a record that does not distinguish them is weaker than
it looks.

**Evidence is counted, never judged.** The passport reports thirty-eight logged
procedures and stops. No target, no progress bar, no "requirements met". How
many is enough is a clinical judgement belonging to the assessor, and a system
that appeared to have decided first would invite them to defer to it.

## Router

::: app.features.passport.router

## Service

The sign-off lifecycle: request, sign, decline, withdraw, supersede. Each is
one validated write and one commit.

::: app.features.passport.service

## Records

Self-declared evidence — certificates, logbook entries, reflections and CPD.
Editable by their holder, unlike a sign-off, because a mistyped date should be
fixable in seconds. The difference follows from who is accountable for each.

::: app.features.passport.records

## Record model

What a passport file is allowed to contain, validated on the way in *and* on
the way out. Validating on read matters more than it looks: a passport is a
portable directory somebody may have hand-edited, restored from a backup, or
carried between deployments, and a half-parsed clinical record is worse than
one that refuses to load.

::: app.features.passport.schemas

## Database models

::: app.features.passport.models

## Storage

::: app.features.passport.store

### Cloud Storage backend

Each passport is held as a single `git bundle` object, with evidence blobs
beside it. The generation read at download is asserted at upload, which is the
bucket's equivalent of asserting HEAD and catches two instances writing one
passport at once.

::: app.features.passport.gcs_store

### Choosing a backend

::: app.passport_storage

## Evidence blobs

Content-addressed storage: a blob's name *is* the hash of its bytes, so the
same file stored twice is one file, a blob cannot be replaced, and corruption
is detectable with no extra data.

::: app.features.passport.blobs

## Content hashing

A sign-off's fingerprint, over a canonical serialisation of the semantically
significant fields only. Reformatting the YAML or fixing a typo in a comment
must not change it; changing the level, the dates or the assessor must.

::: app.features.passport.hashing

## Derived index

`competencies.yaml`, regenerated on every write and never hand-edited. If it
ever disagrees with the directories beneath, they win and it is rebuilt.

::: app.features.passport.index

## Commit messages

::: app.features.passport.commits

## Paths

::: app.features.passport.paths

## Identifiers

::: app.features.passport.ids

## Serialisation

::: app.features.passport.serialise

## Competency definitions

::: app.features.passport.definitions

## Locking

::: app.features.passport.locking

## API schemas

The wire contract, deliberately separate from the record model above. Held to
the additive-only rule in `.claude/rules/backend.md`: returning the record
models directly would make every on-disk format change a breaking API change.

::: app.schemas.passport
