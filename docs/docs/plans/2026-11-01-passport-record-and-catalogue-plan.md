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
      **Reversed in #2335, merged 3 November 2026, at the product owner's
      request:** the list was deleted after all. To pass the check, #2335
      named all sixteen ids in `REMOVED_ON_PURPOSE` in
      `.github/scripts/ci/check-competencies-not-deleted.sh`, the check's
      one exception, for an id already retired on the base ref.
- [ ] **Empty `REMOVED_ON_PURPOSE` now that #2335 has merged.** The
      sixteen ids are no longer on `main`, so the list does nothing, and
      an exception left open is one somebody can lean on later. A pull
      request of its own, on a new branch off `origin/main` such as
      `feature/catalogue-empty-removed-on-purpose`, in no stack.
      Recorded on 4 November 2026: the change was first made in the wrong
      worktree. A copy sits uncommitted in worktree 3
      (`~/github/quillmedical-3`, on the merged
      `feature/catalogue-delete-the-retired-oncology-list`), and a patch
      of it was saved on 3 November. Once this pull request is open,
      worktree 3 drops its copy.
      - **In `check-competencies-not-deleted.sh`**, replace the sixteen
        ids and the comment above them with an empty list:

        ```bash
        # Empty unless a deletion is in flight. An id here matters only while it
        # is still on the base ref, so once the deletion merges, the next pull
        # request takes it off again; git history keeps the record. The first
        # oncology list left this way, in pull request #2335.
        REMOVED_ON_PURPOSE=()
        ```

        Delete the line "Entries stay after the deletion merges, as the
        record that it happened", which now says the opposite of the
        rule. Leave the mechanism, `removable_ids` and the check that uses
        it, as it is: only the list's contents go.
      - **In `check-competencies-not-deleted.bats`**, two tests put
        `certify_death` on the list with a `sed` anchored on the line
        `  prescribe_sact`, which will no longer exist. Add a helper above
        `retire_and_delete`, and use it in "deleting a retired id removed
        on purpose passes" and "a current id removed on purpose is still
        a deletion":

        ```bash
        # Writes one id into the script's list, as a person deleting it would.
        name_on_the_list() {
          local id="$1"

          sed -i "s/^REMOVED_ON_PURPOSE=(/REMOVED_ON_PURPOSE=(\n  ${id}\n/" "$SCRIPT"
          grep -q "^  ${id}$" "$SCRIPT"
        }
        ```

      - **The docs stay.** `docs/docs/concepts/cbac.md` still reads
        correctly.
      - **Checks**: `just ts .github/scripts/ci`, and
        `bash .github/scripts/ci/check-competencies-not-deleted.sh origin/main`,
        which passes because nothing is deleted.
      - **For the product owner to choose: empty the list, or remove the
        exception.** The steps above empty it and keep the mechanism, so a
        retired id can still be deleted later by naming it there. An
        earlier version went further, and deleted `REMOVED_ON_PURPOSE`,
        `removable_ids`, their three tests and the `REMOVED_ON_PURPOSE`
        clause in `cbac.md`. Then a retired id could never be deleted at
        all. Emptying it is the default, because it matches the copy in
        worktree 3 and leaves the way #2335 used open for the next time.
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
      is version 2. Every other framework starts at version 1. Undone on
      4 November 2026: the pilot was never numbered, so no version 1
      existed anywhere, and Gloucestershire started afresh at version 1.
      See "Every framework starts at version 1" in Decisions.
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

- [x] **Create the four repositories**, after asking the product owner
      before each, because creating one is visible outside this machine.
      Created on 3 November 2026, all four approved together, and made
      public the same day at the product owner's request. The frameworks
      were already public in this repository. Each is empty, with no
      licence, no README and no first commit yet.
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
- [x] **The sync catches up on every version it lacks**, reading the
      version files in order, from one above the newest it has stored to
      the newest in the bucket. Each version is checked against the one
      before it with the same rules as today, and the run still writes all
      of them or none. A version missing from the bucket itself is still
      refused, naming it: the next pipeline run uploads it, and the sync
      after that succeeds. Test a run that finds two new versions, and one
      that finds a gap in the bucket. This replaces reading only the newest
      files, for the reason under "Every version is kept where the sync can
      read it" in Decisions.
      Built as `sync_framework_versions` in
      `backend/app/features/passport/sync.py`, run as
      `python -m app.features.passport.sync --versions <folder>`. The
      loader requires a framework's id to be its file's name, so each
      version file is loaded under that name from a scratch folder.
      Every framework's first stored version is 1, and both syncs refuse
      one that starts above it, naming the versions missing. To get
      there, Gloucestershire went back to version 1.
- [x] **Delete the old framework data, Gloucestershire's version 2 with
      it**, so nothing stored still says the record began at 2. App
      production stored it the day before, and without this the sync
      would refuse version 1 as a version going down. The migration
      `d906dee73f3e` empties every framework table, children first. The
      pre-deploy job runs the sync straight after the migrations, so the
      same deploy stores all four frameworks again from `shared/`, each
      at version 1. The run records in `passport_framework_sync` are
      kept as history. It takes effect when this merges and deploys.
      The framework version check refuses a version going down, so
      `STARTED_AGAIN` in
      `backend/app/features/passport/tooling/check_framework_version.py`
      names Gloucestershire: a framework on it may go back to exactly 1,
      with nothing else changed.
- [ ] **Empty `STARTED_AGAIN` once the fresh start has merged**, in the
      next pull request, and its test with it. The name matters only
      while `main` still holds version 2; after that it would let the
      record go back to 1 a second time.
- [ ] **Delete the passports used to try out the Gloucestershire
      record**, with the `delete-passport` admin action, which archives
      each one first. Their sign-offs name version 2, which no longer
      exists, so Phase 7's refusal would stop them being read. Needs
      the product owner: the usernames go in
      `PASSPORT_DELETABLE_USERNAMES`.

- [x] **A framework pipeline**, `.github/workflows/framework-pipeline.yml`,
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
      Built on 3 November 2026:
      - **Validation uses Quill's own loader**, through
        `app.features.passport.tooling.validate_frameworks`, from a narrow
        checkout: `backend/app/cbac`, the passport tooling and `shared/`.
        It adds two rules for a framework repository: every file declares
        a framework, and no id is one of Quill's permissions. pydantic and
        PyYAML are pinned in the workflow, and `framework-pins.bats`
        checks the pins against `backend/poetry.lock`.
      - **`upload-versions.sh`** in `.github/scripts/framework-pipeline/`
        walks `main`'s first-parent history and uploads the first commit
        that set each version. A commit that changed only comments or the
        description keeps its version, so the file already uploaded stays.
      - **Secrets are passed by name**, never `secrets: inherit`:
        `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`,
        `GCP_FRAMEWORK_GCS_BUCKET` and `SLACK_WEBHOOK_URL`. Each framework
        repository needs all four set before its first merge.
      - **`run-sync-job.sh` takes the job's name**, defaulting to the
        teaching one, so both pipelines share it.
      **The upload was taken out on 4 November 2026**, before this
      merged: see "Read the repositories, not a bucket" below.
- [x] **A framework sync job and somewhere to deploy to**, in `infra/`,
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
      Built on 3 November 2026 as `quill-framework-sync-app`, running the
      `sync-frameworks` action in `backend/scripts/admin_cli.py`, which
      copies `frameworks/` from the bucket and calls
      `sync_framework_versions`. The versions share the teaching bucket,
      `quill-images-app`, under `frameworks/`: the content account may
      already write it, and the admin identity already reads it, so no new
      grant on the bucket was needed. Each framework repository's
      `GCP_FRAMEWORK_GCS_BUCKET` secret is that bucket's name.
      `deploy.yml` points the job at each build through
      `point-job-at-build.sh`, which skips the job while it does not exist
      yet, because Terraform makes it in a workflow that runs beside the
      deploy.
      **The bucket was replaced on 4 November 2026**, before this
      merged: the job reads the repositories from GitHub. See "Read the
      repositories, not a bucket" below.
- [x] **Protect them in Terraform**, beside `infra/github/teaching_rulesets.tf`
      and the repository list in `infra/environments/app/terraform.tfvars`:
      the same rules, the same required checks, and no stacks, so each
      change is one branch off `main` and one pull request.
      Written on 3 November 2026 as `infra/github/framework_rulesets.tf`,
      with `local.framework_repos` beside `local.teaching_repos`.
      **Apply it only after each repository's first commit is on `main`**,
      with `just terraform-github`, which a person runs. An empty
      repository has no `main` for a pull request to target, so the first
      commit is pushed straight to `main`, and these rules refuse that
      push.
- [ ] **Lay each one out like a teaching repository**: a `frameworks/`
      folder holding one file per framework, a README saying what the
      repository is and who publishes it, the publisher's licence for the
      wording, and the `cspell.config.json` the teaching repositories
      carry.
      **Moved below the pipeline on 3 November 2026.** The repositories are
      empty, so the first commit in each is a push straight to `main`, as
      the teaching repositories' first commits were: there is no `main`
      yet for a pull request to target. That push, and each publisher's
      licence for the wording, are the product owner's, so this step waits
      for them while the parts in this repository are built.

- [ ] **Let the four repositories sign in as the content account.**
      **Found on 3 November 2026: it is set by hand, with `gcloud`, in
      two places**, both in `quill-medical-app`, as the
      environment isolation plan's Phase on workload identity recorded on
      23 September 2026. Neither is in Terraform.
      - **The provider's attribute condition** - `github-provider` in the
        pool `github-pool` admits only `bailey-medics/quillmedical`,
        `eoeeta-teaching`, `respiratory-teaching` and
        `eoeeta-teaching-testing`. A repository not named there is refused
        before any account is looked at.
      - **The account's own policy** - `content-sync@quill-medical-app`
        grants `roles/iam.workloadIdentityUser` to the principal set of
        each of the three teaching repositories, one binding each.

      The product owner runs both, because the harness refuses IAM grants.
      Do it only once the pipeline and the sync job exist, so no
      repository can sign in before there is anything for it to do:

      ```bash
      gcloud iam workload-identity-pools providers update-oidc github-provider \
        --workload-identity-pool=github-pool --location=global \
        --project=quill-medical-app \
        --attribute-condition="assertion.repository in ['bailey-medics/quillmedical', 'bailey-medics/eoeeta-teaching', 'bailey-medics/respiratory-teaching', 'bailey-medics/eoeeta-teaching-testing'] || (assertion.repository in ['bailey-medics/gloucestershire-radiotherapy-record-framework', 'bailey-medics/royal-united-hospitals-bath-sact-passport-framework', 'bailey-medics/uk-sact-board-prescribing-framework', 'bailey-medics/general-clinical-skills-quill-medical-framework'] && assertion.ref == 'refs/heads/main')"

      POOL="projects/$(gcloud projects describe quill-medical-app --format='value(projectNumber)')/locations/global/workloadIdentityPools/github-pool"
      for R in gloucestershire-radiotherapy-record-framework \
        royal-united-hospitals-bath-sact-passport-framework \
        uk-sact-board-prescribing-framework \
        general-clinical-skills-quill-medical-framework; do
        gcloud iam service-accounts add-iam-policy-binding \
          content-sync@quill-medical-app.iam.gserviceaccount.com \
          --project=quill-medical-app \
          --role=roles/iam.workloadIdentityUser \
          --member="principalSet://iam.googleapis.com/${POOL}/attribute.repository/bailey-medics/${R}"
      done
      ```

      The repositories are public, which is safe here: GitHub gives a
      pull request from a fork no sign-in token, so only a merge to
      `main`, by somebody with write access, can sign in. Moving this into
      Terraform is left for another plan.
- [ ] **The `workflow` scope is needed only for a push over HTTPS.**
      GitHub refuses a push that adds a file under `.github/workflows/`
      through a token without that scope. This machine pushes over SSH,
      which the scope does not govern: #2329 changed `ci.yml` that way on
      2 November 2026. So clone the four repositories over SSH and skip
      this step; run `gh auth refresh -s workflow` only on a machine that
      pushes over HTTPS.

- [x] **Document the repositories and the pipeline**, in a framework page
      beside the teaching ones in `docs/docs/teaching/`, or under the
      passport backend page. Done on 3 November 2026 as the "Framework
      repositories" section of `docs/docs/backend/passport/index.md`, beside
      the framework sync it feeds.

### Read the repositories, not a bucket

Agreed with the product owner on 4 November 2026, before any of the
above merged, so each change is folded into the pull request that built
the part it replaces: GitHub tells Google Cloud a framework repository
has merged, and the sync job reads the repositories itself. See "The sync
reads the repositories, not a bucket" in Decisions.

- [x] **Read each version file as text, with no scratch folder**, folded
      into the catch-up's pull request, #2338. The loader in
      `backend/app/cbac/competencies.py` takes a file's text and the name
      it should carry, so `_load_version` no longer copies a file into a
      folder named for its framework. Each file is refused above a size
      limit, and so is YAML (the file format) that uses aliases, which
      can make a small file expand hugely in memory.
- [x] **Compare every stored version with its file**, also in #2338.
      The catch-up used to skip a version already stored without looking
      at it, so a version rewritten on `main` would go unnoticed: the
      tables would keep the old words while GitHub showed the new. A
      stored version whose file differs is refused and named.
- [x] **The pipeline stops uploading**, folded into #2339. On a merge to
      `main` it only starts `quill-framework-sync-app`. `upload-versions.sh`,
      its tests and the `GCP_FRAMEWORK_GCS_BUCKET` secret go, so each
      framework repository needs three secrets, not four.
- [x] **The sync job reads the framework repositories itself**, folded
      into #2340, in place of copying a bucket.
      - **A bare clone over HTTPS.** The repositories are public, so no
        credential is needed. A bare clone has no working tree, so a
        hostile repository can never place a file or a symlink, which is
        how past git security bugs were reached. Submodules are never
        fetched. Cloud Run holds a container's disk in memory, so the
        clone leaves nothing behind when the job ends.
      - **Which commit set each version** is worked out in Python, moved
        from `upload-versions.sh`: walk `main`'s first-parent history,
        oldest first, and take the first commit at which each version
        appears. Each file is read with `git show`.
      - **Each repository is paired with the framework ids it may
        publish**, in the job's settings in Terraform, which the content
        account cannot override. Without this, one repository could add a
        version to another publisher's framework by naming its id. A file
        naming any other id is refused.
      - **A timeout on the job**, so a huge or hostile repository stops
        one run and nothing else.
      - `download_versions` and the `FRAMEWORK_GCS_BUCKET` setting go.
- [x] **The docs describe the clone, and only `main` may sign in**,
      folded into #2341. The sign-in command above admits the four
      framework repositories from `refs/heads/main` alone, so a workflow
      pushed to another branch cannot start the sync job or write to the
      teaching bucket the same account may write.
- [x] **The sync gets its own database role**, a new pull request on
      top. It runs today as the admin identity, the one that runs
      migrations, so the sync's own code is all that stands between a bug
      and the whole database. Its own database user may read the
      `passport_framework*` tables, insert into them, and write its run
      records in `passport_framework_sync`, and nothing else.
      **Signed in with IAM (Identity and Access Management), not a
      password**, the product owner's choice on 4 November 2026:
      - **A new service account, `framework-sync`**, which the job runs
        as in place of the admin identity, with
        `roles/cloudsql.instanceUser`. Google's guide says
        `roles/cloudsql.client` is needed only for the Auth Proxy and its
        connector libraries, and the job connects to the private address
        directly, so it does not get it.
      - **An IAM database user for it**, `google_sql_user` of type
        `CLOUD_IAM_SERVICE_ACCOUNT`, on an instance with the
        `cloudsql.iam_authentication` flag on. Unlike a user made with a
        password through Cloud SQL, an IAM user is not made a member of
        `cloudsqlsuperuser`, so it holds nothing until it is granted.
      - **The grants in a migration**: a role with no sign-in of its own,
        `framework_sync`, given `SELECT` and `INSERT` on the framework
        tables, `SELECT`, `INSERT` and `UPDATE` on
        `passport_framework_sync`, and `USAGE` on their id sequences. The
        migration then grants that role to the IAM user named in a
        setting, and skips that last step where the setting is unset, as
        in CI and on a laptop, which keep the one user they have now.
      - **The job connects with a token as its password**: it asks
        Google for an access token for its own account, which lasts an
        hour, longer than the job. No password exists to leak.
      - **A test that the role can do no more**, against Postgres in the
        `migration` test tier: as `framework_sync`, a sync succeeds, and
        a `DELETE` or a read of `users` is refused.

      Built on 4 November 2026. What was found while building it:
      - **Google's guide confirms an IAM user starts with nothing**: "that
        new account is granted no privileges on any databases, by
        default". Its name is the account's email without
        `.gserviceaccount.com`.
      - **Switching `cloudsql.iam_authentication` on restarts the
        instance**, as Google's flag table marks it. The Terraform apply
        that brings this in restarts App production's core database, so
        it is applied at a quiet time, chosen by the product owner.
      - **The grant to the user is not in the migration.** Terraform makes
        the user in a workflow that runs beside the deploy, so it may not
        exist when the migration runs. `grant_framework_sync_role` in
        `backend/scripts/admin_cli.py` grants it after the migrations on
        every deploy, and says so where the user does not exist yet.
      - **The settings insist on a JWT signing key**, which the sync never
        uses, so the job is given a random key nothing accepts, not the
        real one.
- [ ] **Reading a private framework repository, when there is one: a
      GitHub App.** Every framework repository is public today, so the
      sync job needs no credential to clone, and nothing here is built
      until the first private repository arrives. Agreed with the product
      owner on 4 November 2026. When one does:
      - **Register one GitHub App for Quill**, owned by `bailey-medics`,
        with one permission, read-only access to repository contents,
        and no webhook.
      - **Install it on the framework repositories alone**, choosing
        each by name rather than "all repositories", so it can read
        nothing else in the organisation.
      - **Keep its private key in Secret Manager**, readable by the
        `framework-sync` service account alone. The key is kept where it
        is used, by the sync job, never in GitHub.
      - **Mint a token at each run.** The job signs a short request with
        the key and swaps it for an installation token, which lasts an
        hour and reads only the repositories the app is installed on.
        Nothing long-lived ever reaches git.
      - **Hand the token to git through its environment**, as an HTTP
        header set by `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0` and
        `GIT_CONFIG_VALUE_0`, never in the clone URL or the command line.
        So it is never in a log, and never in an error message.
      - **Public repositories keep cloning with no token**, so a public
        framework works the same as today.
      - **Test it with the token fetch stubbed**: the token reaches git
        only through the environment, and an error from git never
        contains it.

      Two other ways were considered and turned down. A read-only deploy
      key on each repository is simpler, but it is one SSH key a
      repository, so four keys to rotate and a new key for every new
      repository. A fine-grained personal access token is tied to one
      person's account and expires on a fixed date.
- [ ] **Decide whether a framework change needs an approval to merge.**
      The rulesets require none, copied from teaching, so anybody with
      write access can merge a change to a clinical framework alone, and
      it goes live at once. One approval is a one-line change in
      `infra/github/framework_rulesets.tf`. The product owner's decision.

## Phase 7: Read frameworks from the database

- [x] **Point the backend's framework lookups at the tables**:
      `frameworks.get_framework` and `current_name`, the passport index,
      `definitions._entry`, and the exports. The loader in
      `backend/app/cbac/competencies.py` stops reading framework files: it
      holds permissions only.
      **Split into three units on 4 November 2026**, because the lookups
      are read all through the passport: `definitions.py`,
      `frameworks.py`, the router, the service, the exports and
      `org_units/router.py` all read the catalogue loaded at start-up,
      and each function takes only an id. One pull request doing all of
      it would be too big to review. In order:
      - [x] **A reader for the stored frameworks**,
        `backend/app/features/passport/catalogue.py`. It loads the newest
        version of every framework from the tables, as the same
        `Framework` and `CompetencyEntry` objects the loader makes, so the
        code that reads them does not change shape. Five queries, one
        for each table, not one for each competency. It caches what it
        read, keyed on the newest version row's id: a new version always
        takes a higher id, so the cache stays right when the sync job
        adds one between deploys, and costs one indexed query to check.
        A test fixture, `stored_frameworks`, fills the tables from
        `shared/` for the tests that need them. Additive: nothing reads
        the reader yet. Test that it gives back exactly what the files
        hold, for every real framework.
      - [x] **Every framework lookup reads the reader**, with a database
        session passed in where the function took only an id. The tests
        that rely on the real frameworks use `stored_frameworks`.
        Built on 4 November 2026, with three choices made while building:
        - **Each function takes the catalogue, not a session.** A route
          reads it once with `stored_catalogue(db)` and passes it down,
          so `definitions.py` and the service stay free of the database,
          which `tests/features_import_boundary_test.py` requires, and one
          request never mixes two versions of a framework.
        - **A permission is now unknown to the passport**, where it was
          known and refused as not assessable, because the stored
          frameworks hold framework competencies only. A route answers
          404 for one, not 400.
        - **Tests that never touch the database** read the same catalogue
          from the files, through `files_catalogue` in
          `backend/tests/frameworks.py`, which reads them as the sync
          does. Route tests use `stored_frameworks`.
      - [x] **The loader holds permissions only**, and the next step's
        refusal comes with it. `layout.framework_for`, which files a
        competency's first record under its framework, moves with it: it
        still asks the loader, because it is reached through 21 path
        helpers in `records.py` and the service that take only the
        store, and threading the catalogue through them is a change of
        its own.
        Built on 4 November 2026. The loader still loads every file, then
        keeps those that declare no framework, so its checks across the
        directory still run while the frameworks live there. Only the two
        writes that can file a first record, a sign-off request and a
        logbook entry, give `framework_for` the catalogue; a read that
        meets a competency with no folder finds nothing, as it did. The
        names that held frameworks, `FRAMEWORKS`, `FRAMEWORK_IDS`,
        `FRAMEWORK_COMPETENCY_IDS`, `ASSESSABLE_COMPETENCY_IDS`,
        `get_framework`, `framework_competencies` and
        `framework_competency_ids`, are gone, and nothing outside the
        tests used them.
- [x] **Refuse a framework competency wherever a competency is granted,
      by what it is rather than by a flag.** Once the loader holds
      permissions only, `validate_competency_ids` refuses any id that is
      not a permission, which already covers every framework competency.
      Built with the loader's change above, on 4 November 2026, so it
      comes before the next step, though the plan first listed it after.
- [x] **Refuse a sign-off naming a framework version the tables do not
      hold**, wherever one enters: a request, a read of the git record, and
      any import later, such as a passport moved from another app that
      uses the same frameworks. The refusal names the framework and the
      version, so a person can find out where it came from. It is never
      stored half-checked against the nearest version: comparing it with
      words it was not signed against is the error this guards. Test a
      sign-off for a version one above the newest, and one for version
      0, below the version 1 every framework starts at.
      Built on 4 November 2026 as `check_held_version` in
      `backend/app/features/passport/definitions.py`, against every
      version the tables hold, which the stored catalogue now lists.
      Where a sign-off enters:
      - **A request** records the newest version from the catalogue, so
        it always names one Quill holds.
      - **A read of the git record**: the routes that read sign-offs,
        one or the list, and the three exports refuse with 409, naming
        the framework and the version. The assessor's inbox leaves the
        one record out and lists the rest, as it does for a record that
        has gone.
      - **An import** does not exist yet; when it does, it calls the
        same check.
      A sign-off for a competency no framework defines any more is let
      through, because its framework cannot be known, and a passport
      must stay readable when a competency leaves the catalogue.
- [x] **Serve the frameworks to the frontend**, through a typed route
      under `/api/passport/`, with each framework's current version, its
      competencies, levels and scopes, and the retired competencies of
      earlier versions that Phase 10 needs. Additive, so it needs no
      expand-contract.
      Built on 4 November 2026 as `GET /api/passport/catalogue`, behind
      the passport feature like the framework list, answering
      `list[FrameworkDefinitionOut]` from `backend/app/schemas/passport.py`.
      A retired competency is served with `retired_on` and
      `retired_in_version` set: the newest version keeps every
      competency an earlier one held, because a competency is retired,
      never deleted, so the newest version is all Phase 10 needs.
- [ ] **Read them in the frontend from that route**, not from the build:
      `frameworks.ts`, `competencyTable.ts`, the pickers,
      `FrameworkField` and `CompetencySummary`. `yarn generate:types`
      keeps building the permissions into `src/generated/`, so the
      `CompetencyId` type names permissions only, which is all the code
      names.
      **Split into three units on 4 November 2026**, because the
      frameworks are read synchronously from the generated bundle in
      about twenty files, and moving them to a route means loading them
      and passing them down. In order:
      - [x] **A catalogue module and hook**,
        `frontend/src/lib/passport/catalogue.ts`. `FrameworkCatalogue`
        turns the route's answer into the shapes the pages already read,
        `FrameworkOption` and `Competency`, so a page does not change
        shape when its source moves. `useFrameworkCatalogue` loads it
        once for the whole app and shares it, and loads again after a
        failure. Additive: nothing reads it yet.
      - [x] **Every page and component reads the catalogue**, in place of
        `ALL_FRAMEWORKS`, `ASSESSABLE_COMPETENCIES`, `FRAMEWORK_OPTIONS`,
        `frameworkItems`, `frameworkOf` and `getFramework`, and the
        level, scope and table helpers that read the bundle.
        Built on 4 November 2026. Each page calls `useFrameworkCatalogue`
        and passes the catalogue to the components that need it, as a
        prop, so the components stay pure for Storybook and the tests.
        `levelsFor`, `scopesFor` and `frameworkRows` take it first, as
        the backend's lookups do. A page that must know whether a
        competency exists, the competency page, waits for it with a
        spinner. The tests and Storybook prime the real frameworks with
        `primeFrameworkCatalogue`, from `src/test/frameworkCatalogue.ts`,
        which still builds them from the bundle until the next unit.
      - [ ] **The bundle stops holding frameworks**: `yarn generate:types`
        builds permissions only, so `CompetencyId` names permissions.

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

- **The sync reads the repositories, not a bucket.** Agreed with the
  product owner on 4 November 2026, replacing the bucket in "Every
  version is kept where the sync can read it" above. The bucket was a
  second, lasting copy of every version, with its own permissions and an
  upload step to keep right, between GitHub and the tables. The sync job
  reads the public repositories directly instead, so the only lasting
  copies are git history and the tables, which keep every version
  stored. GitHub still never reaches the database: it only starts one
  job whose action and repository list it cannot change. GitHub's API
  was considered, to avoid even the clone in memory, and turned down:
  without a token it allows 60 requests an hour from one address, and a
  token is a secret for Google Cloud to keep.

- **Every framework starts at version 1.** Agreed with the product owner
  on 4 November 2026. If a framework could begin at any number, a lost
  version 1 would look the same as a framework that began at 2, and
  nothing could tell the two apart. Gloucestershire had begun at 2,
  because its pilot edition was labelled rather than numbered. Rebuilding
  the pilot as version 1 was considered, and so was a new framework under
  a new id. Starting afresh was simpler than either: only the product
  owner had tried the record out, so nothing real pointed at version 2,
  and the framework tables are a copy of the files that the sync rebuilds.

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
