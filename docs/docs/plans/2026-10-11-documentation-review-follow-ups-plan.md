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

- [ ] In the `eoeeta-teaching` repository, a separate pull request there:
      set `enrolmentReminderEveryDays: 7` and `enrolmentReminderCount: 6`
      on the module. Six weekly reminders is what Mark gave for EoEETA.

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

- [ ] After it is applied and each action has run once, prove it: pause
      one scheduler job in App production for two days and see the
      alert arrive, then resume it. Nothing is lost by the pause.

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

- [ ] Keep an EoEETA delegate's records for three and a half years after
      their account closes, then delete them. Mark's decision on 11
      October. The reasoning: a pass lasts three years, so the records are
      needed that long anyway, and the extra six months covers the time
      around a renewal, when a delegate who has lapsed comes back and
      their last result is asked for.

- [ ] Hold the period for each sponsor, not in code: a
      `records_kept_months_after_closure` column on `TeachingOrgSettings`,
      added with `just migrate`, set to 42 for EoEETA. It is the sponsor's
      instruction, which is what the privacy policy says decides how long
      a sponsor's training records are kept, and another sponsor may give
      another. Empty means nothing is deleted automatically for that
      organisation.

- [ ] Extend `apply_retention` in `backend/app/retention.py`: for a user
      whose `deactivated_at` is older than their organisation's period,
      delete their assessments, answers and enrolments at that
      organisation. Work out first what else points at those rows and at
      the user. Several foreign keys to `users` are `RESTRICT`, and a
      person can be enrolled at more than one organisation, so one
      organisation's period ending must not take another's records.

- [ ] Keep the account itself for as long as the records. A result is no
      use to a sponsor without the name on it, so a delegate's account
      cannot go at two years while their results stay to three and a half.
      The same run that deletes the records deletes the account, if no
      other organisation still holds records for that person.

- [ ] Say so in `docs/docs/legal/privacy-policy.md`, in the two places
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

- [ ] Name EoEETA's period in the privacy policy, in a subsection of its
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

- [ ] Keep the number in one place the code reads and one the reader
      reads. `records_kept_months_after_closure` on `TeachingOrgSettings`
      is what deletes; the subsection is what promises. A change to one
      without the other is the fault this plan started from, so say in
      the column's comment that the privacy policy names the same period.

- [ ] The policy is still version 1.0 and unpublished, so it is corrected
      in place; add a dated sentence to `docs/docs/legal/index.md`, as
      Phase 5 does, and say there that sponsors have subsections.

- [ ] The EoEETA agreement does not contradict this, and does not ask for
      it. It gives no period for one delegate's records. Clause 5 has
      Bailey Medics delete or return shared personal data at EoEETA's
      written direction when the agreement ends, and clause 12 lets it
      destroy the customer's data then unless a copy is asked for within
      ten days. So tell EoEETA the period, since the policy calls it their
      instruction.

- [ ] Add a `todo.md` item: build an end-of-agreement export and delete
      for a sponsor's records, which clause 12 already promises on
      request, and decide what deleting a closed account means once there
      are accounts with no sponsor.

## Phase 24: Give EoEETA its own part of the privacy policy and terms

Mark's decision on 11 October: somebody who reaches Quill through a
sponsor, and not directly, needs that sponsor's details set out. EoEETA is
the first. Phase 23 adds the retention period; this phase gathers the rest
so the subsection is written once, whole.

- [ ] Write the EoEETA subsection of `docs/docs/legal/privacy-policy.md`,
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

- [ ] Write the matching subsection of
      `docs/docs/legal/terms-of-service.md`, in Part B, "If you use Quill
      through a sponsor". It carries what a delegate is told to expect:
      the three-year pass and its notice (beside clause 11.1), that a
      failed attempt can be repeated at once, which the agreement says
      and which is why clause 7.2 lost its attempt limits in Phase 2,
      and the retention period (beside clause 22).

- [ ] Do not put the agreement's commercial terms in either document:
      fees, user numbers and the subscription term are between EoEETA and
      Bailey Medics.

- [ ] Do this phase after Phases 14, 15 and 23 are built, not before. The
      review that started this plan found a policy promising things no
      code did; a subsection written ahead of the code would repeat that.
      If the documents must be published first, leave out any line whose
      phase is not yet merged.

- [ ] Tell EoEETA what the subsections say before they are published.
      They describe its instructions as controller, so it should have
      seen them.

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
