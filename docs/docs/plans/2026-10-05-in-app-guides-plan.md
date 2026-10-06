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

- [ ] Move `/guides/:slug` outside `<RequireAuth>`. Signed out, a guide
      marked `public` renders inside `PublicLayout`; anything else is the
      public 404. Signed in, nothing changes. One address for each guide
      and not a second public copy, so there is one thing to keep right.
      The list at `/guides` stays signed-in only.

- [ ] Write "Join a course", audience `delegate`, `public: true`, covering
      self-registration through `TeachingRegisterPage`, the verification
      email and first login.

- [ ] Link to it from `TeachingRegisterPage.tsx` and `LoginPage.tsx`, and
      from the public site in `frontend/public_pages/`, which is a separate
      build and needs the full application address.

- [ ] Tests: a public guide renders signed out, a non-public one gives the
      404 signed out, and both render signed in.

## Phase 3: Screenshots retaken by Playwright

Hand-taken screenshots would be stale within weeks at the rate the screens
change. The seeded CI stack and Playwright already exist, so the
screenshots are made by a script and never by hand.

- [ ] Let a guide name its screenshots as ordinary markdown images with a
      relative address, `![The add delegate form](add-delegate/form.png)`.
      `MarkdownView` allows no `img` today. Add an opt-in prop that allows
      it and rewrites the address to sit under `/guide-assets/`, refusing
      anything absolute, so the letters and messages that also use
      `MarkdownView` gain nothing and a guide cannot pull an image from
      elsewhere. Alt text is required: a test fails any guide image without
      it.

- [ ] Add a Playwright project `guide-screenshots` in
      `frontend/playwright.config.ts`, with its specs in
      `frontend/e2e/guides/`, one per guide. Each walks the flow against
      the seeded stack and calls `page.screenshot` at the steps the guide
      shows, writing to `<slug>/<name>.png`. One desktop viewport, light
      theme. Keep it out of the default `just e2e` run: it is a build
      step, not a test of the application.

- [ ] Check `backend/scripts/seed_ci.py` gives each flow what it needs (an
      admin holding `manage_teaching`, a module to enrol on) and extend it
      if not. Every name on screen is then seeded and fake by construction.

- [ ] Add a `just` recipe, following `.claude/rules/just.md`, that runs
      the project on the per-worktree `compose.ci.yml` stack through
      `_e2e-run` and leaves the images in a gitignored
      `frontend/public/guide-assets/`, where the Vite dev server serves
      them. A guide can then be written and looked at locally with its
      real screenshots.

- [ ] A test ties the two halves together: every image a guide refers to
      is produced by a spec, and every image a spec produces is referred
      to. Without it a renamed step silently leaves a broken image.

- [ ] Add a public bucket for the images and route `/guide-assets/*` to it
      on the load balancer in `infra/`, beside the `/videos/*` backend
      bucket. Public and unsigned, unlike video: the images hold only
      seeded data, and the joining guide shows them to somebody with no
      session. Add the matching route to the dev and production Caddy
      files where they need one. This applies on merge through
      `terraform.yml`; check the run.

- [ ] Add a workflow that runs after a merge to `main` touching
      `frontend/src/**` or `frontend/e2e/guides/**`: bring up the CI
      stack, run the project, sync the images to the bucket. Separate from
      `deploy.yml`, so a broken screenshot script never blocks a release.
      Authenticate with Workload Identity Federation as
      `public-site.yml` does.

- [ ] A failed run posts to Slack through `slack-notify.yml`. It is
      worth reading: a spec that can no longer find a button means the
      words of that guide are out of date too.

- [ ] When an image is missing, show its alt text in a plain box and not a
      broken image, since the first deploy runs before the first sync.

## Phase 4: Write the guides

After the screenshots, so each guide is written once with its pictures and
not revisited.

- [ ] "Assign a teaching admin", audience `superadmin`.
- [ ] "Add a delegate by hand", audience `admin`: add its screenshots to
      the Phase 1 text.
- [ ] "Join a course", audience `delegate`, public: add its screenshots.
- [ ] "Take a module and its assessment", audience `delegate`.
- [ ] "See delegates' results", audience `admin`.
- [ ] Add `docs/docs/frontend/guides.md` on how to write a guide: the
      registry entry, the markdown file, the screenshot spec and the
      recipe. Register it in `docs/mkdocs.yml`.
- [ ] The new user form calls its "Organisation/site" step optional, and
      for a scoped manager it is not: the API answers "Choose at least one
      organisation or site." only after "Create user" is pressed on the
      last step. Found while writing "Add a delegate by hand", which warns
      of it. The form should say so on the step, in
      `frontend/src/pages/UserInfoUpdatePage.tsx`; then take the warning
      out of the guide.
- [ ] There is no enrolment yet: phases 3 to 6 of
      `2026-10-04-teaching-access-results-modules-and-enrolment-plan.md`
      are unbuilt. A delegate sees whatever is live for their site's
      organisation, and the guides say that. When enrolment lands, "Add a
      delegate by hand" and "Take a module and its assessment" both change.
- [ ] Setting up a superadmin is deliberately not a guide. It happens at a
      command line before anybody can sign in, and is already written up in
      `docs/docs/infrastructure/admin.md`.

## Phase 5: Link each page to its guide

- [ ] Build `GuideLink`, taking a `slug`, and place it in the page header
      of the pages the guides describe: the user form under
      `frontend/src/pages/admin/`, the delegates page, the teaching
      dashboard. It matters more than the navigation entry, because
      somebody stuck looks at the page they are on.
- [ ] `GuideLink` takes its slug as a union of the registry's slugs, so a
      link to a guide that has been removed fails the typecheck.
- [ ] It renders nothing when the reader's tier cannot see the guide.

## Phase 6: A welcome video for new admins

Last, and the only video: film costs the most to redo, so it is added once
everything it would otherwise have to explain is written down.

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

- [ ] This plan adds a navigation entry and public pages, so it touches
      journeys 1 to 4 in `docs/docs/frontend/accessibility/journeys.md`,
      all of which pass through the navigation. Add "Journeys 1 to 4
      again, for the Guides link in the navigation" to the "Not yet run"
      list in `testing-log.md`, with a note that a guide page itself (its
      heading order, image alt text and the captioned video) wants a pass
      of its own.

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
