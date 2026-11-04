# Passport record and catalogue plan

A clinician passport reads from two places. The git record holds what was
signed off: every sign-off stores the competency's id and the words shown at
the time (`CompetencyRef`), and the level's words too (`LevelRef`). The
catalogue in `shared/competency-definitions/` holds what each framework asks
for today. Both are right, for different questions, but nothing says which
one the page should show, frameworks have no versions, and one file,
`clinical.yaml`, uses the same id for an app permission and for a competency
a passport records. So a reworded competency shows its new words beside a
sign-off given under the old ones, a retired competency vanishes from its
table along with its sign-off, and the git record files a competency's
sign-offs and its logbook in two unrelated places.

The outcome is a set of rules, written down and enforced. Every competency a
passport records belongs to a framework, which anybody may publish, Quill
included, and its id starts with that framework's id. App permissions stay
outside frameworks. A framework has a version number that goes up by one
with every change and goes live when it merges, as teaching banks do, and
every sign-off records the version it was given under. The record keeps its
own words and the page shows them where they differ from today's. And a
passport's git repository is laid out framework first:
`frameworks/<framework>/<competency>/`, with that competency's `sign-offs/`
and `logbook/` inside. Then the frameworks leave this repository: each
publisher's go into a `-framework` repository of its own, synced into the
app on merge as teaching content is, while permissions stay here as code.

**Each rule is written into the docs by the phase that makes it true**, never
ahead of it. A docstring describing behaviour the code did not have is what
led this plan's first draft to describe teaching versions wrongly, so Phase 1
writes down only what already holds, and every later phase ends by updating
the docs for what it built.

**There are no real passports in App production yet**, as of 2 November
2026, so nothing here has to keep an existing record readable or move one.
The only passports are the dev seed and the end-to-end fixtures, which are
rebuilt rather than migrated. Where that shortens a step, the step says so.
**If real passports are created before a phase lands, that phase's
shortcuts no longer hold**, and it needs its compatibility step back before
it is built.

## Phase 1: Write down what is already true

- [x] **State the record and the catalogue as two sources, in the passport
      backend page**, `docs/docs/backend/passport/index.md`, as its own
      section. The catalogue answers "what does this framework ask for
      today": which rows a table lists, their current names, and what a
      framework is called. The record answers "what was signed off, in what
      words, on that day": a sign-off's competency, level and scope words,
      stored beside their ids and never rewritten. Neither replaces the
      other. The framework's name is the one stored word the page
      overrides, through `current_name`, since #2321.
- [x] **Say what a catalogue change does today**, in the same page, one
      bullet each:
      - **Adding a competency** gives every passport working to that
        framework a new "Not asked" row, and nothing recorded changes.
      - **Removing a competency** means retiring it with `retired_on`,
        never deleting it, so a record against it still opens:
        `check-competencies-not-deleted.sh` fails CI on a deleted id.
      - **Rewording a competency is allowed only when the meaning is
        unchanged**: a typo, a capital letter. A change of meaning is a new
        id, because otherwise an old sign-off appears to certify words
        nobody signed.
      - **A publisher's new edition is a new framework**, with a new id and
        a new file, such as `uk_sact_board_2026`.
      - **Renaming a framework changes no sign-off.** Its name says what the
        document is, not what anybody signed.

## Phase 2: Every competency a passport records under a framework, with its prefix

- [x] **Require every framework's ids to start with the framework's id**,
      in the loader in `backend/app/cbac/competencies.py`. It checks this
      today for the three oncology frameworks only. Extending it to every
      framework is what makes two standards' cannulation two ids, and what
      makes the folder in Phase 4 safe: a prefixed id can never move to a
      different framework.
- [x] **Split `clinical.yaml` into its two jobs.** Its 19 assessable
      entries are both granted permissions and the competencies of Quill's
      own "General clinical skills" framework, under one id each, such as
      `perform_cannulation`. Keep the permissions under their current ids
      and take `assessable` off them, so who may do what in the app does
      not change. Give the framework its own copies with prefixed ids, such
      as `clinical_perform_cannulation`, in Quill's words. Quill stays the
      publisher: it may publish a framework like anybody else.
- [x] **Point the seed and the fixtures at the new ids.** With no real
      passports, no record anywhere holds a sign-off against
      `perform_cannulation` that has to stay readable, so the new entries
      need no `replaces` list naming the old ids. The dev seed, the
      end-to-end fixtures and the unit-test fixtures that record against a
      `clinical` id move to its prefixed copy.
- [x] **Treat every framework as passport-only, and drop the
      `passport_only` flag.** Agreed with the product owner on 2 November
      2026. Today the three oncology frameworks carry `passport_only: true`,
      and the loader refuses their competencies wherever a competency is
      granted. `clinical` is the one framework without it, because its
      competencies are also permissions the code checks. Once the split
      above is done, nothing is lost by refusing them too, and a flag every
      framework must carry says nothing. So the loader refuses the
      competencies of any file with a `framework:` block as grants and on
      any `may_grant` list, and leaves them out of every admin picker. The
      flag comes out of the three framework files, the framework model in
      the loader, the generated types and the frontend that reads it.
- [x] **Keep the first oncology list, `retired-oncology.yaml`, as it is.**
      Departed from the plan, 2 November 2026, while building this phase.
      The plan said to delete it, since no real passport holds a record
      against it. But `check-competencies-not-deleted.sh` fails CI on any
      removed id and, by design, offers no approval: deleting an id
      "destroys the vocabulary the audit trail needs". Weakening that check
      for one file is a worse trade than keeping sixteen retired entries.
      Nothing is lost by keeping them: every entry is retired, so nothing
      new is recorded against one, and every competency a passport can
      still record sits under a framework. Phase 4 needs no folder for
      orphans, because no record exists against one.
- [x] **Write the rules this phase makes true**, in the passport backend
      page and in `.github/copilot-instructions.md` under CBAC, then
      `CLAUDE.md` through the sync, replacing what the CBAC section says
      today about `passport_only`:
      - **Every competency a passport records belongs to a framework.** A
        framework is a published standard, and anybody may publish one: a
        trust, a college, a national board, or Quill. Standards for the
        same procedure differ between doctors, nurses and phlebotomists,
        and nobody will agree on one, so Quill never maps one framework's
        competency onto another's. The same procedure under two frameworks
        is two competencies with two ids, each starting with its
        framework's id.
      - **App permissions are not under that rule.** A permission, such as
        `manage_users`, `passport_write` or
        `prescribe_controlled_schedule_2`, is a key an admin hands out that
        lets somebody use part of the app. No published standard holds it,
        so putting it under a framework would mean inventing one to hold
        it. Agreed with the product owner on 1 November 2026.
      - **Permissions are code.** The backend names them in
        `has_competency("manage_users")`, the frontend in
        `<RequireCompetency>` and `useHasCompetency`, and the frontend's
        `CompetencyId` type is built from them. So they stay in this
        repository, built into both, and they are the only competencies
        that let anybody do anything in the app.
      - **Framework competencies are content.** No application code names
        one; only tests do. They are recorded in passports and never
        granted, Quill's own included, so where they come from cannot
        change who may do what.
      - **A sign-off never unlocks an ability by itself.** If one ever
        should, an organisation links the two inside the app, as an
        audited decision of its own. See the Decisions section.
- [x] **Put the prefix rule in the header of every framework file**:
      `uk_sact_board_2023.yaml`, `ruh_sact_passport.yaml`,
      `ghnft_radiotherapy_record.yaml` and `clinical.yaml`.
- [x] **Tests**: the loader refuses an unprefixed id in any framework; a
      `clinical` framework competency is refused as a grant and on a
      `may_grant` list, with no `passport_only` flag anywhere; a permission
      keeps its grant after losing `assessable`; no competency a passport
      can record is outside a framework. The split itself is the
      `clinical-permissions.yaml` file beside `clinical.yaml`: the
      permissions kept their ids there, and the framework took
      `clinical.yaml`, so its id and every organisation's lead framework
      naming `clinical` stay as they were.

## Phase 3: Framework versions, as teaching banks have

The teaching repositories already do this, and it works. Each question bank
version is numbered and kept. When a pull request merges, the sync runs, and
`_serve_newest_version` in `backend/app/features/teaching/sync.py` moves every
organisation already using that bank onto the newest version at once. Each
attempt records the version it was started on (`bank_version`), and
`check_version_lock.py` in `backend/app/features/teaching/tooling/` fails CI
when a live bank's questions change without the version going up by one.
Frameworks copy that shape, with the same word: `version`.

- [x] **Make `version` the number Quill bumps, and move the publisher's
      edition into a `description` field.** Today each framework block's
      `version:` holds the publisher's label for the edition, "Pilot" or
      "November 2023". Two things called version is how this plan first
      confused them, so the label leaves that field for good. It goes into
      a new free-text `description:` in the framework block, such as
      "Pilot edition" or "Published November 2023", and `version:` becomes
      a whole number: 1, 2, 3. Agreed with the product owner on 2 November
      2026. Touches every framework file, the framework model in the loader,
      the generated types and anything that shows the old label. Built so:
      the framework pickers now show a framework's name and publisher
      only, since `description` is shown to nobody. The framework list
      route, `GET /api/passport/frameworks`, keeps its `version` field as
      text holding the old label, read from `description`, because
      changing its type would break an open tab; nothing reads it, and a
      later deploy removes it. `version` is a strict whole number, so a
      quoted `"2"` is refused.
- [x] **Set the versions already made.** The Gloucestershire record went
      from seven competencies to fifteen, and was renamed, in #2321, so it
      is version 2. Every other framework starts at version 1.
- [x] **A new version goes live when it merges.** No admin step and no
      per-organisation pointer: the framework file deploys with the code,
      as it does today.
- [x] **No draft status.** Teaching modules have one, at which the version
      stays 1 and anything may change. Frameworks do not: a framework is
      offered as soon as it merges, and every change after that bumps the
      version. Agreed with the product owner on 2 November 2026.
- [x] **Record the version on every sign-off**, as `framework_version` in
      `SignOff` in `backend/app/features/passport/schemas.py`, beside
      `competency`. It is a copy of the framework's `version` on the day the
      sign-off is written, and never changes after, as an attempt's
      `bank_version` copies its bank's. The longer name says whose version
      it is: a sign-off can be corrected by a later one (`corrects`), so a
      bare `version` would read as the sign-off's own. A sign-off stores no
      framework id, and needs none: after Phase 2 the competency's prefix
      names its framework. With no real passports, the field is required
      from the start, and the seed and fixtures are written with it. It
      counts towards the content hash, in `CONTRIBUTING` in
      `backend/app/features/passport/hashing.py`, since the same words
      under two versions are two claims; no signed record existed whose
      fingerprint that could change.
- [x] **Mark which version a competency left in**, as `retired_in_version`
      on an entry beside `retired_on`, so the page can say "Not in this
      framework since version 3". A competency removed from the current
      version is retired, never deleted.
- [x] **Check in CI that a framework's version goes up by exactly one
      whenever the framework changes**, modelled on `check_version_lock.py`
      and comparing each framework file with `origin/main`. Build it where
      teaching's check lives, as a tool in
      `backend/app/features/passport/tooling/` taking a folder of framework
      files, so the framework pipeline in Phase 6 calls the same code
      against a framework repository rather than a second copy. Agreed with the
      product owner on 2 November 2026: anything simpler to explain is
      better than anything cleverer, so the check compares the file's
      parsed content, not its text, and any difference at all needs the
      bump. Two kinds of change need none: comments and spacing, which are
      not parsed content, and the framework's `description`, which is
      internal and shown to nobody signing anything, so the check leaves
      that one field out of the comparison. Everything else needs the
      bump, including, among others:
      - **a competency added, retired or reworded**, typo fixes included,
        because no check can tell a typo from a change of meaning ("by"
        and "bye");
      - **a competency becoming assessable, or no longer assessable**;
      - **a level or scope added, removed, renamed or reordered**;
      - **competencies reordered** in the file, since the order is the
        order of the table;
      - **the framework's name, publisher or specialties changed**. The
        specialties decide who is offered the framework rather than what
        is signed, but a rule with one exception is easier to keep than a
        rule with three.
      Refused outright, whatever the version:
      - **a competency's id changed, or a competency deleted**, which
        `check-competencies-not-deleted.sh` already refuses;
      - **the framework's id changed**, since a new edition is a new
        framework;
      - **the version going down, or up by more than one**, as teaching
        refuses.
      A new framework file starts at version 1 and needs no bump.
- [x] **Print every reworded competency, pass or fail.** The check writes
      the old and new words of every `display_name`, level `name` and scope
      `name` that changed on an existing id into the job summary, whether
      the version went up or not. A change of meaning needs a new id, not
      just a new version, and only a person can tell which it is, so the
      reviewer needs both wordings in front of them on every pull request
      that rewords anything. This replaces a separate rewording check: the
      version check already stops every reword, so it is the place to show
      it.
- [x] **One framework change per stack.** The check compares with
      `origin/main`, so in a stack whose two branches both change one
      framework, the upper branch is two versions ahead of `main` and fails
      as a jump. While frameworks live in this repository, the check's
      message says so: land the branch below first, then make the second
      change. My reading, from the product owner's decision on 2 November
      2026 that framework repositories do not use stacks at all: until
      frameworks move out, this repository keeps its stacks, so the rule
      narrows to one framework change per stack.
- [x] **Write the rules this phase makes true**, in the passport backend
      page and the header of every framework file: every change except
      comments, spacing and the `description` bumps the version by exactly
      one; a version goes live on merge; every sign-off records its
      `framework_version`; a removed competency records its
      `retired_in_version`.
- [x] **Tests**: a sign-off records the current version, and one without
      it is refused; the CI check fails on an added competency, a reordered
      scope and a renamed framework with an unchanged version, and passes
      once the version goes up by one; it fails a jump of two and a version
      going down; it passes a change to comments only, and a change to
      `description` only; it passes a new framework at version 1; it prints
      a reworded competency's old and new words when it passes and when it
      fails.

## Phase 4: Lay the git record out framework first

Each sign-off covers exactly one competency (`SignOff.competency` is a single
`CompetencyRef`), and after Phase 2 each competency sits under exactly one
framework, so the record can be one tree. The docstring in
`backend/app/features/passport/paths.py` says sign-offs are flat because they
"legitimately span several competencies"; that is true of certificates only.

```text
<passport_id>/
  manifest.yaml
  profile.yaml
  competencies.yaml                    derived index
  README.md
  frameworks/
    ghnft_radiotherapy_record/
      ghnft_radiotherapy_record_refer_palliative/
        sign-offs/
          2026-03-14/
            sign-off.yaml
            assessment.md
            reflection.md
        logbook/
          2026-03-12-101500.yaml
    uk_sact_board_2023/
      uk_sact_board_2023_prescribe_sact/
        sign-offs/
          2026-04-02-lung/             scoped: the date, then the scope
            sign-off.yaml
        logbook/
          2026-03-20-143000.yaml
  certificates/                        stays flat: one may cover several competencies
  cpd/                                 stays by year: tied to no competency
  reflections/                         stays flat: the holder's own prose
  files/                               gitignored evidence
```

- [x] **Build the new paths in `paths.py`**: `framework_dir`,
      `competency_dir`, and the sign-off and logbook paths beneath them.
      Folder names are the ids exactly, prefix and all, keeping the rule
      that a competency folder is named by its id.
- [x] **Name a sign-off folder by its date**, then its scope where it has
      one, then `-2` or higher for a second on the same day. Its parent
      already names the competency, so the slug of a long statement, and
      the eighty-character cut it needed, both go.
- [x] **Find a competency's folder by looking, never by working it out from
      the catalogue.** To read a competency, the store looks for
      `frameworks/*/<competency_id>/`. New records go under the
      competency's current framework. A record therefore stays readable
      wherever it was written, and the index brings every folder for one id
      together. With Phase 2's prefixes a competency cannot change
      framework, so this is a safeguard rather than an expected case.
- [x] **Identify a sign-off as `<competency>.<folder>`.** Not in the plan,
      found while building: a sign-off's folder name was also its id, held
      in Postgres as `signoff_id` and in every sign-off address in the API.
      Once the folder is only a date inside its competency's folder, that
      name is no longer unique in a passport. Joining the competency id
      and the folder with a dot keeps it unique, safe in a web address,
      and split back apart by `paths.split_sign_off_id`; neither half can
      hold a dot. The frontend treats the id as opaque, so it changed
      nothing there.
- [x] **Correct the `paths.py` docstring** on why sign-offs were flat.
- [x] **Switch to the new layout outright, with no move job.** With no
      real passports there is nothing to move: the readers and writers use
      the new layout only, the manifest's `schema_version` goes up by one so
      a passport in the old layout is refused rather than misread, and the
      dev seed and the fixtures are rebuilt in the new one.
- [x] **Update the layout in the passport backend page**, which draws the
      tree, and the README written into every passport, which explains it
      to somebody with no Quill.
- [x] **Tests**: the new paths refuse an unsafe id; a sign-off and a
      logbook entry land under their framework and competency; a record
      written under one framework folder is still found by its id; a
      passport at the old `schema_version` is refused.

## Phase 5: Store frameworks in the database, filled by a sync

The teaching path is the model for Phases 5 to 8. A content repository's
thin workflow calls `.github/workflows/teaching-pipeline.yml` in this
repository, which validates each pull request and, on merge to `main`,
deploys the content to GCS and starts the backend's sync job;
`sync_question_bank` in `backend/app/features/teaching/sync.py` then writes
it into the database, keeping every version. Frameworks follow the same
road. This phase builds the far end first, fed from the framework files
still in this repository, so nothing changes for anybody until it works.

- [x] **Tables for frameworks, with every version kept**, in
      `backend/app/models.py`, then `just migrate`: one row per framework,
      one per version of it, and beneath each version its competencies,
      their levels and their scopes, each in its own table with a foreign
      key. Every version is stored whole, as teaching stores each bank
      version, so "what did version 1 ask for?" is a query, and Phase 10
      can show a retired competency's last words. No JSON columns: every
      one of these is pointed at, by a sign-off's ids or by the table
      rows, so each is a relationship and wants a table.
- [x] **A framework sync**, in `backend/app/features/passport/sync.py`,
      shaped like `sync_question_bank`. It reads a folder of framework
      files, validates each with the loader's existing rules (Phase 2's
      prefix rule among them), and writes a new version only when the
      file's `version` is higher than the newest stored. It is the only
      writer of the framework tables, it is safe to run twice, and it
      records each run, as `QuestionBankSync` does.
- [x] **Refuse in the sync what CI refuses today**, since a framework
      repository will not have this repository's CI: a competency id that
      is a permission's id, or another framework's; a competency deleted
      rather than retired, judged against the newest stored version; and
      a version that skips or goes down. Phase 3's checks stay in CI too,
      so a mistake is caught at review and again at the door.
- [x] **Run it in the pre-deploy migrations job and in the seed**,
      not at start-up. Departed from the plan, 2 November 2026, while
      building it: several Cloud Run instances start together and would
      race to write the same version, while the migrations job
      (`run-migrations` in `backend/scripts/admin_cli.py`) runs once,
      before the new revision serves, and a refusal there blocks the
      deploy as a failed migration does. Dev runs it at the end of the
      migrate recipe. Originally: reading the framework files
      still in `shared/competency-definitions/`, so the tables fill in dev,
      in `backend/scripts/seed_ci.py` for the end-to-end stack, and in App
      production on deploy. Nothing reads the tables yet.
- [x] **Document the tables and the sync** in the passport backend page.
- [x] **Tests**: the sync stores a framework and its competencies, levels
      and scopes; a second run changes nothing; a higher version adds a
      version and keeps the old one; it refuses a clash with a permission,
      a deleted competency and a skipped version.
- [x] **Name the missing version when the sync refuses a skip.** Found on
      3 November 2026: a version the sync never saw blocks every later
      deploy (see "Every version is kept where the sync can read it" under
      Decisions). Until Phase 6 lets the sync catch up, its message says
      which versions the tables lack, such as "the tables hold version 2,
      the files version 4: version 3 is missing", and how to rebuild it from
      git history while the frameworks still live in this repository. Test
      the message.

## Phase 6: A repository for each publisher

- [ ] **Create the four repositories**, after asking the product owner
      before each, because creating one is visible outside this machine.
      One per publisher, each ending `-framework`, as each teaching
      repository ends `-teaching`, under `bailey-medics`. Each is named
      from its framework's title, shortened to stay readable and inside
      GitHub's 100-character limit. Agreed with the product owner on
      2 November 2026:
      - **`gloucestershire-radiotherapy-record-framework`** - for
        `ghnft_radiotherapy_record`, Gloucestershire Hospitals NHS
        Foundation Trust.
      - **`royal-united-hospitals-bath-sact-passport-framework`** - for
        `ruh_sact_passport`, Royal United Hospitals Bath NHS Foundation
        Trust.
      - **`uk-sact-board-prescribing-framework`** - for
        `uk_sact_board_2023`, the UK SACT Board.
      - **`general-clinical-skills-quill-medical-framework`** - for
        "General clinical skills", the framework half of `clinical.yaml`
        after Phase 2's split, Quill Medical.
- [ ] **Lay each one out like a teaching repository**: a `frameworks/`
      folder holding one file per framework, a README saying what the
      repository is and who publishes it, the publisher's licence for the
      wording, and the `cspell.config.json` the teaching repositories
      carry.
- [ ] **Protect them in Terraform**, beside `infra/github/teaching_rulesets.tf`
      and the repository list in `infra/environments/app/terraform.tfvars`:
      the same rules, the same required checks, and no stacks, so each
      change is one branch off `main` and one pull request.
- [ ] **A framework pipeline**, `.github/workflows/framework-pipeline.yml`,
      shaped like `teaching-pipeline.yml`: on a pull request it validates
      the files and runs Phase 3's version check from
      `backend/app/features/passport/tooling/`, printing every reworded
      competency; on merge to `main` it uploads each framework version as
      a file of its own, `frameworks/<framework>/<version>.yaml`, and
      starts the backend's framework sync. A version is one file, so it
      needs no folder. A version's file is never overwritten or deleted,
      so the bucket holds every version ever merged.
      **The upload heals itself from git history.** A dropped or failed
      run would otherwise leave its version out of the bucket for good.
      So each run checks out the repository's full history, lists the
      versions the bucket already holds, and uploads every missing one
      from the commit on `main` that set it, not only the newest. Any
      later run then fills the gap. Test it with a stubbed bucket: a run
      that finds two versions missing uploads both, and a run that finds
      none uploads nothing.
      Each repository carries a thin caller, as the teaching repositories
      do. Its job names are fixed for the same reason teaching's are: the
      rulesets require checks by name.
- [ ] **The sync catches up on every version it lacks**, reading the
      version files in order, from one above the newest it has stored to
      the newest in the bucket. Each version is checked against the one
      before it with the same rules as today, and the run still writes all
      of them or none. A version missing from the bucket itself is still
      refused, naming it: the next pipeline run uploads it, and the sync
      after that succeeds. Test a run that finds two new versions, and one
      that finds a gap in the bucket. This replaces reading only the newest
      files, for the reason under "Every version is kept where the sync can
      read it" in Decisions.
- [ ] **A framework sync job and somewhere to deploy to**, in `infra/`,
      copying teaching's. The teaching pipeline signs in as
      `content_ci_service_account` (`infra/environments/app/terraform.tfvars`),
      writes into `quill-images-app`, and starts the `teaching-sync` Cloud
      Run job in `infra/main.tf`, whose one action is fixed in its own env
      so the pipeline needs only `roles/run.invoker`. Frameworks get the
      same: a `framework-sync` job with its action fixed, a place in a
      bucket the content account may write, the backend's read of it, and
      the content account allowed to start the job. Never the admin job
      with an override: the role that allows overrides allows any action,
      `create-superadmin` among them. See
      `docs/docs/plans/2026-10-16-teaching-sync-without-a-github-secret-plan.md`.
- [ ] **Let the four repositories sign in as the content account.**
      Which repositories may do so for teaching is not in this repository's
      Terraform, as far as a search on 2 November 2026 found: the account
      lives in a different project from the bucket. Find where the
      teaching repositories are allowed, and add the four beside them; if
      it is set by hand, say so to the product owner rather than guessing.
- [ ] **Give the login that pushes them the `workflow` scope** first:
      GitHub refuses a push that adds a file under `.github/workflows/`
      without it, and the caller workflow is one. The product owner runs
      `gh auth refresh -s workflow` once.
- [ ] **Document the repositories and the pipeline**, in a framework page
      beside the teaching ones in `docs/docs/teaching/`, or under the
      passport backend page.

## Phase 7: Read frameworks from the database

- [ ] **Point the backend's framework lookups at the tables**:
      `frameworks.get_framework` and `current_name`, the passport index,
      `definitions._entry`, and the exports. The loader in
      `backend/app/cbac/competencies.py` stops reading framework files: it
      holds permissions only.
- [ ] **Refuse a sign-off naming a framework version the tables do not
      hold**, wherever one enters: a request, a read of the git record, and
      any import later, such as a passport moved from another app that
      uses the same frameworks. The refusal names the framework and the
      version, so a person can find out where it came from. It is never
      stored half-checked against the nearest version: comparing it with
      words it was not signed against is the error this guards. Test a
      sign-off for a version one above the newest, and one for a version
      below the first stored.
- [ ] **Refuse a framework competency wherever a competency is granted,
      by what it is rather than by a flag.** Once the loader holds
      permissions only, `validate_competency_ids` refuses any id that is
      not a permission, which already covers every framework competency.
- [ ] **Serve the frameworks to the frontend**, through a typed route
      under `/api/passport/`, with each framework's current version, its
      competencies, levels and scopes, and the retired competencies of
      earlier versions that Phase 10 needs. Additive, so it needs no
      expand-contract.
- [ ] **Read them in the frontend from that route**, not from the build:
      `frameworks.ts`, `competencyTable.ts`, the pickers,
      `FrameworkField` and `CompetencySummary`. `yarn generate:types`
      keeps building the permissions into `src/generated/`, so the
      `CompetencyId` type names permissions only, which is all the code
      names.
- [ ] **Keep test frameworks in this repository**, in a fixtures folder
      the end-to-end stack and the unit tests sync from, so a test never
      depends on a publisher's repository. My reading: teaching keeps a
      whole repository for this, `eoeeta-teaching-testing`, but a handful
      of fixture files is enough for frameworks and needs no pipeline.
- [ ] **Update the passport backend page and the CBAC section** of
      `.github/copilot-instructions.md`, then `CLAUDE.md` through the
      sync: the catalogue folder holds permissions, and frameworks come
      from their repositories.
- [ ] **Tests**: each lookup reads the tables; a framework competency is
      refused as a grant with no framework file present; the route serves
      a framework with a retired competency; the pickers and table render
      from the route's data.

## Phase 8: Move the frameworks out of this repository

- [ ] **Copy each framework into its publisher's repository**, at its
      current version, through that repository's own pull request, and
      let the pipeline sync it. The sync already holds each version from
      Phase 5, so an unchanged file is a no-op: nothing moves for anybody.
- [ ] **Point the sync at GCS**, where the pipeline deploys, in place of
      `shared/competency-definitions/`, as teaching's does.
- [ ] **Delete the framework files from this repository**, in a later
      deploy than the one that points the sync at GCS, so App production
      never runs without a source. `check-competencies-not-deleted.sh` is
      narrowed to permissions in the same pull request, because the
      framework repositories now carry that check.
- [ ] **Remove what only served framework files here**: the
      one-framework-change-per-stack message from Phase 3, and the
      framework half of the header comments.
- [ ] **Update the docs** to say where each framework lives and how a
      publisher changes one.
- [ ] **Tests**: the backend starts and serves every framework with no
      framework file in `shared/`; a change merged in a framework
      repository reaches the tables through the sync.

## Phase 9: Show the record's words where they differ

- [ ] **Show a sign-off's stored name beside the current one when the two
      differ**, in `frameworkRows` in
      `frontend/src/lib/passport/competencyTable.ts` and the table it feeds,
      `CompetencyFrameworkTable`. The page already has both: each
      `CompetencyState` carries `name`, which `index.py` copies from the
      latest sign-off's `competency.name`, and the row's own `name` comes
      from the catalogue's `display_name`. Today the stored one is thrown
      away. Where they differ, the row shows the current words and, under
      them, "Signed off as: " and the stored words.
- [ ] **Do the same for the level**, where the stored `LevelRef.name` no
      longer matches the catalogue's level of the same id.
- [ ] **Say which version a sign-off was given under** where it is not the
      current one, as "Signed off under version 1".
- [ ] **Add to the passport backend page** that the page shows both
      wordings where they differ.
- [ ] **Tests**: a matching name shows once; a differing name shows both;
      the same for a level; an older version is named. A story for
      `CompetencyFrameworkTable` showing a reworded row.

## Phase 10: Keep competencies that left a framework visible

- [ ] **List a retired competency in its framework's table when the holder
      has anything recorded against it**: a sign-off, a request or a
      logbook entry. Before Phase 7, `frameworkItems` in
      `frontend/src/lib/passport/frameworks.ts` read
      `ASSESSABLE_COMPETENCIES`, which held current competencies only, so a
      retired one dropped out of the table along with its sign-off. After
      it, the frameworks come from the API, which serves every version the
      sync has stored, so the table adds the retired competencies the
      holder has state for after the current ones.
- [ ] **Mark such a row** "Not in this framework since version N", from
      `retired_in_version`, and offer no way to ask for a new sign-off of
      it. The backend already refuses new writes against a retired id.
- [ ] **Leave out retired competencies with nothing recorded.**
- [ ] **Check the other views follow the same rule**: `CompetencySummary`,
      the holder's summary page, and what an assessor sees.
- [ ] **Add to the passport backend page** that a retired competency stays
      in the table while the holder has anything recorded against it.
- [ ] **Tests**: a retired competency with a sign-off appears, marked, with
      no request button; one with nothing recorded does not.

## Phase 11: Trace a removed level or scope

- [ ] **Find out what happens when a level or scope id leaves a framework**
      while a sign-off still names it. The table looks safe, because scoped
      rows use the stored `ScopeRef` and the level shown is the stored
      `LevelRef`. The write side has not been traced: re-signing, asking
      again at a higher level, and the scope picker may each look the old
      id up and fail. Write a backend test for each path.
- [ ] **Decide from what the tests show.** If every path copes, record that
      here. If one fails, a level or scope is retired the way a competency
      is, never removed, and `check-competencies-not-deleted.sh` refuses a
      framework file that drops one. Either way, write the answer into the
      passport backend page.

## Phase 12: Make the exports agree with the page

- [ ] **Print the framework's current name in the exports**, in
      `backend/app/features/passport/pdf.py` and `render.py`, through the
      `current_name` helper the page has used since #2321.
- [ ] **Keep the stored words for everything signed**, and print the
      current name first with "Signed off as" the stored words where they
      differ, as the page does after Phase 9. Name the version too.
- [ ] **Tests**: an export made before a framework rename prints the new
      name; a reworded competency prints both wordings.

## Decisions

- **The record is never rewritten to match the catalogue.** A sign-off is
  evidence of what somebody signed, so its words stay as they were, even
  when the catalogue fixes a typo in them. The page reconciles the two at
  display time instead.

- **A framework's name is the one stored word the page overrides.** It names
  the document, not anything signed, which is why #2321 shows the
  catalogue's name and Phase 12 brings the exports into line.

- **App permissions stay outside frameworks.** Agreed with the product owner
  on 1 November 2026. A framework is a published standard; a permission is a
  setting in the app.

- **Quill may publish frameworks.** It is one publisher among many, which is
  why "General clinical skills" stays, split from the permissions that
  shared its ids.

- **Permissions are code; framework competencies are content that grants
  nothing.** Agreed with the product owner on 1 November 2026. If a
  framework competency could grant an ability, a content edit reviewed for
  its wording would quietly become a change to who may do what, and
  whichever framework granted it would win for every organisation. Keeping
  the two apart is also what would let frameworks move into repositories of
  their own later, synced at run time, while permissions stay built into
  the app.

- **Later, not now: an organisation may link a sign-off to a permission.**
  Agreed with the product owner on 1 November 2026 as the shape to use if
  it is ever wanted. An admin at an organisation records that a sign-off of
  one framework competency, at one level and version, means that
  organisation grants one permission. It is a row in the database, saying
  who made it and when, and never a property of the framework. Each
  organisation then decides which framework it trusts, and no content edit
  can change the decision. Nothing in this plan builds it.

- **The number Quill bumps is called `version`, as in teaching.** Agreed
  with the product owner on 2 November 2026. Teaching uses the word
  throughout: `version:` in a bank's `assessment.yaml`, `bank_version` on an
  attempt, `active_version` on an organisation. The publisher's own edition
  label goes in the framework's `description`, never a field of its own, so
  the two cannot be mixed up again.

- **Every change bumps the version, except comments, spacing and the
  `description`.** Agreed with the product owner on 2 November 2026. A
  narrower rule, bumping only for changes that alter meaning, would need
  the check to judge meaning, and it cannot: a reorder, a renamed framework
  and a one-letter typo are all cheaper to count than to argue about. The
  `description` is the one field left out, because it is internal. The
  publisher and specialties bump like everything else.

- **No `passport_only` flag.** Agreed with the product owner on 2 November
  2026. Every framework's competencies are recorded in passports and never
  granted, so being a framework is the rule, and a flag carried by every
  file would only be something to get wrong.

- **A version goes live on merge.** Teaching banks do the same, and nobody
  needs a pointer to move: what protects an existing sign-off is that it
  records the version it was given under.

- **Every version is kept where the sync can read it.** Agreed with the
  product owner on 3 November 2026. Phase 5's sync reads only the files as
  they stand, never git history, so it sees a version only if a sync runs
  while that version is the newest. GitHub keeps one waiting run behind a
  running one and cancels the older waiting run when another arrives, so
  three merges during one deploy lose the middle version's deploy. The
  next sync then sees a jump of two, refuses it, and refuses it again on
  every deploy after, because the skipped version is in no file any more.
  Letting the sync accept the jump was considered and turned down: a
  sign-off can arrive from somewhere other than Quill, such as an import
  from another app using the same frameworks, and one naming a version
  the tables lack could be neither checked nor shown beside its words.
  So each version is uploaded as its own file, never overwritten, the
  pipeline uploads any version the bucket lacks from git history, and the
  sync catches up on every version it is missing. A skipped run then
  only delays a version, and never loses one.

- **A reworded competency is shown, not gated.** Decided on 2 November
  2026, when the product owner left it to this plan. The version check
  already stops every reword until the version goes up, so a second gate,
  a required-reviewer environment or a separate script, would stop the
  same change twice. What the reviewer lacked was the two wordings side by
  side, and the version check now prints them.

- **The docs follow the code, phase by phase.** Agreed with the product
  owner on 2 November 2026. A rule written down before it is built reads as
  true to the next person, as the teaching docstring did.

- **The plan assumes no real passports.** Confirmed by the product owner on
  2 November 2026. It is why Phase 2 has no `replaces` list, Phase 3's
  `framework_version` is required from the start, and Phase 4 has no move
  job. Each of those comes back if real passports exist before its phase
  is built.

- **Frameworks move into repositories of their own, in Phases 5 to 8.**
  Decided by the product owner, and recorded on 2 November 2026, as part
  of this plan rather than one of its own. They are synced like the
  teaching content, so a framework is revised without a Quill deploy, and
  a publisher keeps its own. Phases 1 to 4 come first because they make
  the move safe: records keep their own words, sign-offs record their
  version, every id carries its framework's prefix, and no framework
  competency is a permission. Phases 9 to 12 come after because they
  change what the screens show, and built before the move they would be
  built twice, once against the generated lists and once against the API.

- **Each framework repository is one per publisher, with no stacks.**
  Agreed with the product owner on 2 November 2026. The Royal
  United Hospitals Bath, Gloucestershire Hospitals and the UK SACT Board
  would each have a repository of their own, and so would Quill for the
  frameworks it publishes. That is how the teaching repositories are
  already split, so the sync loops over a list of repositories as the
  teaching sync does. A publisher can own its repository, review its own
  changes, and carry its own licence and access, which one shared
  repository would not allow. Ids still have to be unique across every
  repository, which the prefix rule in Phase 2 makes almost certain and the
  sync must still check. Each repository's name ends `-framework`, as each
  teaching repository's ends `-teaching` (`eoeeta-teaching`,
  `respiratory-teaching`), so a framework repository is known by its name
  alone. The names come from each framework's title, shortened, as Phase 6
  lists. Each change is one branch off `main` and one pull request,
  never a stack, because the version check compares with `main` and two
  stacked changes to one framework would read as a jump of two.

- **Open: where a publisher's second framework goes.** Each publisher has
  one framework today, so a repository named from its framework's title is
  also its publisher's one repository. A second framework from the same
  publisher could join that repository, whose name would then describe only
  its first framework, or get a repository of its own named from its own
  title, which means one repository per framework rather than per
  publisher. To be decided before a publisher has a second framework.
