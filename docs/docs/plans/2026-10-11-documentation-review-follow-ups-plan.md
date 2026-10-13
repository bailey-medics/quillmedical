# Documentation review follow-ups plan

The documentation review of 11 October 2026 (pull requests #1766 to #1787)
checked every page under `docs/docs/` against the code. It corrected the
pages, but it was not allowed to change code, so it left behind a list of
places where the code was the half that was wrong, and four places where
the unpublished privacy policy and the code disagree. Mark decided each
one the same day. This plan carries those decisions out.

Nothing here is urgent and nothing depends on a user: production has no
real users yet. Each phase is one small unit on its own stacked branch, in
the order below, and no step waits for a person.

The phases below are in the order the work was done, with what is still
to do at the end. They were renumbered into that order on 12 October 2026.
A pull request opened before then names a phase by its old number:

- **Old 12 and 13** - now 1 and 2
- **Old 1 to 11** - now 3 to 13
- **Old 14 and 15** - unchanged
- **Old 16** - its first step is 16; the rest is now 22
- **Old 17** - now 23
- **Old 18 and 19** - now 17 and 18
- **Old 20** - now 21
- **Old 21** - now 20
- **Old 22** - now 19

## Phase 1: Carry out the retention periods the database can

Mark asked for this on 11 October, after the review found that section 7
of the privacy policy gives periods that no code carried out. It was built
ahead of Phases 3 to 13, which are untouched.

- [x] Add `backend/app/retention.py`, with `apply_retention`. It deletes
      three things, each with the period the policy gives: an assessor
      invitation nobody accepted, 90 days after it expires; feedback, two
      years after it was sent; and the record of somebody's answers about
      news and updates, six years after the last one. An accepted
      invitation is never deleted, because the policy says it becomes part
      of the sign-off record. The marketing period runs from the last
      answer, so one recent answer keeps every earlier one, and the
      current answer on the account itself is left.

- [x] Add the `apply-retention` action to `backend/scripts/admin_cli.py`.
      It only counts unless `RETENTION_APPLY=true`, so a run by hand
      deletes nothing. It prints counts and never a row's contents, and a
      failure prints the error's type alone.

- [x] Add `.github/workflows/retention.yml`, which runs the action on the
      admin job each night at 03:30 UTC with `RETENTION_APPLY=true`, as
      `accessibility-review.yml` runs its own. GitHub starts the job and
      holds no database credential. A run started by hand is a report
      unless `apply` is ticked.

- [x] Test it in `backend/app/retention_test.py`: each period at one day
      inside and one day past, the accepted invitation, two people's
      marketing records kept apart, the report that deletes nothing, and
      the action's three outcomes. Run with `just ub
      app/retention_test.py`, 13 passing.

- [ ] After the first nightly run, read its log and check the counts are
      what a report by hand gave the day before.

## Phase 2: Take attempt limits out of the terms

- [x] In clause 7.2 of `docs/docs/legal/terms-of-service.md`, remove "the
      number of attempts allowed and the gap between them". Quill has no
      limit on attempts and none is planned, so the clause promised
      something the modules cannot set. Pass marks and time limits stay.

## Phase 3: Record what is deliberately left

- [x] Add an item to `docs/docs/plans/todo.md`, under "Security and
      compliance": **update the privacy policy when push notifications
      are turned on again.** Notifications are not enabled at all today:
      the Settings card is hidden behind `settingsNotificationsCardEnabled`
      in `frontend/src/pages/Settings.tsx`. Section 3.7 of
      `docs/docs/legal/privacy-policy.md` says consent is withdrawn "by
      turning notifications off in your browser or in Settings", but the
      card only has an enable button and `backend/app/push.py` has one
      route, `POST /subscribe`, with no unsubscribe. So before the card is
      shown again, either build the off switch or drop "or in Settings".
      The policy is left as written until then.

- [x] Add a second item to `todo.md`, marked _(clinical)_: **review the
      "Clinician" role gate before there are real patients.**
      `DEP_REQUIRE_ROLES_CLINICIAN` in `backend/app/main.py` gates three
      patient write routes (`/patients/verify`, demographics and letters),
      yet no API route assigns a role: only `backend/scripts/admin_cli.py`
      and `add_role_to_user.py` do. The `Role` model predates competencies
      and the three-layer access model never mentions it.
      `docs/docs/plans/2026-09-06-org-scoped-access-findings.md` records
      that its consumers were never traced. Left alone now because Quill
      holds no patients.

## Phase 4: Stop sending a username to Slack

- [x] In `backend/app/feedback/router.py` and `backend/app/feedback/slack.py`,
      take the sender's username out of the notice posted to Slack. The
      notice keeps the category, the page and the link to the feedback.
      Update `slack_test.py` and the router's test to match.

      The review found that Slack receives each notice with
      `sender=current_user.username`, while section 5.1 of the privacy
      policy names three outside companies and section 3.8 says an
      operator is emailed. Mark's answer was "you decide". Naming Slack as
      a fourth processor would also mean a transfer outside the United
      Kingdom to describe in section 8, for the sake of one word in a
      notification. Without the username the notice carries no personal
      data, the policy is true as written, and the operator loses nothing:
      the link opens the feedback, which shows who sent it.

- [x] Correct the docstring in `router.py` that says "the same is posted
      to Slack", since the two notices now differ.

## Phase 5: Say the opt-out is remembered on the device

- [x] In section 3.9 of `docs/docs/legal/privacy-policy.md`, replace "We
      do not use an analytics service, tracking cookies or anything stored
      on your device for this, and the totals do not identify you." with
      wording that says nothing is stored on the device unless the person
      switches the counting off in Settings, when that choice is
      remembered there. Mark agreed this one.
      `frontend/src/lib/page-views/optOut.ts` writes the key
      `quill.pageViews.optOut` to `localStorage`; the session identifier
      itself is held in memory only, so the rest of the sentence stands.

- [x] The policy is still version 1.0 and unpublished, so it is corrected
      in place, as `docs/docs/legal/index.md` records for the earlier
      revision. Add one sentence there dating this one.

## Phase 6: Keep the public site's log archive in London

- [x] First, in a pull request of its own, set `delete_contents_on_destroy
      = true` on `google_bigquery_dataset.analytics` in
      `infra/modules/analytics/main.tf`. Found while building this phase:
      the sink has written tables into the dataset, and BigQuery refuses
      to delete a dataset that holds any. Terraform reads that setting
      from the state as it was when it destroys, so it has to be applied
      before the change of location, not with it. Merge this one, let the
      `Terraform` run apply, and only then merge the next.

- [x] Set `dataset_location = "europe-west2"` for the analytics module, in
      `infra/main.tf` where the module is called, and change the default
      and its description in `infra/modules/analytics/variables.tf`.

      The module archives the public site's load balancer logs, which
      carry visitors' IP addresses, to a BigQuery dataset for 30 days.
      Its location defaults to `"EU"`, Google's multi-region across the
      European Union. The privacy policy says in three places that
      everything Google holds is in London. Moving the dataset makes the
      policy true without adding an exception to it.

- [x] A BigQuery dataset cannot change location in place: Terraform
      destroys it and makes a new one, and the log sink that writes to it
      with it. Up to 30 days of archived request logs are lost. That is
      accepted, because nobody uses production yet and the archive is not
      relied on. Read the plan on the pull request to confirm it replaces
      the dataset and the sink and nothing else.

- [ ] After the merge, check the `Terraform` run applied, and that the new
      dataset reports `europe-west2`. No deploy is needed: nothing on a
      Cloud Run service changes.

- [x] Leave the public site's static bucket, `location = "EU"` in
      `infra/modules/load-balancer/main.tf`. It holds the site's own pages
      and no personal data, and moving a bucket means recreating it under
      live traffic.

## Phase 7: Let `stack-add` tell two pull requests apart

- [x] Change the guard at the top of `stack-add` in the `Justfile`. It
      asks `gh pr list --head <branch> --state merged`, so it refuses any
      branch whose name an earlier merged pull request also used. That
      stopped the review run part-way, when #1772 reused the branch name
      of #1378. Refuse only when a merged pull request exists for the
      branch **and no open one does**: a branch with an open pull request
      is by definition not spent.

- [x] Check `stack-sync` and `scripts/stack-forget-merged.py` for the same
      question asked the same way, and apply the same rule if they do. The
      run avoided `stack-sync` for that reason without testing it.
      Checked: neither does. `stack-add` was the only place that asked
      GitHub by branch name; `stack-forget-merged.py` asks about the pull
      request number the record holds, which a reused name cannot fool.

- [x] Add a test beside the other stack tests in `scripts/tests/`, with a
      stubbed `gh`: merged and open together is allowed, merged alone is
      refused, neither is allowed.

- [x] Update the "marks in `stack-log` can be stale" trap in
      `docs/docs/cicd/stacked-branches.md`, which currently tells the
      reader to avoid reusing a name.

## Phase 8: One check for every Node pin

- [x] Make `.github/workflows/dependency-audit.yml` set Node up through
      `.github/actions/setup-frontend`, as the other workflows do, if that
      action does nothing the audit job cannot afford. If it installs
      dependencies the audit must not have, keep the job's own
      `actions/setup-node` step and teach
      `.github/scripts/ci/check-version-consistency.sh` to read that file
      as well. Prefer the first: one home is better than a check across
      three. Done the second way: the action runs `yarn install`, and the
      audit job is written to install nothing, so it keeps its own step and
      the script now reads every `node-version` under `.github/`.

- [x] Update `check-version-consistency.bats` for whichever was done, and
      the "Known exception - Node" note in
      `docs/docs/conventions/index.md`, which #1771 changed to say three
      homes.

## Phase 9: Python 3.14 and the hotfix wording

- [x] Change `python = "^3.13.8"` to `"^3.14"` in `backend/pyproject.toml`
      and regenerate `poetry.lock`. `.python-version` is 3.14.7,
      `backend/Dockerfile` builds from `python:3.14-slim`, and mypy is
      already set to 3.14 in the same file.
      The teaching tooling's own package,
      `backend/app/features/teaching/tooling/pyproject.toml`, carried the
      same constraint and changes with it: a test keeps the two in step,
      and the content pipeline installs it on the same pinned Python.

- [x] This is a dependency file, so run the full backend suite, `just ub`
      with no filter, after `just utr` has rebuilt the image.

- [x] In `renovate.json`, rewrite the lines of the description block that
      say "Hotfix branch off the latest production tag". There is no
      production tag and no promotion step: `deploy.yml` deploys every
      merge to `main`. Say the hotfix branches from `main` and deploys on
      merge.

- [x] Make the same correction in
      `docs/docs/dependencies/automatic-updates.md` (the severity table,
      the "Hotfix flow" steps and "next promotion") and step 4 of the
      security section in `managing-renovate-prs.md`. Pull request #1774
      left these as a question. In the labels list of the first file, swap
      `hotfix` and `back-merge`, which nothing uses, for
      `lock-file-maintenance`, which `renovate.json` adds.

## Phase 10: Test that a public page is on the guest list

- [x] Move `guestPaths` out of `request` in `frontend/src/lib/api.ts` to
      an exported constant in the same file. It is the list of paths where
      a 401 does not send the visitor to `/login`.

- [x] Add a test in `frontend/src/routes.test.ts` that walks `routes` and
      fails for any route reachable without `RequireAuth` whose path is
      not covered by `guestPaths`. A page for somebody not signed in needs
      both, and the comments in `api.ts` record the second being forgotten
      three times.

- [x] Expect the test to find routes that are deliberately off the list,
      such as the 404. Give it a short, named list of exceptions with a
      reason beside each, so adding one is a decision somebody reads.

- [x] Update the "A page for somebody not signed in needs two things"
      section of `docs/docs/frontend/sessions-and-requests.md`, which says
      no test checks this.

## Phase 11: Remove a setting that does nothing

- [x] Remove `randomise_selection` from the `assessment` type in
      `frontend/src/features/teaching/types.ts`, from the fixture in
      `backend/app/features/teaching/router_test.py`, and from the
      `assessment.yaml` example in `docs/docs/teaching/index.md`.
      `start_assessment` always picks questions with `random.sample` and
      reads only `randomise_order`, so the key has never had an effect.

- [x] Do not make the validator reject the key. The content repositories
      may still carry it, and refusing it would block their next merge
      for no gain. Search `teaching-repos/` in the main checkout and list
      any bank that has it in the pull request, to be tidied in those
      repositories separately.
      Found in three, each in its module's `assessment.yaml`:
      `eoeeta-teaching` (colonoscopy-optical-diagnosis),
      `eoeeta-teaching-testing` (colonoscopy-optical-diagnosis-test) and
      `respiratory-teaching` (chest-xray-interpretation-test). Harmless
      while they stay: the validator accepts the key and nothing reads it.

## Phase 12: Make the AWS account check say what it does

- [x] In `infra/aws/organisation.tf`, change the comment above
      `check "every_account_is_listed"` from "This fails a plan" to say
      that it warns. A failed `check` block in Terraform is reported as a
      warning and stops nothing.

- [x] Make the same change in `docs/docs/infrastructure/aws.md`: "A plan
      warns if the organisation holds an account the code does not list."

      The wording changes, not the mechanism. `infra/aws` is applied by a
      person, who reads the plan, and the opposite mistake already fails
      loudly: an account listed but not held breaks the lookup.

## Phase 13: Bring CLAUDE.md up to date

- [x] Rewrite the paragraph in the hand-written "Claude-specific" section
      beginning "Recipes that still need the live stack", which said they
      refuse to run from a worktree the stack does not serve. Found already
      done on `main` when this phase was reached: the paragraph says
      `_worktree-guard` calls `_dev-stack-guard`, so those recipes run from
      the main checkout only. The review had read a copy of the file from
      before `main` was pulled.

- [x] Correct `cbac/scoped.py` to `backend/app/cbac/practising.py`. Also
      already done on `main`, in `.github/copilot-instructions.md` and so
      in `CLAUDE.md`.

- [x] Change "Python 3.13" to "Python 3.14" in the stack overview, found
      while checking the two above. Changed in
      `.github/copilot-instructions.md`, which is the source, and the same
      line in `CLAUDE.md`, which is what `/sync-copilot-config` would
      write. Phase 9 moved the backend's package file to 3.14.

## Phase 14: Remind somebody who is enrolled and has not started

- [x] Add two optional keys to `module.yaml`, in `ModuleYaml` in
      `backend/app/features/teaching/tooling/module_schema.py`:
      `enrolmentReminderEveryDays` and `enrolmentReminderCount`, both whole
      numbers above zero. Mark's decision on 11 October: how often and how
      many times is the module's to set, in the teaching repository, not
      Quill's. camelCase because the file's other keys are, and the schema
      says renaming them would break every bank. A module with neither key
      sends no reminders, so a module that has not asked for them is left
      alone; one key without the other is a validation error.

- [x] Copy both, and `renewalMonths`, onto the module's
      `question_bank_configs` row at sync, as three nullable integer
      columns. Found while building: `renewalMonths` goes nowhere today.
      The route that shows it reads `module.yaml` from the content bucket
      on each request. The reminders run in the admin job, which has no
      access to that bucket and is not given the bucket's name, so the
      database is the only place it can read them. The title and cover
      image are already copied to the same row at sync, the same way. A
      change to `module.yaml` alone, with no new version of the questions,
      still reaches the row.

- [x] Send a reminder to anybody enrolled on a module who has no completed
      attempt at it, passed or failed: an `Assessment` row with
      `completed_at` set, for the same person, organisation and
      `question_bank_id` as the `ModuleEnrolment` row. The first goes
      `enrolmentReminderEveryDays` after `starts_on`, then one each
      interval, up to `enrolmentReminderCount`. Only a current enrolment
      counts (`is_current`), on an active account with a verified address.

- [x] Record each reminder, so the interval is counted from the last one
      sent and a repeated run does not send twice: `last_reminded_at` and
      `reminders_sent` on `module_enrolment`, added with `just migrate`.

- [x] Write the template, `enrolment_reminder.html.j2`, with a preview,
      following `docs/docs/backend/email.md`. Send it for the partner, as
      the certificate email is, from the organisation's
      `TeachingOrgSettings`.

- [x] Run it as an admin action from a scheduled workflow, as Phase 1
      does, with the same report-unless-told default.

- [x] In the `eoeeta-teaching` repository, a separate pull request there:
      set `enrolmentReminderEveryDays: 7` and `enrolmentReminderCount: 6`
      on the module. Six weekly reminders is what Mark gave for EoEETA.
      Merged on 13 October as bailey-medics/eoeeta-teaching#14.

## Phase 15: Tell somebody when a pass is due to be repeated

- [x] Send one notice when a pass reaches the module's `renewalMonths`.
      The period is already in `module.yaml` (`renewalMonths: 36` on the
      EoEETA module), already validated, and already served to the
      frontend as `renewal_months`: an earlier note in this plan that the
      code held no such period was wrong. The EoEETA agreement sets both
      the period and the moment: "The delegate will be notified
      automatically that their assessment needs repeating again 3 years
      after the last successful assessment date." So the notice goes at
      three years from the latest passed attempt, not ahead of it.

- [x] Count from the latest `Assessment` with `is_passed` true for that
      person, organisation and module. A later pass restarts the period,
      which is the agreement's "last successful assessment".
      Only somebody still enrolled on the module, on an active account
      with a verified address, is told: a person the organisation has
      withdrawn could not repeat it. Three years is counted in calendar
      months, so a pass on 1 June 2027 is due on 1 June 2030.

- [x] Record that the notice was sent, against the pass it was sent for,
      so it goes once: a column on `assessments`, added with `just
      migrate`.

- [x] Template, preview, admin action and schedule as in Phase 14. One
      action can send both kinds of email in one nightly run.

## Phase 16: Record when an account is closed

- [x] Add `deactivated_at` to `User`, set wherever `is_active` becomes
      false and cleared when it becomes true again. The policy's two years
      run from that date, and today nothing holds it. Kept in step by a
      validator on the model, not by the route, so a script or a route
      written later cannot close an account without a date. An account
      closed before the column existed has none, and so is never deleted
      by a period counted from it: say so when the deleting is built.

## Phase 17: Stop a stacked pull request merging into the branch below

On 11 October fourteen pull requests of one stack were merged and none
reached `main`. Each was based on the branch below it, and a merge goes
into the base. Only the bottom four went through the merge queue, which
exists for `main` alone; the rest were merged directly, eight of them
within seven seconds, into feature branches that no ruleset protects.
Pull request #1808 carried the work to `main` afterwards.

- [x] Make it impossible, in `infra/github/`. Two settings together:

      - **Allow merge commits only.** Set `allow_squash_merge` and
        `allow_rebase_merge` to false on the repository, in
        `security.tf`. Every merge into `main` is already a merge commit:
        the queue's `merge_method` is `MERGE`.
      - **Require linear history on every branch but `main`.** Add
        `required_linear_history` to the `branch_naming` ruleset in
        `branch_rules.tf`, which already targets all branches except
        `main` and the merge queue's own.

      A branch that must stay linear refuses a merge commit, and with the
      other two methods switched off there is no way left to merge a pull
      request into a feature branch. Pushing and force-pushing a stack is
      unaffected, because a stack's branches hold one commit each and are
      rebased, never merged.

      Built behind a variable, `block_merges_into_feature_branches`,
      which is false: with it off nothing changes. One doubt could not be
      settled by reading. Every feature branch inherits `main`'s merge
      commits, and if GitHub counts those against linear history the
      rule would refuse every push. So it is switched on by hand, tried,
      and switched off again if a push is refused, as the next step sets
      out.

      A required check was considered and will not do it: a check only
      blocks a merge where a ruleset requires it, and a ruleset strict
      enough to require one on a feature branch also refuses the pushes a
      stack is made of.

- [ ] Prove it before relying on it. This has not been tried here. After
      `just terraform-github`, make two throwaway branches, open a pull
      request from one into the other, and confirm GitHub offers no merge.
      Then confirm `just stack-submit` still pushes a stack. If the rule
      does not block the merge, take it out again and keep the alarm
      below as the only guard.

- [x] Check nothing merges `main` into a feature branch. `just rebase`
      and the stack recipes rebase; Renovate must be set to rebase too, or
      its branches will be refused. Read `renovate.json` for
      `rebaseWhen` and any `automergeType` before applying.
      Checked: `renovate.json` sets `rebaseWhen` to `never` and
      `automerge` to false throughout, so Renovate never merges `main`
      into its branches.

- [x] Add an alarm for whatever slips through: a small workflow on
      `pull_request: closed` that posts to Slack, through
      `slack-notify.yml`, when a pull request was merged and its base was
      not `main`. Say in the message that the work has not reached `main`
      and name the pull request. Fourteen merges went unnoticed for about
      ten minutes, and only because somebody asked.

- [x] Update the "Traps" section of `docs/docs/cicd/stacked-branches.md`
      with this one, and the rule that follows from it: only the bottom of
      a stack is merged, and `just stack-sync` is what brings the next
      branch down to `main`.

## Phase 18: Say whether a page is public in one place

Mark asked on 12 October why a public page needs two things: no
`RequireAuth` on its route, and its path on the guest list in
`frontend/src/lib/api.ts`. There was no good reason. Phase 10 added a test
that the two agree; this phase removes the second, so there is nothing to
agree.

- [x] Stop the API client navigating. On a 401 that the silent refresh
      does not fix, `request` in `frontend/src/lib/api.ts` fires
      `UNAUTHENTICATED_EVENT` on `window` and throws. It used to call
      `window.location.assign("/login")` unless the page was on the guest
      list. The list, `GUEST_PATHS`, and `isGuestPath` are deleted.

      Two designs were weighed. The other was to mark public routes and
      have the client ask the router about them, which keeps one list but
      leaves the client deciding where the browser goes and ties it to the
      router. Making requests is the client's job and navigation is the
      router's, and the list only existed because the client did both.

- [x] Have `AuthProvider` listen for the event and put the state in
      `unauthenticated`. `RequireAuth` already sends an unauthenticated
      visitor to `/login`, passing the page they were on. A route with no
      guard does nothing, which is right: somebody on a public page whose
      session runs out carries on reading. A state that is already
      unauthenticated is left as it is, so the `loggedOut` mark from an
      explicit logout survives a late 401.

- [x] Replace Phase 10's test in `frontend/src/routes.test.ts`. What can
      still go wrong is leaving a guard off, which fails open. Every
      top-level route must be behind `RequireAuth`, behind `GuestOnly`, or
      named in the test as open to anybody, with its reason. A name with
      no route behind it fails too.

- [x] Test the three together in `frontend/src/auth/AuthContext.test.tsx`,
      with the real provider and the real guard: a guarded page goes to
      `/login` and remembers itself, a public page stays, and a logout is
      not forgotten.

- [x] Rewrite the section of `docs/docs/frontend/sessions-and-requests.md`
      that described the two-place rule.

One behaviour changes that somebody might notice. A signed-out visitor to
an address nothing matches used to be sent to `/login`, because the 404
page was not on the guest list. They now see the 404 page.

## Phase 19: Stop the stack display showing a failure GitHub has replaced

- [x] Fix `best_conclusion_per_check` in `scripts/stack-status.py`. Found
      on 12 October: `just stack-watch` showed a red cross in the heavy
      column for ten pull requests whose checks were all green on GitHub.

      The cause is one check, "Storybook interaction tests", the job that
      sums up the three Storybook legs. A stack is pushed twice in quick
      succession when it is landed, CI's concurrency rule cancels the
      older run, and in that cancelled run the legs report `CANCELLED`
      while the summing-up job reports `FAILURE`, because the legs it
      waited for did not pass. The script already drops a `CANCELLED`
      entry that a later run replaced. It does not drop that `FAILURE`,
      so one failing entry from a dead run outranks the `SUCCESS` from the
      live one. GitHub shows only the newest run of each check, which is
      why it is green there.

- [x] Decide by run, not by entry: where a check has entries from more
      than one run, an entry from a run that a later run replaced does not
      count. `detailsUrl` carries the run id and `startedAt` orders them.
      Keep what the existing comments protect: a draft's skipped heavy
      tier must not hide a later real result, and a cancellation with
      nothing to replace it is still a failure.

- [x] Add the case to `scripts/tests/stack-status.bats`, from the real
      entries on #1829: skipped, then failed in a cancelled run, then
      passed.

## Phase 20: Start the nightly jobs from Cloud Scheduler, not GitHub

Retention (Phase 1) and the teaching reminders (Phases 14 and 15) are
each started by a scheduled GitHub workflow that runs an action on the
admin Cloud Run job. That copied `accessibility-review.yml`, which reads a
date from a file in the repository to decide whether it is due, so its
trigger belongs in GitHub. These two read nothing from the repository.
Mark agreed on 12 October to move them.

- [x] Add a Cloud Scheduler job for each, in Terraform beside the admin
      job in `infra/main.tf`: one that runs the admin job with
      `ADMIN_ACTION=apply-retention` and `RETENTION_APPLY=true` at 03:30
      UTC, and one with `ADMIN_ACTION=send-teaching-reminders` and
      `REMINDERS_APPLY=true` at 07:00 UTC. Each calls the Cloud Run Admin
      API to run the job with those values as overrides for that one
      execution. Enable the Cloud Scheduler API if the project does not
      have it.

      The reasons: GitHub's schedule is best-effort, and a run can start
      late or be dropped, and scheduled workflows are switched off in a
      repository with no activity for 60 days. The EoEETA agreement says a
      delegate is told "automatically" when a pass is due to be repeated.

- [x] Give the scheduler a service account of its own in
      `infra/runtime-identities.tf`, allowed to run the admin job with
      overrides and nothing else. The workflows sign in as the deploy
      service account, which can do far more than start one job.

- [x] Alert when a run fails, through `infra/modules/monitoring/`, on the
      same channels as the other alerts. A failed scheduled workflow only
      emails whoever last edited the file. The reminders action already
      exits 1 when any email could not be sent, so a failed execution is
      the signal.

- [x] Take the `schedule:` trigger out of `.github/workflows/retention.yml`
      and `.github/workflows/teaching-reminders.yml`, and keep
      `workflow_dispatch`. They stay as the button for a report by hand,
      which is how the counts are checked before a first real run. Rewrite
      each file's header to say so.

- [x] Delete both workflows outright. Mark's decision on 12 October, on
      reading the step above: he does not want a run-by-hand button in
      GitHub. Neither action is now started from GitHub in any way. A
      report is the admin job run by hand with the action's name and no
      apply flag, and the command is at the top of
      `infra/scheduled-jobs.tf`. The alert's text points there, and at
      "Force run" in Cloud Scheduler for running the real thing again.

- [x] Do the two halves in one deploy order that never runs a job twice
      in a night or not at all: add the scheduler jobs and merge, check
      the first scheduled execution in the Cloud Run console, and only
      then remove the GitHub schedules. Both actions are safe to run
      twice: retention deletes what is already past its period, and each
      reminder is recorded as it is sent.

- [x] The app does not change. The actions, their report-unless-told
      default and their tests stay as they are.

- [x] Leave `accessibility-review.yml` where it is.

## Phase 21: Check whether an attempt is closed when its time runs out

- [x] Check whether another plan has already fixed this before doing
      anything here. Mark thought on 12 October that it may be in hand in
      another worktree, and it is. Three pull requests were open that day,
      from other worktrees: #1845 "Attempts: finish an attempt when its
      time runs out", #1847 "Attempts: submit the assessment when the
      clock reaches zero", and #1857 "Exam: finish an attempt whose time
      ran out and nobody came back to".

      What was found while building the reminders, for the record: on
      `main` an attempt was finished in one place only, the step the
      browser calls when somebody ends an exam, including when they leave
      it. Nothing on the server closed an attempt when its time ran out;
      it only refused further answers. So an attempt whose tab was closed
      before the browser could finish it stayed open for ever, with no
      result.

- [x] Nothing to build here. Once those merge, an attempt that runs out
      of time is finished and scored, so it counts as completed and the
      enrolment reminders in Phase 14 stop for that person without any
      change to them: they stop on a finished attempt, pass or fail.

## Phase 22: Say so when a scheduled action has not run

Mark asked on 12 October what happens if Google has an outage. A missed
run loses nothing: each action works out what is due from the database,
so the next run picks it up. What is missing is anybody being told.

- [x] Research first how Cloud Monitoring can say "nothing for 36
      hours", and record what was found here. Done first, because the
      answer shaped the rest.

      Its condition for missing data cannot do it. Google's page on
      metric absence gives 23.5 hours as the longest it will wait, and
      these actions run once a day, 24 hours apart, so it would be
      raised half an hour before every run. The same page says a count
      that was never written is not missed at all.

      What works is a sum. An alert may add a metric up over 25 hours at
      most. Add up the finished runs over 25 hours, and raise the alert
      when that sum has been under one for 11 hours more: 36 hours with
      no finished run. A window with no line in it gives no data and not
      nought, so missing data is set to count as breaching. Without that
      the condition is never met by the very thing it is for.

      Two things this could not prove here. That the 25 hour limit and
      the missing-data setting behave together as the reference says:
      the first real test is a paused scheduler job. And the alert is
      not armed until an action has finished once after it is applied.

- [x] Alert when an action has not finished in a day and a half. The
      alert from Phase 20, `scheduled_action` in
      `infra/modules/monitoring/main.tf`, fires on two things: the action
      printed that it failed, or Cloud Scheduler logged an error starting
      it. Both need something to be written to the log. Silence raises
      nothing: a scheduler job paused or deleted, the scheduler API
      switched off, an execution killed for memory or time before it
      prints anything, or an outage in which nothing runs at all. In
      each of those the reminders simply stop.

      So the alert is on the absence of success. Each action ends a real
      run on one line: retention "Deleted" and a count of marketing
      answer records, the reminders "Sent" and a count of renewal
      notices. A `google_logging_metric` for each action counts that
      line, and an alert for each, `scheduled_action_silent`, is raised
      as worked out above. Both are in the monitoring module, beside the
      alert they back up, and not in `infra/modules/analytics`: they
      exist only for this alert.

- [x] Count the line for a real run only. A report, the action run by
      hand with no apply flag, prints "Would delete" and "Would send",
      and must not reset the clock. Somebody checking the counts by hand
      during an outage would otherwise silence the alert.

      The wording is now a contract between the Python and the
      Terraform, which nothing runs together. Each action's test holds
      the line as `RUN_FINISHED` and proves a real run prints it once,
      and that a report and a failed run never do.
      `.github/scripts/terraform/scheduled-action-heartbeat.bats` fails
      if the alert's text differs from the test's, or if the scheduler
      starts an action the alert does not watch.

- [x] Give it text of its own, on the same notification channels. It
      says which action has gone quiet, that nothing is lost, and where
      to look first: the job's page in Cloud Scheduler, for whether it
      is paused and when it last ran.

- [x] Leave the first alert as it is. A failure is known within minutes
      from that one; this one is the backstop for when nothing is said
      at all.

- [x] Terraform cannot be validated on this machine, which holds an
      older version than the lock file asks for. Say so in the pull
      request, and read the plan step of the `terraform.yml` run on it.

      `terraform fmt` passes, which needs no providers. `validate` could
      not be run.

- [x] Watch the third scheduled action as well. `exams-out-of-time`
      was added by another plan on 12 October, between this being built
      and landed, and runs every five minutes. It counts its own last
      line, "Finished" and a number of exams, and is raised after two
      hours of silence: its finished runs summed over an hour, under one
      for an hour more. Each action now carries its own two numbers, so
      a daily action and a five-minute one use the same alert. The test
      that every scheduled action is watched is what caught it.

- [ ] After it is applied and each action has run once, prove it. Moved
      to Phase 31, the last, with how to do it.

### What happened when Phase 20 was applied

Recorded here because it is what this phase is for: a scheduled action
that silently was not running.

- [x] Phase 20 merged on 12 October with the pull requests that removed
      the GitHub timers, and its Terraform apply failed. Retention and
      the reminders ran from nowhere for about eight hours. Nothing was
      lost, because each works out what is due when it runs. Three
      errors, and none could have been found on a laptop, where
      Terraform cannot be validated:

      - **The account Terraform applies with could not create a
        scheduler job.** Its roles are granted by hand in Google Cloud
        and are not in this repository. `roles/cloudscheduler.admin`
        was granted to `github-actions@quill-medical-app` that evening.
      - **The Phase 20 alert had two conditions.** Monitoring allows a
        policy that matches log lines only one. They became one, joined
        by OR in the filter (#1896).
      - **The request log archive could not be moved to London**, and
        had been failing every apply since 11 October. Moving a dataset
        replaces it, and the destroy needs `delete_contents_on_destroy`
        in the state already; the flag and the move had reached `main`
        in one apply. It went back to `EU` for one apply (#1896), then
        to London (#1900). The plan on #1900 also showed the sink's
        permission on the dataset would not be remade with it, which
        would have stopped the archive for good; it now is.

- [x] Lesson, for any plan that moves a job from one starter to another:
      the pull request that removes the old starter is not merged until
      the new one has been seen to run. This plan said so in Phase 20
      and it was merged together all the same, so the order has to be
      held by the pull requests and not by a note: put the removal in a
      later stack, opened only after the first run.

- [ ] Put the roles of the account Terraform applies with into
      Terraform, or at least into a checked list, so a missing one is
      found in review and not at apply. Not designed yet: Terraform
      would be managing its own permissions, which needs care.

## Phase 23: Keep a closed account's records for the sponsor's period

The first step, recording when an account closes, is Phase 16 above and
is done. This is the rest: the period, the deleting and what the privacy
policy says about both.

- [x] Keep an EoEETA delegate's records for three and a half years after
      their account closes, then delete them. Mark's decision on 11
      October. The reasoning: a pass lasts three years, so the records are
      needed that long anyway, and the extra six months covers the time
      around a renewal, when a delegate who has lapsed comes back and
      their last result is asked for.

- [x] Hold the period for each sponsor, not in code: a
      `records_kept_months_after_closure` column on `TeachingOrgSettings`,
      added with `just migrate`, set to 42 for EoEETA. It is the sponsor's
      instruction, which is what the privacy policy says decides how long
      a sponsor's training records are kept, and another sponsor may give
      another. Empty means nothing is deleted automatically for that
      organisation.

      Set by a new admin job action, `set-records-kept`, and not through
      the settings API. The API is open to the organisation's own
      teaching admin, and shortening the period deletes records, so it
      is for Quill's operator to do on the sponsor's written word. It
      takes 1 to 600 months or `none`, reports unless told to change
      it, and refuses an organisation with no teaching settings so a
      mistyped id cannot land on a stranger.

- [ ] Run `set-records-kept` for EoEETA in App production, with 42
      months, once this has deployed. Until then nothing is deleted for
      anybody, which is the safe side to be on. It is run once for the
      organisation and never for one account: the period for each
      account then counts by itself from the day it is closed. Do it
      after Phase 27, so that a period is never set while the nightly
      run can still delete without anybody approving. Better still,
      after Phase 30, which gives it a card to be set from.

- [x] Extend `apply_retention` in `backend/app/retention.py`: for a user
      whose `deactivated_at` is older than their organisation's period,
      delete their assessments, answers and enrolments at that
      organisation. Work out first what else points at those rows and at
      the user. Several foreign keys to `users` are `RESTRICT`, and a
      person can be enrolled at more than one organisation, so one
      organisation's period ending must not take another's records.

      What points at them, found by reading every model: an attempt is
      pointed at by its answers only, and an answer by its tags only.
      Nothing points at an enrolment. A certificate is drawn when asked
      for and an email is sent and not kept, so neither has rows. Each
      table is deleted by name, tags first: Postgres would cascade from
      the attempt, but the test database enforces no foreign keys, and
      a delete that leaned on the cascade would be untested.

      An account closed with no date, as one closed before Phase 16 is,
      is never deleted from: the period cannot be counted. Nor is one
      opened again, which clears the date. A period under one month is
      ignored.

- [ ] Keep the account itself for as long as the records. A result is no
      use to a sponsor without the name on it, so a delegate's account
      cannot go at two years while their results stay to three and a half.
      The same run that deletes the records deletes the account, if no
      other organisation still holds records for that person.

      The first half holds today, because nothing deletes an account at
      all: the policy's two years is promised and not built. The second
      half is not built, and is the one step of this plan left for Mark.
      Thirty columns in the database point at a user. Six of them refuse
      the delete outright: a passport, the three passport requests and
      invitations, and a message somebody sent. So "delete the account"
      has to say what happens to a delegate who also holds a passport,
      or who wrote a message in a patient's record. That is a decision
      about people's records and not a detail of the code. Until it is
      made the records go and the closed account stays.

      Mark's decision, 13 October: deleting an account means removing
      all of its data, the passport and the messages included, and it
      may be done once the account has been deactivated for three and a
      half years or more. So the six columns that refuse the delete are
      not a reason to keep the account: their rows go first.

      Three things that decision did not settle, and Mark's answers
      of 13 October:

      - **Where the person is on somebody else's record: keep the
        name.** An assessor who signed off another clinician's passport
        stays named on that sign-off, and in the passport's own Markdown
        and YAML. It is the other clinician's evidence that a named,
        qualified person assessed them.
      - **A message in a conversation with other people: keep it, with
        no name.** It is shown as from a deleted account.
      - **An account with no sponsor: build it now.** That is somebody
        who pays for Quill themselves, and they are expected within a
        few months. The policy gives such an account two years after
        it is closed.

      And one decision that changed how it is built. The account's row
      is not removed. It is emptied: every field that identifies the
      person is wiped, and the row stays as a shell that says only
      "deleted account" and when. This is how most systems do it, and
      it means nothing that points at the account has to be changed.

      Built as Phase 29, after the screen it is decided on.

- [x] Say so in `docs/docs/legal/privacy-policy.md`, in the two places
      that give the account's period. Both now say two years with no
      exception:

      - **Section 3.1, "How long"** - after "for two years after it is
        closed or deactivated", add that where a sponsor gave the person
        access, the account is kept for as long as that sponsor's
        training records are, which may be longer.
      - **Section 7, "Your account"** - the same, in one clause: "while
        it exists, and two years after it is closed or deactivated, or
        for as long as a sponsor's training records about you are kept,
        if that is longer."

- [x] Name EoEETA's period in the privacy policy, in a subsection of its
      own. Mark's decision on 11 October: the privacy policy and the terms
      are being built with a subsection for each sponsor, and a sponsor's
      period belongs there, stated outright. An earlier draft of this step
      kept the number out of the policy; that was wrong.

      Checked on 11 October, on this branch and on `main`: neither
      document names any sponsor yet, so this is the first such
      subsection. Both already speak about a sponsor's retention in
      general, and those are the places it hangs from:

      - **Privacy policy 4.5** - "Your sponsor decides how long your
        records are kept. Training bodies commonly keep them for six
        years or more after training ends." Add the EoEETA subsection
        after it: for the East of England Endoscopy Training Academy,
        training records and the account they belong to are kept for
        three and a half years after the account is closed or
        deactivated, then deleted. Give the reason: a pass lasts three
        years, and the further six months covers a renewal.
      - **Privacy policy section 7** - change "Training records held for
        a sponsor - as your sponsor instructs" to point at 4.5 and its
        sponsor subsections, and give EoEETA's period beside it.
      - **Terms 22.1, in Part B** - "your sponsor keeps its copy of your
        training records for the period its agreement and its own
        retention rules set, and you keep access to your own account".
        Add the matching EoEETA subsection under clause 22, with the same
        period. Check 22.1 still reads true beside it: it promises access
        to the account after leaving, and the account now ends when the
        records do.
      - **Terms clause 11.1** - the notice that a pass is due to be
        repeated. EoEETA's three years belongs in its subsection too.

      One heading for each sponsor, holding only what differs for that
      sponsor, so the general clauses above it stay true for all.

      Two things in the policy as drafted pull the other way, found on
      reading it whole, and both need rewording in the same change:

      - **It was written to leave a sponsor's period to the sponsor's own
        notice.** 4.5 says "Your sponsor's privacy notice should say",
        and section 2.2 makes the sponsor the controller who decides "how
        long they are kept". So write the subsection as what EoEETA has
        instructed, not as a period Bailey Medics chose, and change "Your
        sponsor's privacy notice should say" to say that where a sponsor
        has given us a period, it is set out below.
      - **4.5 says training bodies "commonly keep them for six years or
        more".** Beside a named sponsor keeping them three and a half
        years, that sentence misleads. Drop it or move it clear of the
        subsection.

- [x] Keep the number in one place the code reads and one the reader
      reads. `records_kept_months_after_closure` on `TeachingOrgSettings`
      is what deletes; the subsection is what promises. A change to one
      without the other is the fault this plan started from, so say in
      the column's comment that the privacy policy names the same period.

- [x] The policy is still version 1.0 and unpublished, so it is corrected
      in place; add a dated sentence to `docs/docs/legal/index.md`, as
      Phase 5 does, and say there that sponsors have subsections.

- [ ] The EoEETA agreement does not contradict this, and does not ask for
      it. It gives no period for one delegate's records. Clause 5 has
      Bailey Medics delete or return shared personal data at EoEETA's
      written direction when the agreement ends, and clause 12 lets it
      destroy the customer's data then unless a copy is asked for within
      ten days. So tell EoEETA the period, since the policy calls it their
      instruction.

- [x] Add a `todo.md` item: build an end-of-agreement export and delete
      for a sponsor's records, which clause 12 already promises on
      request, and decide what deleting a closed account means once there
      are accounts with no sponsor.

## Phase 24: Give EoEETA its own part of the privacy policy and terms

Mark's decision on 11 October: somebody who reaches Quill through a
sponsor, and not directly, needs that sponsor's details set out. EoEETA is
the first. Phase 23 adds the retention period; this phase gathers the rest
so the subsection is written once, whole.

- [x] Write the EoEETA subsection of `docs/docs/legal/privacy-policy.md`,
      under section 4, from what is settled. Each line below is either
      Mark's decision or the EoEETA agreement, and is built or planned in
      the phase named:

      - **Who it is** - the East of England Endoscopy Training Academy,
        at Norfolk and Norwich University Hospitals NHS Foundation Trust,
        the controller of a delegate's training records.
      - **How long records are kept** - three and a half years after the
        account is closed or deactivated (Phase 23).
      - **How long a pass lasts** - three years, and the delegate is told
        when it is due to be repeated (Phase 15, and the agreement's
        schedule).
      - **Reminders** - weekly, up to six, to a delegate who is enrolled
        and has not finished an attempt (Phase 14).
      - **Who is sent a certificate** - the delegate and EoEETA's clinical
        lead, as the agreement's schedule says. The policy's 4.3 already
        says this in general; name the role here.

- [x] Write the matching subsection of
      `docs/docs/legal/terms-of-service.md`, in Part B, "If you use Quill
      through a sponsor". It carries what a delegate is told to expect:
      the three-year pass and its notice (beside clause 11.1), that a
      failed attempt can be repeated at once, which the agreement says
      and which is why clause 7.2 lost its attempt limits in Phase 2,
      and the retention period (beside clause 22).

- [x] How it was written, on 13 October. The subsections are section
      4.7 of the privacy policy and clause 22.3 of the terms: one
      heading for each sponsor, at the end of the part about sponsors,
      so no clause after it is renumbered. Three things were kept true
      to what is built and not to what was first planned:

      - **The account is not promised to be deleted.** Nothing deletes
        one yet. Both documents say the account is kept "for at least as
        long as" the records, which is true today and stays true once
        deleting is built.
      - **Reminders are stated as weekly, up to six.** The code is
        merged, and the schedule itself is two lines in the
        `eoeeta-teaching` repository that are not there yet. Do not
        publish either document until they are.
      - **Clause 22.1 of the terms promised access to the account after
        leaving a sponsor.** It now says "for as long as the account is
        open", since a closed account's records are deleted.

- [x] Do not put the agreement's commercial terms in either document:
      fees, user numbers and the subscription term are between EoEETA and
      Bailey Medics.

- [x] Do this phase after Phases 14, 15 and 23 are built, not before. The
      review that started this plan found a policy promising things no
      code did; a subsection written ahead of the code would repeat that.
      If the documents must be published first, leave out any line whose
      phase is not yet merged.

- [ ] Tell EoEETA what the subsections say before they are published.
      They describe its instructions as controller, so it should have
      seen them.

## Phase 25: Protect the App production database

Found on 13 October while checking whether a wrong deletion could be put
right from a backup. Three protections written for production were
never switched on.

- [x] Make `app` count as production in `infra/main.tf` and
      `infra/modules/cloud-sql/main.tf`. Both ask
      `var.environment == "prod"`, and the environment is called `app`,
      so the answer has always been no. On the live instance,
      `quill-core-app`, deletion protection is off where it was meant to
      be on, seven backups are kept where thirty were meant, and
      point-in-time recovery is off. The same test is written three
      times in `infra/main.tf`, once for each database. Hold it in one
      local, named for what it means, so the next rename cannot undo it
      silently, and look for the same test anywhere else under `infra/`.

      It is `local.is_production` in `infra/main.tf`, true for `app`
      and for `prod`. The database and bucket modules each take it as a
      variable with no default, so no caller can leave it out. One
      other place asked the old question: the teaching images bucket
      could be destroyed with its contents in App production, and now
      cannot. `.github/scripts/terraform/production-is-named-once.bats`
      fails if anything compares the environment's name with `prod`
      again.

      Two settings were both called deletion protection, and only one
      was ever written. `deletion_protection` stops Terraform planning
      a destroy. `deletion_protection_enabled`, inside `settings`, is
      Google refusing a delete from the console, `gcloud` or the API,
      and is the one that read "off" on the live instance. Both are set
      now.

- [x] Keep the backups if the instance is ever deleted. Today they go
      with it (`retainBackupsOnDelete` is false), so the one mistake
      backups are for would take them too.

- [x] Add `prevent_destroy` to the database instance, as `infra/dns.tf`
      has for the DNS zone. Deletion protection is Google refusing a
      wrong command; this is Terraform refusing a wrong pull request.
      It cannot depend on the environment, so it holds for a staging
      database too.

- [x] Read the plan on the pull request before it merges. Switching on
      point-in-time recovery can restart the database for a moment. It
      must show the instance changed in place and never replaced.

      Read on #1924, 13 October. The instance is updated in place, with
      nothing replaced or destroyed: both deletion protections and
      `retain_backups_on_delete` go from false to true, backups kept
      from 7 to 30, point-in-time recovery on, and its log kept 7 days
      where it was 3. The teaching images bucket's `force_destroy` goes
      from true to false.

- [ ] After the apply, check the live instance with
      `gcloud sql instances describe quill-core-app`: deletion
      protection on, thirty backups kept, point-in-time recovery on.

## Phase 26: Say in the privacy policy that backups hold deleted data

- [ ] Add one line to section 7 of `docs/docs/legal/privacy-policy.md`:
      when something is deleted, a copy may remain in backups until
      they are overwritten, and backups are used only to restore the
      service after a fault. The policy says "deleted" with no such
      line, and a copy does live on for a while.

- [ ] Give the number that is true once Phase 25 has applied: thirty
      days, the thirty nightly backups. Not seven, which is today's
      setting and is the fault Phase 25 puts right. So this phase comes
      after that one, and is checked against the live instance and not
      against the Terraform.

- [ ] Add a dated sentence to `docs/docs/legal/index.md`, as the other
      corrections have.

## Phase 27: Put a person between the nightly run and a deleted record

Mark's decision on 13 October. Deleting somebody's training records
cannot be undone once the backups have turned over, and "a timer did
it" is no answer if it is ever wrong. So the nightly run stops deleting
a closed account's records and starts asking.

It covers the records of closed accounts only. Unaccepted invitations,
old feedback and old marketing answers stay automatic, as they have
been since 12 October.

- [x] Stop `apply_retention` deleting a closed account's records. It
      still works out who is past their sponsor's period, as Phase 23
      built, and writes each as a row awaiting a decision: the person,
      the organisation, when the account closed, when the period ended,
      and how many attempts and enrolments would go. A table of its own,
      with foreign keys, added with `just migrate`. One row for each
      person at each organisation, never a second for the same pair
      while one is undecided.

      The table is `retention_review` and the model `RetentionReview`.
      A partial unique index holds it to one undecided row for a person
      at an organisation. Records that were kept are listed again when
      their date to ask comes; records found after a deletion are new
      ones and are listed afresh. A report writes no row.

- [x] Tell somebody, without naming anybody. The run prints one line
      with the count that are newly due and the count still waiting.
      An alert on that line posts to Slack through the notification
      channels the monitoring module already has, so the app is given
      no Slack secret. The app also emails the address in a new
      setting, Mark's to begin with (<mark@quill-medical.com>), through
      the email sender it has. Both give a count for each organisation
      and a link to the screen. No names, no email addresses: a list of
      people and their training does not belong in a channel or an
      inbox.

      Built a little differently, and more simply. The line starts
      "Decision needed:" and carries one count for all organisations.
      The alert that matches it goes to Slack and to the ordinary alert
      address through the channels already there, and to one more
      address, `retention_decision_email`, set to Mark's. So the email
      comes from the alert and not from the app, which needed no new
      setting, template or sender. The count for each organisation is
      on the screen, and the link is added to the alert's text when the
      screen has an address to link to.

- [x] Tell them once when a record becomes due, and again each week
      while any is undecided, saying how long the oldest has waited.
      Not every night. A record left undecided is kept past what the
      policy promises, so the screen and the nudge both show the wait.

- [x] The routes: list what is awaiting a decision, and record a
      decision. Behind `DEP_REQUIRE_OPERATOR`, so a superadmin only.
      The sponsor is the controller and its own teaching admin could
      one day approve its own; that is a later change. A typed response
      model for each, and the CSRF check on the one that writes.

      `GET /api/retention/reviews` and `POST /api/retention/decisions`,
      in `backend/app/retention_router.py`. One request carries any
      number of decisions and each is carried out or refused on its
      own, so one that cannot be done does not hold back the rest. A
      row left out of the request stays undecided.

- [x] The screen, under the admin pages and inside `<RequireOperator>`.
      Each account awaiting a decision is a row with three states:
      undecided, delete, keep. Undecided is where every row starts and
      where it may stay, so that the accounts that are clear can be
      dealt with while one that is not is left for later. Each row has
      a text area for a note. One button carries out everything marked,
      after a confirmation that gives the counts.

      Reuse what Storybook has before building anything: the table, the
      text area, the button pair. A component that does not exist yet
      is planned and shown to Mark first, as the frontend rules say.

      It is `/admin/retention`, "Record retention" in the admin menu,
      shown to a superadmin. Nothing new had to be designed: one
      component, `RetentionReviewCard`, puts together the card, the
      radio field and the text area that already existed, and has its
      own story and tests. Each account is a card and not a table row,
      because a row has no room for a note. The alert's text now links
      to the page.

- [x] What each decision does. **Delete** removes that person's
      attempts, answers and enrolments at that organisation, with the
      code Phase 23 wrote. **Keep** leaves them, needs the note, and
      takes a date to be asked again. A note is optional on a delete.
      Both record who decided and when, and the row stays afterwards as
      the record of what was done and why.

      The date is required, not defaulted. Mark, 13 October: "we
      should not be allowing optional dates", then "do not offer a
      year. you must pick manually." So the date field starts empty
      and the button stays off until one is picked, a keep sent to the
      API with no date is refused with a 422, and nothing fills one in
      anywhere. It began as six months when left out, then a year.

- [x] Check again at the moment of deleting. Between the list being
      drawn and the button being pressed an account may have been
      opened again, which clears its closing date. A row whose account
      is no longer past its period is refused and says why.

- [x] Change the privacy policy and the terms to match: records are
      deleted after the period "once a member of our staff has checked
      them", in section 4.7 and clause 22.3.

- [x] Tests for each of the above, and for the three that matter most:
      nothing is deleted by the nightly run, an undecided row is never
      deleted by the button, and a second run does not write a second
      row for the same person and organisation.

- [ ] Then the same decision from the admin job, for when the screen
      cannot be reached: a dry run that prints what is awaiting a
      decision and a code, and the code pasted back to carry it out, as
      `delete-passport` does. After the screen, on Mark's instruction.

- [ ] Deleting an account, Phase 29, goes through this same screen and
      is never automatic either.

## Phase 28: Closing an account does not take somebody off the newsletter

Mark's decision on 13 October. The newsletter is a choice of its own,
and it is often an administrator who closes an account, not its owner.
It comes before Phase 29 because that phase wipes the name and address
this one has to move first.

- [x] Say so in the documents. Section 3.6 of the privacy policy said
      "We do not send newsletters to a closed account"; it, section
      3.11, section 7 and clause 21.2 of the terms now say the name,
      address and answer move to the newsletter list when an account is
      closed. Changed on 13 October, on Mark's instruction, ahead of
      the code. Neither document is published until the rest of this
      phase is built: `docs/docs/legal/index.md` says so.

- [x] When an account is closed, copy the person's name, email address
      and current answer to the newsletter list, the one section 3.11
      of the policy describes, which is kept apart from accounts. Find
      how that list is held and how an account's address is matched to
      it today: the policy says an entry is deleted when somebody later
      makes an account with the same address, and this is that journey
      run the other way.

- [x] Carry a refusal across as a refusal. Somebody who said no goes on
      the list marked unsubscribed, so that they are never added again
      from an older list, and is sent nothing.

- [x] Email them once when the account is closed, to say that it is
      closed and that the newsletter carries on, with the link that
      stops it. Not to somebody who had already said no.

      Built on 13 October. `backend/app/users/closure_notice.py` works
      out whether one is due, from the list entry the closure has just
      made, and the deactivate route sends it after it has answered, so
      a mail provider that is down neither holds up the closure nor
      undoes it. A failure is logged with the user id and nothing else.
      Nobody is sent it whose newsletter does not carry on: somebody
      who said no, and somebody never asked. The link is the list entry's, since that is
      where their newsletters now come from.

- [x] Send newsletters to the list entry of a closed account. Today
      none is sent to a closed account; find where that is decided.

- [x] Reopening an account takes the entry back off the list and
      restores the answer to the account, so that nobody is on both.

- [ ] A request to delete somebody's data removes them from the list
      too, unless they say they want to stay.

- [x] A sponsored user is carried across only on their own yes. Mark's
      decision, 13 October. Their address reached Quill from their
      sponsor, for training, and clause 21.2 says we do not market to
      them because they are sponsored. The question they were asked is
      "tick if you would rather not", and not ticking it is not a yes.
      So for an account a sponsor gave, the move happens only when the
      record of their answers shows they turned news on themselves.
      Anybody else sponsored is not moved, and the newsletter stops
      when the account closes, as it does today. Section 3.6 and clause
      21.2 say so.

      Work out from `marketing_preference_change` what counts as their
      own yes: the row records what was chosen, where, and the wording
      shown. An answer set for them, or left as it was offered, does
      not count.

      **Reversed on 14 October, by Mark.** "If the stored state is they
      are happy to get a newsletter, they get a newsletter. If the
      stored state is that they do not want to get a newsletter, then
      they should not", however the answer was given and whether or not
      they are in a sponsor's organisation, through closure and through
      emptying. It was built as above first, then taken out before
      merging: `answer_to_carry` now carries the stored answer, and
      `is_sponsored` is gone. Two guards stay, both the same rule
      applied, and Mark agreed them: an address nobody verified is
      never moved, and somebody never asked has no answer to carry.
      Clause 21.2 and section 3.6 were reworded to match.

- [x] Say what makes an account "one a sponsor gave", in one place the
      code reads. It is the same question Phase 29 asks to choose
      between two years and a sponsor's period. No longer needed once
      the step above was reversed: nothing asks it, so it is not in the
      code. Phase 29 lists every closed account after two years.

      Built on 13 October, with the five steps ticked above, as one
      unit. What was found and decided:

      - **How the list is held.** `newsletter_subscriber`, apart from
        `users`. Somebody is on it or has an open account, never both:
        `fold_into_account` in `backend/app/marketing/subscribers.py`
        deletes a list entry once its address is verified on an
        account. `move_to_list` there is the same journey the other
        way, and `deactivate_account` calls it. Reopening calls
        `fold_into_account` again, which already carries a "no" back.

      - **Where sending is decided.** `subscribers()` in
        `backend/app/marketing/newsletter.py` left out every list entry
        whose address was a verified account's. It now leaves out only
        an open one, so a closed account's entry is sent to. An account
        is never folded back while it is closed.

      - **The stored answer is carried for everybody**, a yes as a yes
        and a no as a no. Holding a no is what stops a later import
        putting them back. Somebody who was never asked is not moved at
        all.

      - **An unsubscribe link sent before the account closed** still
        names the account. Pressing it now reaches the list entry too,
        or it would change nothing.

      - **An address nobody verified is never moved.** It may be
        somebody else's.

- [ ] Consider, after this is built, asking sponsored users the
      question as a plain yes. Today only the switch in Settings can
      give one, so few will have. Not built here.

## Phase 29: Empty a closed account

Mark's decisions of 13 October are in Phase 23, where the question was
first met. Placed here because each one is decided on the screen Phase
27 makes, and after Phase 28, which moves the newsletter details off
the account before they are wiped.

- [x] Find the accounts that are due, in the nightly run. Closed for
      the longest period any organisation holding its training records
      has set, with those records already deleted; or, with no sponsor,
      closed for two years. An account with records still inside any
      organisation's period is not due. Each is written as a row
      awaiting a decision and never acted on by the run.

      Built on 13 October, ahead of Phase 28 at Mark's request. That is
      safe because this step wipes nothing; the step that does must
      still wait for Phase 28. How it was built:

      - **The rule is simpler than the sentence above.** An account is
        due when it has been closed two years and no training records
        are left on it anywhere (`closed_accounts_to_empty` in
        `backend/app/retention.py`). Records only go by a sponsor's
        decision once that sponsor's period has ended, so "no records
        left" already means every period has run out. An organisation
        with no period never has its records listed, so an account with
        records there is never due.

      - **Somebody with no sponsor** is covered by giving Quill's own
        organisation a period of 24 months, through Phase 30's screen.
        Their records then come up for a decision like anybody's, and
        the account after them. No second rule in the code.

      - **One table for both questions.** `retention_review` gained a
        `subject`, `records` or `account`, and its organisation may now
        be empty. A check constraint holds the two together: records
        name an organisation, an account does not. An account has an
        index of its own allowing one undecided row.

      - **Deciding to empty marks the row and does nothing else.** The
        nightly run that follows will empty the account, because only
        the admin job can move a passport's files to the archive. Until
        the next step is built, a marked account simply waits. A marked
        account is not listed again, unless it is opened and closed
        again, which makes it a new question.

      - **On the screen** an account has a card of its own below the
        records, offering "Empty this account" or "Keep this account".
        The API sends accounts as a second list, `accounts`, and counts
        them as `to_empty`: both additions, so no open tab breaks.

- [x] Delete what the person owns. Their own passport and all that
      hangs from it, their training records where Quill is the
      controller, their memberships, competencies, registrations,
      roles, push subscriptions and marketing answers. Each table by
      name, the furthest from the account first, as Phase 23 does,
      because the test database enforces no foreign keys. A shell that
      still said "member of ward four, passed colonoscopy on 3 March"
      would identify somebody in a small team.

- [x] Wipe the row and keep it. Name, email address, username, password
      hash, two-factor secret and anything else that says who it was.
      The email address and username are unique and may not be empty,
      so each becomes a placeholder made from the row's id that can
      never be a real address, which also frees the real one to be
      used again. Add a column for when it was emptied. The row is
      then an id, that date, and nothing else.

      Go through every column of `users` when building this, and have a
      test that fails when a column is added without saying whether it
      is wiped. A new personal field is otherwise kept by default.

      Built on 13 October as `empty_account` in
      `backend/app/users/emptying.py`, with the step above. Nothing
      calls it yet: the nightly run does, in the next step. What was
      decided while building:

      - **`COLUMN_RULES` names every column of `users`** and says
        whether emptying wipes it. A test compares it with the table,
        so a new column fails until somebody has said.

      - **`base_profession` is wiped**, to empty. Mark, 14 October: a
        profession left on the row says what kind of person the account
        belonged to, which can identify them. The column became
        nullable; every live account still has a profession, and only
        an emptied row has none. The three places that hand it to the
        signed-in user give an empty string for none, which they can
        never meet, because an emptied account cannot sign in. Not
        making it nullable was the first version, kept because no value
        means "nobody".

      - **Positions held are deleted**, with memberships. "Clinical
        lead from March" identifies somebody in a small team as surely
        as "member of ward four" does.

      - **Conversations they were in still list them**, as a deleted
        account. Taking them out would change somebody else's record.

      - **Feedback they sent stays**, for its own two years, with
        nobody's name on it.

      - **Their entry on the newsletter list stays.** Phase 28 put it
        there to outlive the account.

      - **The passport's files move last.** Everything in the database
        is done and flushed first, so anything it refuses is found
        before a file has moved. The archive is handed in by the
        caller, because only the admin job has one. With none, an
        account that has a passport is refused and nothing is changed.

      - **The password becomes the hash of a secret nobody keeps**, not
        an empty string, so that signing in as the placeholder name is
        refused the ordinary way and cannot raise an error.

- [x] Empty what a superadmin has marked, in the nightly run. Added
      on 13 October: the steps above built the function and the
      screen marks an account, and this joins them.
      `empty_marked_accounts` in `backend/app/retention.py` takes each
      account whose row says deleted and checks it again: still closed,
      the same closure the decision was about, no training records.
      One that fails those is left alone and counted, which is not a
      fault. Each account is committed by itself, because its
      passport's files have moved by then. One that cannot be emptied,
      a passport the archive refuses for example, is rolled back, the
      rest go on, and the run exits 1 after printing the line that
      says it ran, so the alert for a failed scheduled action tells
      somebody. It is tried again the next night. A report run counts
      and empties nobody. `reactivate_account` refuses an emptied
      account.

- [ ] An emptied account can never sign in, be reopened or be found by
      a search for a person. Wherever the app shows who did something,
      it shows "Deleted account".

- [ ] Keep the name where it is part of somebody else's record. A
      sign-off this person gave on another clinician's passport keeps
      their name, on the sign-off and in the passport's Markdown and
      YAML. Check where each of these takes the name from today: the
      sign-off request, the logbook confirmation and the assessor
      invitation all point at the account, and if any of them shows the
      name by looking the account up, it must first be written onto the
      record itself as text, or emptying the account would blank it.

- [ ] A message stays, shown as from a deleted account, with no name
      or initials. Nothing about the message changes; the name simply
      is not on the account any more.

- [x] The record that it was done. The decision row from Phase 27
      outlives the wipe, and must not be the place the name survives:
      once the account is emptied it holds the id, the organisation,
      who decided and when, and the note.

- [ ] Say so in the privacy policy. Section 3.1 already says "delete it
      or remove everything that identifies you", which is this. Add
      that a sign-off given on somebody else's record stays there under
      the name it was given with, and that a message stays without one.

- [ ] Before the EHR product is live, decide this again for it. A
      message about a patient is part of a clinical record, and its
      author has to stay known for far longer than a teaching account.

## Phase 30: Set a sponsor's period from its organisation's page

Mark, 13 October: the period a sponsor has given should be somewhere it
can be set and checked, and a command run by hand is not that.

This phase first planned a history table as well: one row for every
change, with who made it and a required reason. Mark turned that down
the same day: "we do not need actually in app auditing. just a place to
set and check it." So there is no history table and no reason field.

Mark again, the same day: the card "shows for any org, not just
teaching ones". The number is on the teaching settings row today, which
only an organisation that teaches has, and that row cannot be made for
the card's sake: it needs a coordinator's email address and an
institution name. So the number moves to the organisation itself.

- [x] Move the period onto `org_unit`. Add a nullable column there with
      `just migrate`, copy each value across from
      `TeachingOrgSettings.records_kept_months_after_closure` in the
      same migration, and have `closed_accounts_past_their_period` and
      `set-records-kept` read and write the new one. Nothing else reads
      it. `set-records-kept` then works for any organisation, and no
      longer refuses one with no teaching settings.

      The old column is left in place by this step and dropped by a
      migration of its own afterwards, which needs Mark's approval on
      the destructive-migration gate. Nobody has set a period yet, so
      there is nothing to lose between the two.

- [x] A card on the organisation's own admin page,
      `/admin/organisations/<id>`, where a superadmin already looks an
      organisation up. It shows the period now, or that none is set,
      and lets it be changed or cleared. Months, 1 to 600, as
      `set-records-kept` already allows.

      Shown to a superadmin only, and its routes sit behind
      `DEP_REQUIRE_OPERATOR`: the card being hidden is not the
      protection, the route refusing is. The organisation's other
      admins use that page too, to manage its staff and sites, and
      must not see the card or change the number. Making the period
      shorter brings records up for a decision sooner, so it is not
      one of the organisation's own settings.

      Look first at how that page lays out its other actions and fit
      in with them. It shows for every organisation, whether or not it
      teaches.

      Built on 13 October. The card is `RecordsKeptCard`, laid out as
      the enabled features card beside it, with a pencil that opens
      `/admin/organisations/<id>/retention`. The routes are
      `GET` and `PUT /api/retention/periods/<org_unit_id>`. An empty
      field clears the period.

- [x] A shorter period deletes nothing by itself. It only changes who
      the nightly run lists for a decision, and each of those still
      needs a person. Say so on the card.

- [x] `set-records-kept` in the admin job stays as it is, as the way in
      when the screen cannot be reached.

- [x] Drop `teaching_org_settings.records_kept_months_after_closure`
      in a migration of its own, with the model attribute. It needs
      Mark's approval on the destructive-migration gate.

      Built on 13 October, straight after the step above, at Mark's
      request. Merge it after that one has deployed: for the minutes
      between this migration running and the new backend serving, the
      old backend still names the column whenever it reads a teaching
      settings row. Nobody uses App production yet, so that is
      accepted and not staged across a third deploy.

- [ ] Set EoEETA's 42 months through the card, and give Quill's own
      organisation 24 months, which is what brings a self-payer's
      records up for a decision (Phase 29).

## Phase 31: Prove what could only be tried live

- [ ] Prove the alert for a scheduled action that has gone quiet, from
      Phase 22, once #1905 has merged and applied and each action has
      finished a run since. In the Google Cloud console, project
      `quill-medical-app`, open Cloud Scheduler, pause
      `quill-exams-out-of-time-app`, and wait about two hours for the
      Slack message and the email. Then resume it. That job runs every
      five minutes, so it is the quick one to try; the daily two need
      thirty-six hours of silence. Nothing is lost by the pause. If no
      alert comes, the sum and the missing-data setting in
      `scheduled_action_silent` are the first place to look.

- [ ] After Phase 25 has applied, check the live database:
      `gcloud sql instances describe quill-core-app` shows deletion
      protection on, thirty backups kept and point-in-time recovery
      on.

## Decisions

- **The code changes to keep the policy's promises, not the other way
  round** - in Phases 4 and 6 the choice was between describing what the
  code does and changing the code to match what the policy says. A privacy
  policy is a promise, and where a small code change keeps it, that is
  better than an exception the policy then has to carry.

- **Server logs are not in Phase 1** - the policy gives them 30 days,
  which is Cloud Logging's own default for a project. No Terraform pins
  it, so it holds only as long as nobody changes the default.

- **Two documents were not written** - patient record access and
  messaging both need reasons that are recorded nowhere: why the role
  gate survives, and why a message body is kept in both FHIR and SQL.
  They wait for Mark's account, and the first also waits on the `todo.md`
  item in Phase 3.

- **A person approves each deletion of a closed account's records** -
  Mark, 13 October. The nightly run finds and reports, and a superadmin
  decides on a screen: delete, keep, or leave undecided. Pull request
  #1908, which deletes them automatically, was left as built, because
  no organisation has a period set and there is no real user data yet;
  Phase 27 replaces that behaviour before EoEETA's period is set.

- **Screen first, then the command** - Mark, 13 October. The command
  route would have been quicker to build, and the screen was chosen
  because a decision about a person should be made looking at the row.

- **A deleted account is emptied, not removed** - Mark, 13 October.
  The row stays as a shell with nothing that identifies anybody. An
  earlier draft of Phase 29 removed the row, which meant changing how
  five foreign keys behave and copying names onto other tables first.
  Emptying needs none of that, and is what most systems do.

- **A name survives only on somebody else's record** - Mark, 13
  October. A sign-off keeps the assessor's name, because it is the
  evidence of the clinician who was assessed. A message does not.

- **The newsletter move happens when an account is closed, not when it
  is emptied** - Mark, 13 October. Emptying comes years later, and a
  newsletter that stopped at closure and began again then would be the
  opposite of what anybody expects.
