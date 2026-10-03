# Docs review second findings plan

The review of `docs/docs/` against the code on 2 October 2026 kept turning
things up after its first write-up,
[the docs review findings plan](2026-10-02-docs-review-findings-plan.md), had
been handed on. This plan holds the rest: a test that fails at random, a
hand-written type file nothing checks, two gaps in the stack tooling that
broke a stack of sixteen pull requests the same day, two changes to the skill
that ran the review, and a few passages in the documentation that need a
human decision before they can be corrected.

Each finding was confirmed by opening the file named, unless it says
otherwise. The outcome wanted is that each is fixed or deliberately closed.
The phases run from the cheapest and most certain to the ones that need a
decision first.

## Phase 1: A test that fails at random

- [x] `frontend/src/pages/passport/PassportCpdPage.test.tsx`, the test
      "chooses from June to June years, labelled by month", failed on two
      pull requests that changed only markdown and passed on a re-run. The
      failure was `expect(element).toHaveValue(Jun 2026 – May 2027)` with
      nothing received.

      The date is not the cause: the suite fakes it with
      `vi.setSystemTime`. The test waits for the text "by convention" and
      then reads the "Date range" field in the same tick, so it races the
      render that gives the field its value. Wait for the value instead,
      for example `await waitFor(() => expect(dateRangeField()).toHaveValue(...))`,
      and check the neighbouring tests in the same `describe` for the same
      shape.

      Done through one helper, `dateRangeShows`, which waits for the
      field's value. The render being raced is Mantine's: its `Select`
      writes the chosen option's label into the input from an effect, one
      render after the page shows the text. Three neighbours use the
      helper too: "totals the chosen June to June year" waited on the
      same text; "shows the range a new activity falls in" read the value
      straight after other text appeared; and "labels the field Date
      range" already waited, by hand.

- [x] Run `just uf src/pages/passport/PassportCpdPage.test.tsx` several
      times to see it hold. A race does not show on one green run. Five
      runs, eleven tests each, all green.

## Phase 2: The generated type declarations

- [x] `frontend/src/generated/index.d.ts` is written by hand and tracked in
      git, while the JSON files beside it are generated and ignored. Nothing
      checks one against the other, and it has drifted twice:

    - `BaseProfession` still declares `notes: string`, a field
      `shared/base-professions.yaml` no longer has. Remove it.
    - its header says "These files are auto-generated from YAML sources",
      which is true of the JSON and not of the declaration. Say so, and say
      that a field added to a YAML file has to be added here by hand.
    - its own comment records that the `jurisdiction-config.json`
      declaration was wrong until something first imported the file.

- [x] Add a check that fails when they disagree. `frontend/src/types/cbac.ts`
      already imports two of the files by relative path, which takes the
      type from the JSON itself, while pages import through the
      `@/generated/...` alias, which takes it from the declaration. A small
      test file that imports each JSON both ways and assigns one to the
      other turns a drift into a `yarn typecheck:all` failure. Confirm
      first that the two routes really are typed differently: that is the
      reviewer's reading of the two files, not something that was tested.

      Confirmed: they are typed differently, and
      `frontend/src/types/generated-declarations.test.ts` failed on
      `notes` the first time it was run. Assignment alone sees a field
      the declaration has and the JSON lacks, but not the reverse, since
      an object with an extra field is still assignable. So the file also
      works out, as a type, the keys the JSON holds that the declaration
      does not name. That found five more: `may_grant` and
      `may_assign_professions` on a competency, and
      `controlled_drug_schedules`, `audit_requirements` and
      `clinical_safety_standards` on a jurisdiction. All five are now
      declared. `cbac.ts` was unaffected because it reads the two scope
      lists through the relative import.

- [x] The comment in `frontend/scripts/generate-json-from-yaml.ts` above
      `COMPETENCY_DEFINITIONS_DIR` still names `feature-admin.yaml`, which
      no longer exists. Name the files that do.

## Phase 3: Hooks that do not run

- [x] `frontend/package.json` has `predev` and `prebuild` scripts that call
      `yarn generate:types`. The comment in `frontend/Dockerfile` says
      "Yarn 4 skips pre\* hooks", which is why its build stage calls the
      script by name. Confirm it: run `yarn build` in a checkout with no
      `src/generated/*.json` and see whether the JSON appears. This was not
      tested by the review.

      Confirmed with Yarn 4.18.1. With the JSON deleted, `yarn build` went
      straight to `tsc -b`, failed on the missing modules, and left
      `src/generated/` holding only `index.d.ts`.

- [x] If they are dead, remove both and make the scripts say what they do:
      `"dev": "yarn generate:types && vite"`, and the same in front of
      `build`. Every other script that needs the JSON already calls it this
      way. Today the dev container gets its JSON only because the public
      pages' `pages:gen` happens to run the same step alongside, in
      `frontend/dev-start.sh`.

      Done. The Dockerfile's separate `RUN yarn generate:types` went with
      them, since `yarn build` now does it and running it twice says
      nothing. With the JSON deleted again, `yarn build` now generates it
      and builds.

## Phase 4: The stack tooling

The stack of docs pull requests broke twice on 2 October. Both times the
cause was the same pair of gaps, and both times it was mended by hand. This
phase turns what was done by hand into the tooling.

- [x] **A pull request that was closed and replaced strands the record.**
      #1363 was closed by GitHub and reopened as #1386 on the same branch.
      The local record in `.git/gh-stack` kept pointing at #1363. When
      #1386 merged, `scripts/stack-forget-merged.py` could not drop the
      entry, because it drops only entries whose recorded pull request is
      merged. `just stack-sync` then tried to push a branch GitHub had
      deleted, and the whole push was rejected.

      Make the script look at the branch as well as the recorded number:
      an entry whose local branch is gone, or whose tip is already an
      ancestor of the trunk, is finished whatever its recorded pull request
      says. The hand repair was to mark the entry merged and run the
      script, which then dropped it and re-chained the rest correctly.

      Done, with two things the step did not foresee. The script ran only
      after `gh stack sync`, which is the command that was failing, so
      `stack-sync` now runs it before the sync as well. And run that
      early, "tip in the trunk" alone would take every ordinary merge
      before `gh stack sync --prune` saw it, leaving the local branch
      behind, since prune deletes only branches still in the record. So a
      branch whose tip is in the trunk is dropped only when gh-stack will
      not tidy it: the record already says merged, GitHub says the
      recorded pull request is closed, or none is recorded. The branch
      checked out, a branch with no commits of its own, and an entry
      GitHub cannot be asked about are always kept.

- [x] **`just stack-refresh` cannot run once any pull request has merged.**
      It takes the stack apart and re-initialises it, and GitHub refuses
      to unstack a stack holding merged pull requests ("Pull requests
      #1356, #1358 cannot be removed from this stack"). The open ones were
      then in no stack on GitHub at all.

      Give it a second route for that case: leave the old stack alone, run
      `gh stack link <the open pull requests, bottom to top>` to make a new
      one, and point the local record's `id` and `number` at it. The hand
      repair did exactly this, and `stack-sync` then reported the two in
      agreement. The record's `id` is the numeric id inside the stack's
      GraphQL node id.

      Done in `scripts/stack-relink.py`, which the recipe calls when
      GitHub's stack holds a merged pull request. The recipe asks first
      and does not try the unstack, since the failed attempt is what
      removed the open pull requests from their stack. It still rebuilds
      the local record, with `gh stack unstack --local` and
      `gh stack init`, because repointing `trunk.head` is what the recipe
      is for. The `id` and `number` are read from the `stack` field of
      `gh api repos/{owner}/{repo}/pulls/<number>`.

      **Not run against GitHub.** It needs a real stack with a merged pull
      request in it, and making one for the purpose was judged not worth
      it. The first refresh of a part-merged stack is the test.

- [x] Add tests beside `scripts/tests/stack-status.bats` for both cases,
      built on a throwaway record file, and run them with `just ts`.
      `stack-forget-merged.bats` and `stack-relink.bats`, each on a
      throwaway repository with `gh` stubbed on `PATH`. Run with
      `just ts scripts/tests`: thirty tests, all passing.

- [x] Record both in `docs/docs/plans/2026-09-14-stacked-branches-plan.md`,
      which is where the stack tooling's behaviour is written down. Under
      "What a stack of sixteen found".

## Phase 5: Passages in the documentation

Left in place by the review, because each needed something the code alone
did not supply. Three could be settled from the code and a real run after
all; the fourth is a rule to decide and has moved to Phase 7.

- [x] **The architecture diagram in `docs/docs/infrastructure/gcp.md`**
      still draws staging, teaching and a hibernated production. A note
      above it now says it is out of date. Redraw it for the one `app`
      environment, with the load balancer's four routes: `/api/*`,
      `/videos/*`, the application, and the landing site by hostname.

      Redrawn from `infra/modules/load-balancer/main.tf` and
      `infra/environments/app/terraform.tfvars`. The list under it, which
      said what "each environment" has, now describes the one there is,
      and the note above covers only the setup log.

- [x] **Four links at the foot of `docs/docs/concepts/cbac.md`**, under
      "Related Documentation", point at paths that do not exist under
      `docs/`. Decide what each should point at, a generated code page or a
      file on GitHub, or remove the section.

      Pointed at the files themselves by relative path, three levels up.
      That is what the other pages under `docs/docs/` do: forty-seven
      links of that shape and none to a GitHub URL. The second link named
      `main.py` for a `/prescriptions/controlled` example that lives in
      the docstring of `has_competency` in `backend/app/deps.py`, so it
      points there now.

- [x] **The example change strings in
      `docs/docs/backend/api-compatibility-testing.md`** would fail the
      validator they illustrate. A real string is the change id, the
      operation, the path and oasdiff's own description; the examples stop
      at the path. Run the guide's scenario once and paste the real output,
      including the generated file's name and contents, which the guide
      also shows in a form the script does not produce.

      Run on 2 October 2026 with `MUTATE_REMOVE_MESSAGE_1`, oasdiff 1.29.1
      and the real `new_compat_decision.py`, and the guide now shows what
      came out. The run found two more faults in the guide:

    - its step 6 ran the validator before the decision file was
      committed. The validator finds new files with `git diff` against
      the branch's base, so it does not see an uncommitted one and
      reports the same failure. The commit now comes first.
    - `validate-compat-files.sh` uses `declare -A`, which macOS's bash
      3.2 does not have, so on a Mac it stops part-way through its rules.
      The guide now says it needs bash 4 or later. The passing output in
      the guide came from the script run in the Linux shell-test image.

## Phase 6: The docs review skill

`.claude/skills/update-docs-docs/SKILL.md`. Its Copilot source in
`.github/prompts/` commits nothing, so neither change applies there.

- [ ] **Its start check is too strict.** It stops when the branch "is not
      `main` and is not in a stack". A worktree here parks on a temporary
      branch at the tip of `main`, because `main` can be checked out in one
      worktree only, and `just stack-new` works from there. Allow a branch
      that is not in a stack when it is level with `origin/main`. `/crpd`
      has the same rule in its first step and wants the same change, or
      the two will disagree.

- [ ] **It has no rule for a merge queue that fills during a run.** Pull
      requests from early units were queued while later units were still
      being built, and `just stack-submit` could not rebase past them. Say
      what to do: before each push, check whether any pull request in the
      stack is queued; if one is, commit the unit locally and carry on, and
      push once the queue has drained.

- [ ] **It has no rule for a fault found outside the area it was given.**
      A run on `backend/caddy` found the same error in the cybersecurity
      page and could only raise it as a question. Say that such a fault is
      reported, not fixed.

## Phase 7: Three things to decide before any code

- [ ] **Whether a later edit to a decision file's `reason` needs the
      gate.** `docs/docs/backend/api-compatibility.md` says such an edit
      goes "only via the same `api-breaking-change-review` gate". That
      gate job runs only when oasdiff finds a breaking change, so a
      `reason`-only edit never meets it. Decide which is meant: if the
      rule is wanted, something has to enforce it; if it is not, change
      the sentence, and the matching line in
      `.github/instructions/backend.instructions.md`.

- [ ] **Which organisation a content sync is for.**
      `POST /api/ci/teaching/sync` in `backend/app/main.py` imports every
      bank into one org unit: the one an existing bank is already held by,
      or the first organisation in the system. The pipeline's `org_id`
      input, declared in `.github/workflows/teaching-pipeline.yml`, is
      never sent. That is right while one organisation holds all teaching
      content and wrong on the day a second one does. Decide whether the
      endpoint should be told, and how a content repository's `org_id`
      maps to an org unit. No reason for the present behaviour was found in
      the code or the plans.

- [ ] **Whether the landing site wants a rate limit.** The Cloud Armor
      policy is attached to the two Cloud Run backend services only, and
      `docs/docs/frontend/public-pages.md` now says so. A storage bucket
      behind a load balancer takes a different kind of policy from a
      backend service, so check what Cloud Armor allows there before
      deciding this is worth doing for a static site behind a CDN.

## Decisions

- **A second plan, not an addition to the first** – the first findings plan
  had already been copied to another worktree and may be part-way through.
  Adding phases to it here would have split it in two.

- **The stack repairs are written up as tooling changes, not as a
  runbook** – both breakages will recur whenever a pull request is closed
  and replaced, or a stack is refreshed after part of it has merged. A
  runbook asks somebody to edit `.git/gh-stack` by hand again.

- **The skill changes come after the documentation passages** – the plan
  first had them the other way round. `/crpd` is the skill that lands
  every unit here, so its start check is changed once the units that can
  be landed without it have been.

- **Nothing here is urgent** – unlike the CORS setting in the first plan,
  none of these has a consequence on the live site today. Phase 1 is first
  only because a random failure wastes a merge queue slot each time.
