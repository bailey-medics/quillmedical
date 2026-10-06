# In-app guides plan

Nobody using Quill has anywhere to look up how to do a thing. A new teaching
admin is not told how to add a delegate, a delegate is not told how to join,
and the only written instructions are the developer docs, which are public,
written for engineers and cannot tell an admin from a delegate. The first
real users are weeks away, and every one of them will otherwise ask by
email.

The outcome wanted is a Guides area inside the application: short task
guides in text and screenshots, filtered to what the reader can do, with
each relevant page linking to its own guide. The joining guide is readable
before login. Screenshots are retaken by Playwright from seeded data after
every merge, so they do not rot and never show a real person. Video is kept
to one welcome film for new admins. Teaching is the first subject; nothing
here is specific to it.

## Phase 1: A guides area with text only

First because it is the whole reading experience without any of the
machinery: once this lands a guide can be written and read, and screenshots
are an addition to it and not a precondition.

- [x] Check the component catalogue before building anything, as the
      component reuse rule requires. Nothing new was needed: the list is
      `ActionCard` in a `SimpleGrid` under `PageHeader`, as `Settings.tsx`
      is, with `Heading` over each group and `EmptyState` when there is
      nothing to show, and one guide is `PageHeader` over `MarkdownView`.
      Both are pages, in `frontend/src/pages/guides/`. `GuideLink` of
      Phase 5 is the one component still to come, and is presented for
      review there.

- [x] Add a typed registry at `frontend/src/guides/registry.ts`: one entry
      per guide with `slug`, `title`, `summary`, `audience`, `public` and an
      optional `feature`. The body is a markdown file beside it,
      `frontend/src/guides/content/<slug>.md`, read by
      `frontend/src/guides/content.ts` with `import.meta.glob`. A registry
      in TypeScript and not front matter in each file, because the audience
      is then a type the compiler checks, and no front matter parser is
      added. The registry is small and sits in first load, because the
      navigation asks it whether to offer the link; the words do not.
      `registry.test.ts` asserts every entry has a file and every file an
      entry.

- [x] Each markdown file opens with its title as a `#` heading, which
      `markdownlint` asks for and which lets the file read as a document
      by itself. The page shows the title in its own header and strips the
      heading from the body, and a test holds the two titles equal.

- [x] The pages are one lazy chunk, `pages/guides/guidesChunk.ts`, loaded
      through `loadGuides` in `frontend/src/featureChunks.ts`, in the manner
      of `docs/docs/plans/2026-10-04-lazy-load-one-chunk-per-feature-plan.md`.
      The markdown is imported only by the guide page, so it travels in
      that chunk. It has an entry in `FEATURE_CHUNKS`, fetched in the
      background for anybody with a guide to read, so a guide opens
      offline as the features do.

- [x] `audience` is one of `delegate`, `admin` or `superadmin`, and a
      reader sees their own tier and every tier below it. The reader's tier
      is worked out in one place, `frontend/src/lib/guides/useGuideTier.ts`:
      `superadmin` when `platform_role` says so, `admin` when they hold
      `manage_users` or any of `SCOPED_MANAGER_IDS`, otherwise `delegate`.
      The ladder belongs to the guides and is not borrowed from the
      permission checks, because the real layers are not a ladder: a
      superadmin does not necessarily hold `manage_teaching`, and would
      otherwise be shown fewer guides than an admin.

- [x] Where an entry names a `feature`, it is hidden unless the reader's
      `enabled_features` has it, so a deployment without teaching shows no
      teaching guides.

- [x] This is filtering for relevance and not access control, and it is
      done in the frontend only. A guide to assigning admins is not a
      secret, and the API still refuses the action. So there is no backend
      endpoint, no table and no migration in this plan. The comment at the
      head of `useGuideTier.ts` says so, so nobody later mistakes it for a
      guard.

- [x] Add the routes in `frontend/src/routes.tsx`: `/guides` for the list
      and `/guides/:slug` for one guide, both inside `<RequireAuth>` for
      now. A slug that does not exist, or that is above the reader's tier,
      renders the 404, as every other guard here does.

- [x] Render the body with `MarkdownView` from
      `frontend/src/components/typography/`. It already sanitises and
      styles; images come in Phase 3. It is a small renderer of its own
      and not a full markdown parser, which constrains how a guide is
      written: a list item is one line, a list cannot nest, and a numbered
      list restarts at 1 after a blank line. `docs/docs/frontend/guides.md`
      in Phase 4 should say so.

- [x] Add a "Guides" entry to `frontend/src/components/navigation/featureNavItems.ts`,
      so it appears in the main and teaching sidebars alike, shown only to
      somebody with at least one guide to read, with the open guide hung
      beneath it by its title. It uses the `book` icon, which `NavIcon`
      already had, so nothing was registered. `navCoverage.test.tsx` covers
      both routes without naming them, given a sample slug. "Guides" and
      not "Help": the link opens a list to browse ahead of time, and
      "Help" reads as something having gone wrong.

- [x] `HomeRedirect.tsx` lands somebody on the first link in that list
      other than Settings. Guides sit before Settings, so they are passed
      over too: otherwise a teaching admin with no feature of their own
      would land on the guides and not on Admin.

- [x] Write one real guide to prove the path end to end: "Add a delegate
      by hand", audience `admin`, feature `teaching`. Its steps and labels
      were read from `UserInfoUpdatePage.tsx` and the create-user endpoint.
      Two things found on the way are recorded under Phase 4.

- [x] Tests for both pages, the registry, the navigation entry and the
      landing page, and for `useGuideTier` covering each tier, a superadmin
      with no competencies, and a guide whose feature is off. No stories:
      nothing new went into `components/`.

## Phase 2: Guides readable before login

A delegate has to read how to join before they have an account, so the
joining guide cannot sit behind `<RequireAuth>`.

- [x] Move `/guides/:slug` outside `<RequireAuth>`, in
      `frontend/src/routes.tsx`. One address for each guide and not a
      second public copy, so there is one thing to keep right. The route's
      element is `GuideShell` in `frontend/src/pages/guides/`, which puts
      `RootLayout` round the guide for somebody signed in, so nothing
      changes for them. The list at `/guides` stays signed-in only.

- [x] Signed out, the guide is shown as a plain page with no ribbon and no
      menu, and a link to sign in beneath it. This was to be `PublicLayout`,
      and is not: that is the shell of the marketing site, with the
      marketing site's links in it, and nothing in the application uses it.
      The application's own signed-out pages (the login form, the printed
      passport's verification page) are bare, and the guide matches them.

- [x] Signed out, a guide marked `public` is shown and anything else is
      the 404, through `useReadableGuide` in `useGuideTier.ts`. A public
      guide is public whatever feature it belongs to, since nobody signed
      out has a feature; signed in, it is held to its feature like any
      other.

- [x] Write "Join a course", audience `delegate`, `public: true`, covering
      the two registration steps, the verification email and first login.
      Its steps and labels were read from `RegisterPage.tsx`,
      `RegistrationForm.tsx` and the email templates.

- [x] Link to it as "How to join a course" from the three pages a
      delegate passes on the way in: `LoginPage.tsx` (on a teaching
      deployment only, beside the register link), `RegisterPage.tsx` and
      `TeachingRegisterPage.tsx`. `LoginForm` and `RegistrationForm` take
      the address as an optional `guidePath` prop, each with a story.
      `guidePath()` in the registry builds the address from a slug the
      compiler checks, which is the idea Phase 5 wanted, brought forward.

- [x] Link to it from the public site, as a "How to join" button beside
      "Log in" on `frontend/public_pages/src/pages/optical-diagnosis-polyps.tsx`.
      The public site is a separate build, so the address is written out
      in full, on the host its "Log in" button already uses.

- [x] `RegisterPage.tsx` imported its router hooks from `react-router`
      where every other page uses `react-router-dom`. Under test the two
      are separate copies, so the page could not be rendered and had no
      test. Changed to match, and given one.

- [x] Tests: a public guide renders signed out with a way to sign in, a
      non-public one gives the 404 signed out, both render signed in, and
      the shell shows neither while the session is being checked.

## Phase 3: Screenshots retaken by Playwright

Hand-taken screenshots would be stale within weeks at the rate the screens
change. The seeded CI stack and Playwright already exist, so the
screenshots are made by a script and never by hand.

- [x] Let a guide name its screenshots as ordinary markdown images with a
      relative address, `![The add delegate form](add-a-delegate-by-hand/form.png)`.
      `MarkdownView` allowed no `img`. It now takes an `imageBase` prop
      that allows images and puts each beneath that base; a guide's is
      `GUIDE_ASSETS_PATH`, `/guide-assets`. The address must be lower case
      words, hyphens and slashes ending in an image type, so it cannot
      point anywhere else, and the letters, slides and messages that also
      use `MarkdownView` gain nothing. An image with no alt text is left
      out; `registry.test.ts` fails the build for one, and for an image
      outside its guide's own folder.

- [x] Let a numbered step carry its screenshot. In `MarkdownView` a blank
      line or any other line ends a list, and the next list starts again
      at 1, so a picture between two steps would renumber every guide.
      With images allowed, an image indented under a list item belongs to
      that item.

- [x] When an image will not load, show its alt text in a plain box and
      not a broken image, since the first deploy runs before the first
      sync. Brought forward from the end of this phase: it is the same
      change to `MarkdownView`, and until the bucket exists it is what
      every image looks like.

- [x] Add a Playwright config of its own, `frontend/playwright.guides.config.ts`,
      with its specs in `frontend/e2e/guides/`, one per guide and named for
      its slug. Each walks the flow against the seeded stack and calls
      `shot(page, "<slug>/<name>")` at the steps the guide shows. One
      desktop viewport, light theme, twice the pixel density. This was to
      be a project inside `playwright.config.ts`, kept out of the default
      run by hand. A separate config cannot be run by `just e2e` or by CI's
      end-to-end job at all, which is the point: it is a build step, not a
      test of the application.

- [x] No spec submits anything: the admin spec stops at the review step
      and the joining spec never presses Register. So a second run finds
      the stack as the first did, and nothing needed adding to
      `backend/scripts/seed_ci.py`. The specs sign in as `educator`, the
      teaching admin the end-to-end tests already use. Every name on
      screen is then seeded and fake by construction.

- [x] The seed has an organisation and no site, so the screenshot of the
      "Organisation/site" step shows an organisation chosen where the
      guide's words say to choose a site, and everything is named "CI
      Teaching Hospital". Seeding a site and friendlier names would fix
      both. Left alone here because `seed_ci.py` is shared with the
      end-to-end tests, which this run does not exercise.

- [x] Add `just guide-screenshots` (`just gsh`), which runs the config on
      the per-worktree `compose.ci.yml` stack through `_e2e-run` and
      leaves the images in a gitignored `frontend/public/guide-assets/`,
      where the Vite dev server serves them. A guide can then be written
      and looked at locally with its real screenshots.

- [x] `frontend/src/guides/screenshots.test.ts` ties the two halves
      together: every image a guide names is taken by its spec, and every
      image a spec takes is named. It reads the `shot` calls out of the
      spec files. Without it a renamed step silently leaves a broken image.

- [x] Put the screenshots into the two guides written so far, each under
      the step it shows.

- [x] Add a public bucket for the images, in a module of its own at
      `infra/modules/guide-assets/`, and route `/guide-assets/*` to it on
      the load balancer in `infra/modules/load-balancer/main.tf`, beside
      the `/videos/*` backend bucket and with the same rewrite to `/`.
      Public and unsigned, unlike video: the images hold only seeded data,
      and the joining guide shows them to somebody with no session. Cached
      for five minutes, because a retaken screenshot keeps its name. The
      account GitHub Actions deploys as may write to this bucket and no
      other. No Caddy route was needed: in production the request never
      reaches Caddy, and locally Vite serves the folder from `public/`.

- [ ] This applies on merge through `terraform.yml`; read the plan it
      posts on the pull request before merging, and check the run after.
      It was not validated locally: `terraform fmt` passes, but the
      machine's Terraform is older than `infra/versions.tf` asks for, so
      `validate` could not be run. The URL map is the part to read: its
      path rules are one list, and a mistake there has taken the API down
      before.

- [x] Add `.github/workflows/guide-screenshots.yml`, which runs after a
      merge to `main` that touches `frontend/src/**`, the guide specs, the
      seed or the workflow itself, and by hand. It brings up the CI stack,
      takes the screenshots in Microsoft's Playwright image as the
      end-to-end job does, and mirrors them to the bucket with
      `.github/scripts/guide-screenshots/upload-to-gcs.sh`. Separate from
      `deploy.yml`, so a broken screenshot script never blocks a release.
      It authenticates with Workload Identity Federation as
      `public-site.yml` does. The upload removes what no guide shows any
      more, so the script refuses to run on an empty set, and its `.bats`
      test holds it to that.

- [x] A failed run posts to Slack through `slack-notify.yml`. It is
      worth reading: a spec that can no longer find a button means the
      words of that guide are out of date too.

- [ ] The workflow cannot be tried before it merges: a workflow file runs
      only from `main`. After the merge, run it once by hand, open
      `/guides/join-a-course` on the live site and check the pictures are
      there. Until then every image is its alt text in a dashed box.

## Phase 4: Write the guides

After the screenshots, so each guide is written once with its pictures and
not revisited.

- [x] "Assign a teaching admin", audience `superadmin`. Words only: the
      seed's `admin` operates Quill but holds no profession, so cannot
      open Admin, and there is nobody to photograph it as. A seeded
      superadmin with `superadmin_profession` would allow it.
- [x] "Add a delegate by hand", audience `admin`: its screenshots went in
      with Phase 3.
- [x] "Join a course", audience `delegate`, public: likewise.
- [x] "Take a module and its assessment", audience `delegate`. Two
      screenshots, of the list of modules and of one module. None of the
      assessment itself, because starting one writes an attempt and the
      next run would then photograph a different history.
- [x] "See delegates' results", audience `admin`.
- [x] Add `docs/docs/frontend/guides.md` on how to write a guide: the
      registry entry, the markdown file, the screenshot spec and the
      recipe. Registered in `docs/mkdocs.yml`.
- [x] Three things found in the registration flow while writing "Join a
      course", none of them fixed in this phase. The guide works round the
      first two, and Phase 8 fixes all three:
      `/teaching/register/:module` takes the delegate's site from router
      state set by the step before, so refreshing it, or opening it from a
      bookmark, creates an account that belongs nowhere. The "Resend
      verification email" link on a failed verification leads to a page
      with no resend button, because that page does not know the address.
      And `register` stores an email as typed while `resend-verification`
      looks it up in lower case, so a mixed-case address may never be sent
      a second link. The last was not traced to the end.
- [x] "See delegates' results" has less to describe than its title
      suggests: a row of the All delegates table does not open anything,
      so there is no page of one delegate's results to send an admin to.
- [x] Enrolment landed on `main` while this plan was being built, from
      `2026-10-04-teaching-access-results-modules-and-enrolment-plan.md`.
      The new user form gained an "Enrolment" step and lost "Permissions"
      for anybody but an operator, who has "Platform role" in its place;
      a member's page at a site gained a "Save enrolment" card; and a
      delegate now sees the modules they are enrolled on, not every
      module live for their organisation. "Add a delegate by hand" and
      "Assign a teaching admin" are rewritten to match, the first with a
      screenshot of the new step and a short section on adding a module
      later. Found only because the next run read `seed_ci.py`: nothing
      failed, since the specs are not run in CI. The workflow of Phase 3
      is what would have said so, once it is on `main`.
- [x] Setting up a superadmin is deliberately not a guide. It happens at a
      command line before anybody can sign in, and is already written up in
      `docs/docs/infrastructure/admin.md`.

## Phase 5: Link each page to its guide

- [x] Build `GuideLink` in `frontend/src/components/guides/`, with stories
      and a test. It is `TextLink` in a right-aligned `Group`, reading
      "Guide: " and the guide's title, so it is put together from what
      existed and needed no review as a new component. It matters more
      than the navigation entry, because somebody stuck looks at the page
      they are on.
- [x] It takes its slug as a union of the registry's slugs, so a link to
      a guide that has been removed fails the typecheck.
- [x] It draws the link only when the guide is one the signed-in reader
      is shown, and nothing otherwise. One component and not two: an
      ungated `GuideLink` beside a gated `ReaderGuideLink` left the
      obvious name as the one a page must not use. Its stories name the
      reader they are drawn for through `parameters.mockUser`, which
      `frontend/.storybook/preview.tsx` lays over its signed-in user.
- [x] Place it under the page's title on the three pages the guides
      describe: the new user form in `frontend/src/pages/UserInfoUpdatePage.tsx`
      (when creating, not editing), All delegates, and the teaching
      dashboard. Not in `PageHeader`'s `action` slot: that draws a box for
      whatever it is given, and would leave an empty one for a reader who
      is shown no link.
- [x] `AdminAllDelegatesPage.test.tsx` had no signed-in user, because the
      page never asked for one. It does now, through the link, so the test
      mocks `useAuth` as its neighbours do. No other test renders one of
      the three pages without one.

## Phase 6: A welcome video for new admins

Last, and the only video: film costs the most to redo, so it is added once
everything it would otherwise have to explain is written down.

Not started. Every step below waits on the first: there is no film yet,
and a player with nothing to play is not worth landing.

- [ ] Record one short film, under two minutes, of Mark talking about the
      service. No screen recordings in it, so it does not date when a
      screen changes.
- [ ] Upload the file and a hand-checked WebVTT caption track to the
      guide assets bucket by hand. Not through the teaching video
      pipeline: that is keyed by organisation and module, signs its
      addresses, and is built for a library of lectures, where this is one
      file that changes perhaps once a year.
- [ ] Show it at the top of the admin group on `/guides`, using the
      existing player in `frontend/src/components/teaching/video-player-v10/`
      if it will play an unsigned address, with captions on offer.
- [ ] Offer it once as a dismissible card on an admin's first visit to
      `/admin`. Remember the dismissal in `localStorage`: a card seen again
      on a second device is a small cost, and a column on `User` for it is
      a migration to store one boolean.

## Phase 7: Accessibility log

- [x] This plan adds a navigation entry and pages read signed out, so it
      touches journeys 1 to 4 in
      `docs/docs/frontend/accessibility/journeys.md`, all of which pass
      through the navigation, and journey 1 again at the login form.
      "Journeys 1 to 4 again, for the Guides link in the navigation" is
      added to the "Not yet run" list in `testing-log.md`, with a second
      entry for a guide page by itself: its heading order, its numbered
      steps, its image alt text and the signed-out page's landmark. Done
      ahead of Phase 6, which is waiting on a recording; add the captioned
      video to that entry when it lands.

## Phase 8: Fix the registration faults the joining guide works round

"Join a course" tells a delegate not to refresh the second registration
page. That is a guide apologising for the application. These are the three
faults found while writing it, in the order a delegate would meet them.
Last in the plan because the guides do not depend on them, and each is a
small change of its own.

- [x] Send the delegate back when the second step has lost their site.
      `RegisterPage.tsx` validates the clinical lead and hands the
      organisation and site it gets back to `/teaching/register/:module`
      as router state, which a refresh, a bookmark or a link opened in a
      new tab all lose. So when the second step opens with no organisation
      in its state, go straight back to `/register`. No message: the first
      step is self-explanatory, and the delegate retypes one email
      address. Nothing is stored, which is why this was chosen over
      carrying the site in the address or in `sessionStorage`.

- [x] Refuse the orphan on the server too. Already done, by the enrolment
      work that merged on 5 October 2026: `TeachingRegisterPage.tsx` now
      sends the module from the address as `teaching_module_id`, and
      `/auth/register` answers a module with no `org_unit_id` with a 400
      before anything is saved. So a refresh no longer makes an account
      that belongs nowhere, as it did when this phase was written. What
      is left is the step above: today the delegate fills in the whole
      form and is then shown "org_unit_id required when
      teaching_module_id is provided".

- [x] The joining guide's screenshot spec,
      `frontend/e2e/guides/join-a-course.spec.ts`, opens the second step
      directly to photograph it, which the redirect stops. Have the spec
      go through the first step, using the clinical lead that the guides'
      own seed in Phase 9 holds.

- [x] Separately, the server should not take the browser's word for the
      site. `org_unit_id` and `site_id` arrive in the request body, so
      anybody could name a site they have no clinical lead at. Done in
      Phase 14, as a unit of its own.

- [x] Then take the "Do not refresh this page" paragraph out of
      `frontend/src/guides/content/join-a-course.md`.

- [x] Give the failed-verification page a way forward, by sending the
      delegate to sign in. "Resend verification email" on
      `VerifyEmail.tsx` leads to `/verify-email-pending`, whose resend
      button is drawn only when the page knows the address, and arriving
      this way it does not. Replace the link with one to `/login`, and
      reword the message to say that signing in sends a new link, which it
      already does for an unverified account. Chosen over asking for the
      address on the pending page: it needs no new form, no new endpoint
      to rate-limit, and it is the path the joining guide already
      describes. Update `VerifyEmail`'s stories and tests with it.

- [x] Hold every email address in lower case, wherever it is written.
      Decided on 5 October 2026: always, including addresses typed inside
      the application on the user pages, not only at registration.
      `register` stored an address as typed while `resend-verification`
      looked it up in lower case, so somebody who typed capitals might
      never be sent a second link while the page said one was sent.

- [x] Lower-case on the model. `normalise_email` in
      `backend/app/models.py` trims and lower-cases, and `User` calls it
      from a validator on `email`, so every write goes through it: the
      routes, the passport's invitations, the create-user scripts and the
      seeds, and any route added later. This replaced the plan's first
      idea, a helper each write path had to remember to call, which
      needed a test walking every route to catch the one that forgot.

- [x] Lower-case what a route is given before it looks somebody up.
      `register`, `create_user_with_cbac`, `update_user`, the invitation
      route, `validate_clinical_lead`, `resend-verification`,
      `forgot-password` and `update_profile` in `backend/app/main.py` all
      call `normalise_email`, as do the two passport invitation lookups.
      Three of them lower-cased already, each in its own words. The
      member lookup, the marketing webhook and two passport searches
      compare with `func.lower` and were left as they are.

- [x] No migration. Mark confirmed on 5 October 2026 that neither the
      development nor the live database holds an address with a capital
      in it, so there are no rows to lower-case and nothing that could
      collide. Nor is a unique index on `lower(email)` added: `User.email`
      is already unique, and with the validator both of two addresses
      differing only by case arrive as the same string, so the column
      refuses the second.

- [x] An address is shown as it is stored. Nothing lower-cases as
      somebody types, which would move the text under the cursor; the
      forms send what was typed and read back what Quill holds.

- [x] Tests, in `backend/tests/test_email_addresses_are_lower_case.py`:
      the model holds a new and a changed address lower case and refuses
      a second differing only by case; registration stores capitals lower
      case, emails the lower-case address and treats the other case as a
      duplicate; a new verification link and a password reset are sent
      whatever case is typed; and changing your own address stores it
      lower case. The full backend suite was run, because `models.py`
      changed.

- [x] These change the registration and login flow, so they touch
      journey 1 in `docs/docs/frontend/accessibility/journeys.md`. Add it
      to the "Not yet run" list in `testing-log.md`.

## Phase 9: Fuller screenshots, from a seed of the guides' own

Asked for on 5 October 2026, after the guides were read through locally
with their first screenshots. Five additions, and all but one need data
the end-to-end seed does not hold: a site, delegates with results, an
operator who can open Admin. So the seed comes first.

Numbered after Phase 8 because it was asked for after it, but its first
step is wanted by Phase 8 too: the joining guide's screenshot there needs
a clinical lead. Whichever phase is built first adds the seed.

- [x] Give the guides a seed of their own, `backend/scripts/seed_guides.py`,
      run after `seed_ci.py` by `just guide-screenshots` and by
      `.github/workflows/guide-screenshots.yml`, and by nothing else. Not
      more rows in `seed_ci.py`: that file is shared with the end-to-end
      tests, which count on what it holds, and a page of invented
      delegates would change what several of them see. It seeds, with
      plainly invented names: "Northfield Endoscopy Academy" and a site
      beneath it, "Northfield General Hospital", with a clinical lead in
      post; an operator holding `superadmin_profession`; a teaching admin;
      and seven delegates at the site. `compose.ci.yml` mounts the file
      beside `seed_ci.py`, because the image CI runs holds no scripts.
      This also closes the open step in Phase 3, where the screenshots
      were all named "CI Teaching Hospital" and showed no site.

- [x] Seed the delegates' attempts in the same script: two passed first
      time, one passed at a second attempt, one not passed, one left
      unfinished and one who has opened nothing. The rows are written
      directly and scored by the application's own functions in
      `app/features/teaching/scoring.py`, not made by the routes that sit
      an exam, which pick questions at random and stamp the present
      moment: a seeded attempt has to be the same on every run, or every
      retaken screenshot differs.

- [x] Every spec signs in as the seeded person its guide is about, with
      `signIn` in `frontend/e2e/guides/signIn.ts`, so a picture shows what
      that reader would see. The shared sign-in as `educator` is gone from
      `playwright.guides.config.ts`.

- [x] Let a spec write. `docs/docs/frontend/guides.md` told a spec to
      "change nothing", so a second run finds what the first did. That
      was stricter than needed: the stack is made fresh for every run and
      thrown away after it, locally and in the workflow alike. The rule
      that matters is that specs do not depend on each other, so a spec
      that writes has a seeded person of its own. The page is reworded.

- [x] The joining guide's spec now goes through the first registration
      step, with the seeded clinical lead's address, and reaches the
      second as a delegate does. Phase 8's redirect needed this.

- [x] "Learning" on the All delegates page cannot be seeded, because
      nothing stores it: the column is always a dash, and the slide
      reader records no progress. Found while writing the seed.
      "See delegates' results" says the column "says whether they have
      finished the learning materials", which is what the page promises
      and not what it does. The guide now says the column is not filled
      in yet. Building the progress itself is not this plan's.

- [x] Screenshots for "Assign a teaching admin", which had none. The spec
      signs in as the seeded operator and takes: the organisation's page
      with its **Enabled features** card, the **Features** page, the
      **Basic details** step with **Teaching admin** chosen, and a user's
      page showing the **Edit user** and **Send invite email** cards.

- [x] Delegates and results for "See delegates' results", from the seed
      above, so every column but Learning and all three figures show
      something. A third picture shows **Filter delegates** open.

- [x] An example email in "Join a course", under "Confirm your email
      address". The verification email is already rendered with sample
      values for Storybook, at
      `frontend/src/stories/emails/rendered/email-verification--quill.html`,
      and `tests/test_email_previews.py` keeps that file true to the
      template. The spec loads it with `page.setContent` and photographs
      it, so the picture is of what is really sent and no email has to be
      sent to take it. Its images are named from the site's root, so the
      spec opens a page of the app first for them to come from.

- [x] A walk through the learning materials in "Take a module and its
      assessment": a slide with the list of slides beside it, and the
      last slide with **Finish**, with the steps written out to match.
      No picture of the video slide: it is a YouTube player, which a
      screenshot run cannot count on reaching or on looking the same
      twice. Nothing records progress through the slides, so the guide no
      longer says a place is kept.

- [x] Example exam views in the same guide. The spec sits the assessment
      as its own seeded delegate and takes: the introduction with
      **Begin**, a question with the countdown and **End exam** above it,
      the **End exam** confirmation, and the page shown when every
      question is answered. The result and **Results by question** are
      photographed from the passed attempt the seed gives its first
      delegate, with its **Download certificate** card: a spec cannot be
      relied on to pass an exam, and should not hold the answers.

- [ ] The questions are drawn at random, so the picture of a question
      differs from run to run and is uploaded afresh each time. Harmless,
      but it is the one picture that changes when no screen has. Pinning
      it would need the application to take a seed for its choice of
      questions, which is not worth building for a screenshot.

- [x] The module in every one of these is the public respiratory module
      that `.github/scripts/ci/fetch-e2e-teaching.sh` pins, so the
      guides' pictures show chest X-ray questions to EoEETA's
      colonoscopists. Accepted for now: it is public, and the only module
      CI can clone without a token. The guide says so in a line above the
      first exam picture.

- [x] Link every page a guide names to that page. Asked for on 5 October
      2026. Where a guide says "choose **Admin**, then **Users**", **Users**
      becomes a link to `/admin/users`, so a reader who knows where they
      are going gets there in one press, and one who does not still has
      the words. Three kinds of page are left as words, because there is
      no one address to give:
      pages of one person or one record, such as `/admin/users/:id` or an
      organisation's own page; the learning materials,
      `/teaching/learn/*`; and an assessment, `/teaching/assessment/*`,
      which must never be entered by a stray press on a link.

- [x] Keep the bold with the link, `[**Users**](/admin/users)`, so a
      page's name still reads as what is on the screen. Check
      `MarkdownView` draws bold inside a link; its link pass runs before
      its bold pass, so it should.

- [x] Hold the links to the route list with a test in
      `frontend/src/guides/`: every link in a guide that starts with `/`
      matches a route in `frontend/src/routes.tsx`, and none matches a
      route with a `:parameter` in it or one under `/teaching/learn` or
      `/teaching/assessment`. A page that is renamed or removed then
      fails the build where a guide still points at it.

- [x] A link in the public guide to a signed-in page sends a signed-out
      reader to the login form, which is right. "Join a course" links
      to `/register`, `/login` and, for where a delegate lands after
      signing in, `/teaching`.

- [x] Add the rule to `docs/docs/frontend/guides.md`, under writing the
      markdown file.

- [ ] `just guide-screenshots` was run and every picture looked at. Read
      each guide through locally as a reader would, as was done for the
      first set: that is a person's job.

## Phase 10: Make the guides fit features other than teaching

Asked for on 5 October 2026: guides for safety and for the passport. The
five guides so far are all teaching's, and two things about how guides are
filed were shaped by that. Both want settling before a guide for another
feature is written, or the new guides inherit teaching's words.

- [x] Rename the lowest audience. It was `delegate`, which is teaching's
      word for a learner; a passport holder or a safety officer is not
      one. The list already headed that group "For everyone". It is now
      `everyone`, in `frontend/src/guides/registry.ts` and
      `frontend/src/lib/guides/useGuideTier.ts`. Nothing outside the
      guides read it.

- [x] Let a guide name a competency as well as a feature. A feature says
      whether an organisation has the passport at all; within it, a guide
      to signing somebody off is for an assessor and a guide to keeping a
      logbook is for a holder, and those are told apart by
      `assess_clinician_passport` and `passport_write`, not by tier. The
      registry entry takes an optional `competency`, checked in
      `guidesVisibleTo` beside the feature. Still relevance and not a
      guard. An operator is shown every guide of a feature they have,
      whatever they hold.

- [x] Group the list by feature once there is more than one. A reader at
      an organisation with teaching and the passport would otherwise get
      one run of cards with nothing to say which is which. Feature first,
      then audience within it, in `GuidesPage.tsx`. With one feature its
      name is left out and the page looks as it did. `GUIDE_FEATURES` in
      the registry names the features that have guides and sets their
      order, and a guide's `feature` is now one of them and not any
      string.

- [x] Give each feature's guides to whoever administers it. An admin is
      anybody holding `manage_users` or a scoped manager, so a teaching
      admin would be shown the passport admin's guides wherever both
      features are on. The `competency` field is what narrows that: a
      passport admin's guide names `manage_passport`. The two admin guides
      teaching has are left without one, since both `manage_users` and
      `manage_teaching` may add a delegate and no other admin exists yet
      where teaching is on.

- [x] The passport's guides reach somebody who owns a passport at an
      organisation without the feature, as the side navigation offers
      them the passport itself. Brought forward from Phase 12, because it
      is the same few lines.

## Phase 11: Safety guides

The safety feature is a mock-up with no backend: its cases, hazards and
officers are sample data held in the browser, and an edit lasts until the
page is reloaded. See `2026-10-02-safety-feature-mock-up-plan.md`.

- [x] Write them now. Decided on 5 October 2026: the mock-up exists to
      show colleagues what is possible, and the guides are part of
      showing it. Somebody handed the mock-up with a guide beside it sees
      a feature; handed it bare, they see some screens.

- [x] Say once, at the top of each safety guide, that this is a preview:
      the cases are examples and a change lasts until the page is
      reloaded. One line, not a warning on every step, and worded as what
      the reader is looking at and not as an apology. Take it out when
      the feature is built.

- [x] Write them to show the feature off as well as to instruct. A reader
      here is being shown round, so each guide opens with what the page is
      for and why a safety officer would want it, before the steps.

- [x] Six guides, each `feature: "safety"` and
      `competency: "view_safety_cases"`. Not quite the six proposed: the
      mock-up shows far more than it lets anybody do. Hazards and
      incidents cannot be added or changed, and nothing can be signed, so
      a guide called "Record a hazard" would describe a button that does
      nothing. What was written is what the mock-up can honestly show:
      "Find your way round a safety case"; "Read and edit a safety
      document"; "Read the hazard log"; "Read an incident report";
      "Change a safety officer"; and "Check what has been signed off".
      The last says plainly that **Record signature** is there to show
      where signing will happen.

- [x] Only three things in the mock-up can be changed: an officer, a
      document's text, and the placeholders. The first two are in the
      guides. The placeholders' edit page is reached only by typing its
      address, with nothing on any page leading to it, so no guide sends
      a reader there.

- [x] These guides will need rewriting when the feature is built, since
      the steps will change with it. Accepted: add a step to the plan
      that builds safety to revisit them, and let `links.test.ts` and the
      screenshot specs say which have broken.

- [x] Screenshots need no seeded cases, because the data is the
      mock-up's own. `backend/scripts/seed_guides.py` switches safety on
      at the guides' organisation and adds one `safety_officer` to sign
      in as. The specs photograph "Results acknowledgement service", the
      fullest of the five cases.

- [ ] Check the mock-up's invented names. The pictures are not
      published: every safety guide is read signed in, so its pictures
      go to the private bucket, and only signed-in readers see them. `frontend/src/lib/safety/fixtures.ts` says everything in
      it is made up, and the people plainly are. Three of its suppliers
      and products are close to real ones: "Northgate Digital" (near
      Northgate Public Services, a real health IT supplier), "MyCare
      portal" (a name real NHS patient portals use) and "MedScribe". The
      first picture, of the list of cases, shows "MedScribe EPMA 4.2" and
      "MyCare portal 2.0". Renaming them is a change to the mock-up and
      its tests, and Mark's to decide; it was not done here.

- [x] Link the pages the guides name, and place `GuideLink` on the
      safety landing page. Only `/safety` itself can be linked: every
      other safety page has a case's id in its address.

## Phase 12: Passport guides

- [x] Ten guides, each `feature: "passport"`. For a holder, asking for
      `passport_write`: "Start your passport", which also covers changing
      a specialty; "Ask for a sign-off"; "Keep your logbook"; "Record
      CPD", with the date ranges under Settings; "Add a certificate"; and
      "Write a reflection". For anybody who can open a passport,
      `assess_clinician_passport`: "Download your passport", which works
      read-only too; "Sign somebody off", from the inbox; and "Accept an
      invitation to assess", which is read before there is an account and
      so is public, as "Join a course" is. For a passport admin,
      `manage_passport`: "Add somebody to the passport".

- [x] Two of the guides proposed were not written, because the screens
      for them do not exist. There is no page for a passport admin to
      give somebody the right to write: it is the `passport_write`
      competency on the ordinary user form, or the organisation's cover,
      and "Add somebody to the passport" says both. And an assessor
      cannot decline a request: the route exists and no page calls it, so
      "Sign somebody off" says to press Cancel and tell the colleague.

- [ ] "Check a sign-off from a printed passport" was not written, because
      it would not work for the reader it is for. The page at
      `/passport/verify/:signOffId` opens without an account, but the
      request it makes is refused unless the reader is signed in, holds
      `assess_clinician_passport` and is the holder or the assessor of
      that sign-off. Somebody scanning the QR code on a printed passport
      is none of those and is told the record "could not be checked".
      Whether a stranger should be able to verify is a decision about the
      passport, not about its guides.

- [x] A holder with no organisation that has the passport can still read
      and export their own, through `owns_passport`. Done in Phase 10.

- [x] Seed a passport. A passport is a row and a git repository, and
      every page reads the repository. `compose.ci.yml` gave the backend
      nowhere to keep one: the default, `/data/passports`, does not exist
      in the image that stack runs. It now sets `PASSPORT_LOCAL_ROOT` to
      a directory the image's user may write. `seed_passport` in
      `backend/scripts/seed_guides.py` then makes the passport through the
      functions the passport's own routes call, `service` and `records`
      in `app.features.passport`, with every moment pinned so a date on a
      page is the same from run to run.

- [x] The seed holds: the passport feature and the organisation's cover
      switched on at the guides' organisation; a holder whose passport
      has a logbook entry, a CPD activity, a certificate, a reflection,
      one sign-off signed and one still waiting; a clinician with no
      passport yet, for the picture of starting one; the assessor named
      on both requests; and a passport admin.

- [x] Found while seeding, and fixed: a reflection with a long title
      could not be saved. A record's file is named for its title, the name
      went into the subject line of the commit that records it, and a
      subject over 72 characters was refused, which a holder saw only as
      "Your reflection could not be saved". A title of about forty
      characters was enough, and a certificate's title did the same.
      `fit_summary` in `backend/app/features/passport/commits.py` now cuts
      the summary to fit, with `...` where it was cut, and both write
      paths call it: `_write` in `records.py` and the sign-offs' in
      `service.py`. The title is still held whole in the record; only the
      line in the log is shorter. `build` still refuses an over-long
      subject, since for a summary written in code that is a mistake to
      fix. The line telling readers to keep a title short is taken out of
      "Write a reflection".

- [x] Reflections are not secret here: a guide may show one in a picture
      without hedging. The one photographed is invented, and "Write a
      reflection" says only what the page itself asks: that it be
      anonymous.

- [x] Screenshots for all ten. Forms are opened and left unsaved, so the
      assessor's request is still waiting on the next run. The invitation
      email is photographed from the copy rendered for Storybook, as the
      verification email is. No picture of the page the invitation leads
      to, which needs a real invitation's token to open.

- [x] Link the pages the guides name.

- [x] Place `GuideLink` on the passport's own page, to "Start your
      passport", and on the sign-off page, to "Sign somebody off". Their
      tests rendered the pages with no signed-in user, as All delegates'
      did, so each is given one.

- [x] Both phases add pages people move through, so journey 4 in
      `docs/docs/frontend/accessibility/journeys.md`, the passport's, is
      added to the "Not yet run" list in `testing-log.md` for the guide
      links on those pages.

- [ ] One thing for that round to look at: following the guide link from
      a half-filled sign-off form leaves the page. Whether the form asks
      before letting go, as an exam does, was not checked.

## Phase 13: Keep the pictures of signed-in guides behind login

Decided on 6 October 2026, on reading the pull request for the bucket. A
public bucket for every picture showed anybody what an admin's and an
operator's screens look like. Nothing in a picture is real, so this keeps
the look of those screens from the public and not anybody's data.

The first two steps were folded into the branches that made the bucket and
the workflow, so that neither can be merged in a state that publishes
those pictures. The rest is a branch of its own.

- [x] Two buckets, in `infra/modules/guide-assets/`. The public one holds
      only the pictures of guides marked `public`, and the load balancer
      still serves it at `/guide-assets/*`. A second, private one holds the
      rest: it has no backend bucket, and `public_access_prevention`
      refuses a public grant even if somebody adds one later. The backend
      may read it and is told its name as `GUIDE_ASSETS_GCS_BUCKET`.

- [x] Sort the pictures when they are uploaded.
      `frontend/scripts/list-public-guides.ts` prints the slug of each
      public guide from the registry, the workflow writes that beside the
      screenshots, and `upload-to-gcs.sh` sends a guide's folder to the
      public bucket only if the list names it. Private unless listed, and
      with no list nothing is uploaded: a mistake hides a picture that
      should be seen, and never publishes one that should not. Both
      buckets are mirrored, so a guide that stops being public has its
      pictures taken out of the public bucket on the next run.

- [x] Serve the private ones to somebody signed in.
      `GET /api/guides/assets/{guide}/{name}.png`, in
      `backend/app/guides/router.py`, reads the picture from the private
      bucket for anybody with a session. Being signed in is the whole
      check: which guides a reader is shown is still decided in the
      browser, for relevance, and this does not try to keep one member of
      staff's guide from another. The two parts of the address must each
      be lower case words joined by hyphens, so nothing outside
      `<guide>/<name>.png` can be asked for.

- [x] Point each guide at the right place. `guideImageBase` in
      `frontend/src/guides/registry.ts` gives a public guide `/guide-assets`
      and any other `/api/guides/assets`, and the guide page hands that to
      `MarkdownView`. A guide's markdown names its pictures as before.

- [x] In development every picture is read from the one local folder,
      `frontend/public/guide-assets/`, whatever the guide: there is no
      bucket there, and `just guide-screenshots` puts them all in it.

- [ ] A picture is asked for by the browser as an image, not by the API
      client, so it does not get the client's retry when the session's
      fifteen-minute cookie has just run out. A reader who opens a guide
      after sitting idle may see descriptions in place of pictures until
      something else on the page renews the session. Not seen in practice
      yet; if it is, have the guide page make one call through the client
      before it draws.

- [ ] After merging: the backend's new setting arrives by Terraform,
      which makes a revision that takes no traffic. Re-run `deploy.yml`
      and check the serving revision has `GUIDE_ASSETS_GCS_BUCKET`, then
      run the screenshot workflow once by hand and open a signed-in guide
      and the joining guide on the live site.

## Phase 14: Registration checks the clinical lead again

The first step of joining checks a clinical lead's email and tells the
browser which organisation and site that means. `/auth/register` then
took those two ids back unchecked. Somebody who skipped the first step
and sent the request by hand, with a guessed site id, became a trainee
at that site and was enrolled on its module with no clinical lead
involved.

- [x] `clinical_lead_site` in `backend/app/main.py` is the one place the
      rule lives. `validate_clinical_lead` asks it for the first step,
      and `register` asks it again.
- [x] `RegisterIn` gains `clinical_lead_email`. A registration naming a
      `site_id` or a `teaching_module_id` must send it, and a module with
      it. The server works the organisation and site out from the two,
      and uses its own answer from there on.
- [x] An `org_unit_id` or `site_id` that disagrees with that answer is
      refused. Either may be left out: the lead and the module are
      enough.
- [x] A site named with no module is refused. A clinical lead admits
      somebody for a module, so without one there is nothing to check.
- [x] The frontend sends the lead's email with the registration. It
      first carried it between the two pages in the router's state;
      Phase 15 then made them one page.
- [x] One deploy, not two. A tab left open on the second step across the
      deploy sends no lead and is refused, and nobody is using the site
      yet.
- [ ] Left as it was, and a human's call: a registration naming only an
      `org_unit_id`, with no site and no module, still joins that
      organisation as a trainee and is given a place there, with nothing
      checked. No page sends that request. It enrols on no module, so it
      opens no teaching, but it is the same fault one level up. Refusing
      it would change `test_registering_at_an_organisation_gives_the_place_there`
      on purpose.
- [ ] Where a clinical lead holds the post at more than one site, the
      first is chosen, as it was before. Whether the delegate should
      choose is not decided.

## Phase 15: One registration page

With Phase 14 done the two ids the browser sent are no longer needed:
the lead's email and the module say everything.

- [x] `/register` is one page with two views, in
      `frontend/src/pages/RegisterPage.tsx`. The first asks for the
      module and the clinical lead and calls `validate_clinical_lead`.
      The second is the account form. `TeachingRegisterPage.tsx` is
      gone.
- [x] One request is sent at the end, with the module and the lead's
      email and no `org_unit_id` or `site_id`. Nothing travels between
      pages in the router's state, and the redirect Phase 8 added for a
      refresh went with the second page: a refresh shows the first view.
- [x] `/register` is the address that stays, as Mark confirmed.
      `/teaching/register/:module` is gone and answers with the 404, with
      no redirect, also as Mark decided. Nothing in the application, an
      email or a guide linked to it.
- [x] A lead who is valid but whose organisation does not offer the
      module is told "Clinical lead not found" at the first view. The
      second page used to bounce them back with no explanation.
- [x] "Join a course" and its screenshot spec needed no rewrite. They
      describe two steps on the register page and a **Continue** button
      between them, which is still what a delegate sees.
- [ ] The second view has no way back to the first but a refresh. On
      two pages the browser's back button did that. Add a "Change
      module or clinical lead" control if anybody misses it.
- [ ] The second view does not say which site is being joined, though
      `validate_clinical_lead` returns its name. `RegistrationForm` has
      nowhere to show it.

## Decisions

- **Guides, not a FAQ** – every example that prompted this is a task with
  steps. A FAQ suits one-line answers and can be added later as one more
  page; it is left out for now.

- **In the application, not the documentation site** – the application
  knows who is reading, so it can filter and can link a page to its own
  guide. The MkDocs site is public and written for engineers.

- **Guides live in this repository, never a teaching repository** – a
  teaching repository's history is the version record for its
  assessments, and guide edits must not appear in it. Mark writes every
  guide, so nobody outside needs to edit one.

- **No guide belongs to one organisation yet** – the guides are written
  as generic teaching guides although EoEETA is the only reader. A way to
  mark a guide for one organisation is deferred until a second
  organisation needs different wording. This was a recommendation not yet
  confirmed.

- **Images in a bucket, not in git** – a set retaken on every merge would
  grow the repository without limit. Also a recommendation not yet
  confirmed, as is the `/guides` address.

- **"Retaken after every merge", not taken as the reader opens the
  page** – a screenshot at reading time would need a browser per reader.
  After each merge is never more than one merge behind.

- **One viewport and one theme** – desktop and light only. A phone reader
  sees desktop screenshots. Doubling or quadrupling the set is deferred
  until somebody is confused by it.
