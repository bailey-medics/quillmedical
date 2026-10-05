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

- [ ] The seed has an organisation and no site, so the screenshot of the
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
- [ ] "See delegates' results" has less to describe than its title
      suggests: a row of the All delegates table does not open anything,
      so there is no page of one delegate's results to send an admin to.
- [ ] There is no enrolment yet: phases 3 to 6 of
      `2026-10-04-teaching-access-results-modules-and-enrolment-plan.md`
      are unbuilt. A delegate sees whatever is live for their site's
      organisation, and the guides say that. When enrolment lands, "Add a
      delegate by hand" and "Take a module and its assessment" both change.
- [ ] Setting up a superadmin is deliberately not a guide. It happens at a
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

- [ ] Keep the delegate's site across a refresh. `RegisterPage.tsx`
      validates the clinical lead and hands the organisation and site it
      gets back to `/teaching/register/:module` as router state, which a
      refresh, a bookmark or a link opened in a new tab all lose.
      `TeachingRegisterPage.tsx` then posts to `/auth/register` with
      neither, and the account is created belonging nowhere: the delegate
      signs in to "No access" and nobody is told. Carry what the second
      step needs in something that survives, and decide which: the address
      itself, or `sessionStorage`. The address is the more honest, since
      `:module` is already in it and is read by nothing.

- [ ] Whichever is chosen, the server must not take the browser's word
      for the site. Today `org_unit_id` and `site_id` arrive in the
      request body from router state, so anybody can already name a site
      they have no clinical lead at. Have `/auth/register` work the site
      out again from the module and the clinical lead's email, as
      `validate_clinical_lead` in `backend/app/main.py` does, and refuse a
      mismatch. This changes who can end up a member where, so it wants a
      careful read.

- [ ] Refuse the orphan. When the second step is opened with nothing to
      say where the delegate belongs, send them back to `/register` with
      a message saying why, and have `/auth/register` refuse a teaching
      registration that names no site. An account that belongs nowhere
      should be impossible to make by accident.

- [ ] Then take the "Do not refresh this page" paragraph out of
      `frontend/src/guides/content/join-a-course.md`.

- [ ] Give the failed-verification page a way forward. "Resend
      verification email" on `VerifyEmail.tsx` leads to
      `/verify-email-pending`, whose resend button is drawn only when the
      page knows the address, and arriving this way it does not. Either
      ask for the address there, or send the delegate to sign in, which
      already sends a fresh link to an unverified account. The guide says
      to sign in; the page should say the same.

- [ ] Look up an email address the same way everywhere. `register`
      stores it as typed and `resend-verification` looks it up in lower
      case, so somebody who typed capitals may never be sent a second link
      while the page says one was sent. Not traced to the end: check
      `/auth/verify-email`, login and password reset for the same
      mismatch first, then store and compare in one case. Existing rows
      need a migration to match, and two accounts that differ only by
      case need a decision before it runs.

- [ ] These change the registration and login flow, so they touch
      journey 1 in `docs/docs/frontend/accessibility/journeys.md`. Add it
      to the "Not yet run" list in `testing-log.md`.

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
