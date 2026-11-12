<!-- cspell:words brandable HarfBuzz Harf OKLCH wordmarks -->
# Branded app plan

Quill can already be run as another brand, but only on a local stack of
41 branches in the `quillmedical-4` worktree, built for one client's
demo and never pushed to Quill's repository. Its brand branches make the
app brandable: a brand file, a theme built from it, the brand's logo and
wordmark, its spinner on the first paint, its tab icon and web app
manifest, a Storybook brand switch, and `just sa <brand>` to run the app
locally as the brand. A future client who wants a branded app is the
same need, so the branding belongs in Quill itself.

This plan carries that branding work out of the source stack into a new
stack of its own, built in the `quillmedical-6` worktree from `main`,
and lands it in Quill unit by unit as pull requests. Only the general
code and the lessons come across: the source stack's brand, which this
plan calls the alternative brand, its safety code and its plans stay
out, since every mention of that brand is eventually to leave Quill's
code base. Quill's example second brand is Let's Do Digital (`ldd`),
already public in Quill as an email brand. The scope is what already
runs locally, the app under `just sa ldd` and Storybook under
`just sb ldd`; choosing a brand for a deployment is a later plan.

## Phase 0: Set up worktree 6

- [x] **Know the ground rules before anything else.** The source stack
      in `quillmedical-4` is read, never changed: no checkout of its
      branches, no `just stack-*` recipe run against it, and nothing in
      that worktree touched. Nothing from it is pushed as it stands:
      each unit is reworked here (Phase 2) so it carries no trace of the
      alternative brand before it is landed. The usual rules in
      `CLAUDE.md` hold too: units landed with `/crpd`, one commit per
      stacked branch.

- [x] **Read the design the brand branches were built from.** The first
      ten brand branches are explained by the Storybook brand switch
      plan at the top of `brand-dark-ribbon`
      (`git show feature/brand-dark-ribbon:docs/docs/plans/2026-11-06-storybook-brand-switch-plan.md`).
      The later ones (`brand-runs-the-app`, `sa-takes-a-brand`,
      `<alternative brand name>-spinner`, `brand-icons`,
      `brand-splash-first`) have commit subjects but no message bodies;
      their reasoning is in Phase B1 of the safety plan dated
      2026-11-07 at the top of the stack, on
      `feature/editor-sticky-toolbar-and-buttons`, and in their code
      comments. Read on 10 November 2026. Neither plan comes into Quill;
      what they taught is written into Phase 3's branding guide.

- [x] **Bring `quillmedical-6` to the tip of `main`.** It was parked,
      clean, on a `main` commit (the merge of #2421) 22 commits behind on
      10 November. `just stack-fresh` moves it to `origin/main` and
      carries this plan across, uncommitted. Check with
      `git rev-list --left-right --count HEAD...origin/main`, which must
      say `0 0`. Of those 22 commits, only the `Justfile` and
      `compose.dev.yml` changes touch files the brand units also touch,
      so conflicts should be small. The local `aws-*` branches contain
      the old commit but are not checked out here; leave them alone.
      Done on 10 November 2026: `main` was then at `9b3d8de7d`.

- [x] **Choose the stack key, and check it is free.** `brand` is the
      obvious one, and branch names such as `brand-app-themes` would read
      back as `Brand: app themes`. Check no open pull request's branch
      starts with it (`gh pr list --state open --json headRefName`). The
      source stack's branches already use `brand-…`, but they are local
      only and in another worktree, so names must still differ:
      `stack-new` refuses a branch name that exists. Use the names in
      Phase 2, not the source names. `brand` was free on 10 November
      2026: no open pull request's branch, and none of the Phase 2 names
      local.

- [x] **Know how to read the source.** Every source branch is in the
      shared git store, so worktree 6 can read it without visiting
      `quillmedical-4`: `git diff feature/<parent> feature/<branch>` shows
      one unit. Carry a unit across with
      `git diff feature/<parent> feature/<branch> -- <paths> | git apply -3`,
      never `git cherry-pick`, which this repository blocks, and never by
      checking out a source branch here, since a branch can only be
      checked out in one worktree. The parent of each source branch is
      the one below it in this list, from the bottom: `brand-file`,
      `brand-theme`, `brand-logo`, `brand-switch`, `brand-foundations`,
      `brand-wordmark-font`, `brand-safety-layout`, `brand-inbox-icon`,
      `brand-<alternative brand name>-contrast`, `brand-dark-ribbon`,
      `<alternative brand name>-safety-plan`, `brand-runs-the-app`,
      `sa-takes-a-brand`, then the safety branches, then
      `<alternative brand name>-spinner` (parent `safety-delegation`),
      `brand-icons` (parent `safety-document-editor-tables`) and
      `brand-splash-first` (parent `editor-plain-addresses`). Where a
      name holds the alternative brand's name, `git branch --list
      'feature/*-spinner'` and the like give it; `just stl` in
      `quillmedical-4` draws the whole order.

- [ ] **Check the branding in Storybook; run the app as a brand only from
      the main checkout.** `just sb ldd` (once the switch is carried
      over) runs from any worktree, as do `just uf`, `just ub` and
      `just ts`. The dev stack runs only from the main checkout, and this
      plan keeps it that way (Phase 1), so `just sa ldd` is tried there,
      once `quillmedical-4` has released the stack after the demo on
      11 November 2026.

## Phase 1: Questions answered before building

- [x] **Do these units go to Quill's public repository as pull
      requests?** Yes, because the example brand is now Quill's own
      (next answer) and the alternative brand does not come across.
      Mark, 10 November 2026.

- [x] **Which example brand does Quill carry?** Let's Do Digital, under
      the key `ldd`, the same key as its email theme in
      `shared/brand.yaml`. It is already public in Quill: the email
      theme, `frontend/public/email/ldd-logo.png` and the
      `LetsDoDigitalLogo` component. So nobody outside has to agree, and
      the alternative brand stays in its own copy. Every unit swaps the
      alternative brand's values, assets, tests and comments for Let's
      Do Digital's or for general wording, and this plan names it only
      as "the alternative brand". Mark, 10 November 2026, who also said
      every mention of it is eventually to leave Quill.

- [x] **Is the brand chosen at build time, or per site?** Neither is
      built here. The plan recreates only what runs locally: `just sa
      ldd` sets `BRAND` and `VITE_BRAND` for the dev stack, and
      `just sb ldd` sets `STORYBOOK_BRAND`. How a deployment chooses its
      brand, one build per brand or one deployment serving several, is a
      later plan. Mark, 10 November 2026.

- [x] **What may a brand change?** What the source stack already sets:
      its name, colours (with contrast checked in `theme.test.ts` for
      every brand), logo, wordmark, the idle inbox icon's colour, its
      spinner and still frame, tab and home screen icons, web app
      manifest, and email theme. Anything more, such as its own wording,
      help links or features, is new work for a later plan.

- [x] **What of `brand-runs-the-app` comes across?** All of it, and its
      git committer is put to use. `main`'s passport store commits as a
      fixed "Quill Medical" (`COMMITTER_NAME` in
      `backend/app/features/passport/store.py`), so the brand's committer
      has a real user in Quill. **The committer's name is the brand's
      full name**, `identity.name`, read from that one place rather than
      kept as a second copy under `committer`. Mark, 10 November 2026.

- [x] **What of `sa-takes-a-brand` comes across?** The brand argument
      only: `just sa ldd`, sorted in `scripts/start-app-args.sh` with its
      bats tests. The `QUILL_DEV_STACK_HERE=1` override, which let a
      worktree other than the main checkout run the dev stack for the
      demo, stays out, as does its `CLAUDE.md` paragraph. Only the main
      checkout runs the stack, as today. Mark, 10 November 2026.

- [x] **Are `brand-safety-layout` and `guides-<alternative brand name>`
      wanted?** No. The first is Storybook stories of the safety
      components, which do not come across. The second makes `just gsh`
      take a brand, but the same commit removes six safety mock-up
      guides; guides per brand can be a later change if wanted.

- [x] **Does the Storybook brand switch plan come too?** No. It is
      written about the alternative brand throughout. Its lessons are
      carried into `docs/docs/frontend/branding.md` (Phase 3), and the
      reasoning each unit needs is written into that unit's step below.
      Mark, 10 November 2026.

- [x] **How is the plan run, and who makes the visual calls?** With
      `/f`, so each unit lands as a draft pull request without a stop in
      between. Choices of look (the wordmark's size and weight on the
      ribbon, the white tile around the logo, how the spinning logo
      turns) are made from Storybook screenshots during the run and
      listed under "Decisions to check" in that unit's pull request, for
      Mark to change at review. Mark, 10 November 2026.

## Phase 2: The units, in order

Each unit is one branch and one draft pull request, landed with
`/crpd draft`, in the order below, which is the source stack's own
order. Every unit carries its own tests from the source, with the
alternative brand's names, values, assets and comments swapped for Let's
Do Digital's or for general wording, and nothing from the safety
branches. Before each commit, a case-insensitive search of the unit's
diff for the alternative brand's name finds nothing.

- [x] **`brand-app-themes`: a brand file the backend checks.** From
      `brand-file`: an `app_themes.ldd` entry in `shared/brand.yaml`, its
      Pydantic models in `backend/app/email/brand.py` (with
      `extra="forbid"`), the regenerated `frontend/src/generated/`
      types, and any words `cspell.config.json` needs. Not the source's
      plan document or its index entry. The colours, by the source's
      method: **the logo's blue, `#0848a9`, is the primary**, the place
      Quill's navy holds, and **a mid-dark grey from the logo's front
      head is the secondary**, the place Quill's amber holds (Mark,
      10 November 2026). The head shades from white to dark grey, so
      take the grey from its darker half, dark enough that highlights
      are clearly seen. Build each ramp in OKLCH around its logo colour,
      keeping the hue and stepping the lightness, lightest at 0 and
      darkest at 9, with the logo colour at shade 5, Mantine's
      `primaryShade`; check that white on shade 5 passes AA and that
      shades 6 to 9 of the blue are dark enough to be dark mode's
      surfaces. Comment each shade with its use, as Quill's are.

      **Built with the colours only.** The source's first branch also
      put a logo path and a wordmark in the theme, but neither file
      exists until `brand-logo-and-wordmark`, so those fields, their
      checks and their types arrive in that unit, and this one stands on
      its own. The blue measured from the 714 pixel logo is `#0848a9`
      exactly; the front head's greys run evenly from about 80 to 240,
      and `#707070` is the middle of its darker half. The ramps, made
      with a throwaway OKLCH script in the scratchpad: blue shade 5 is
      8.4:1 on white and shades 6 to 9 run from `#053785` to `#000d2b`,
      as dark as Quill's navy 6 to 9; grey shade 5 is 4.95:1 on white.
      Shade 4 of the blue is 4.33:1 on white, short of AA for text, which
      matters only if it is used for links; `brand-colour-fixes` gives
      each brand its own link colour. `mark` is white, the tile the logo
      sits on. `just ub app/email/brand_test.py` passes (18).

- [x] **`brand-theme-from-the-brand`: the theme is built from the
      brand, Quill's unchanged.** From `brand-theme`: `makeTheme(brand)`
      in `theme.ts` builds the Mantine theme from a brand, carrying the
      brand on `theme.other`, and `theme.quill-baseline.json` with
      `theme.test.ts` proves Quill's theme comes out identical, variable
      for variable, in light and dark. Small component fixes ride along
      (`BurgerButton`, `SolidSwitch`, `QuillSpinner` CSS,
      `dark-overrides.css`).

      **Built without the logo and wordmark on `theme.other`**, for the
      same reason as the unit above: they, and the test that a brand's
      theme nested inside Quill's keeps them (the `deepMerge` trap),
      arrive with `brand-logo-and-wordmark`. `theme.other` carries only
      `brand` for now. `just uf src/theme.test.ts
      src/components/button/BurgerButton.test.tsx` passes (73), the
      Quill baseline among them.

- [x] **`brand-logo-and-wordmark`: the brand's logo and wordmark.** From
      `brand-logo` and `brand-wordmark-font` together, as one unit: the
      first added a font package and the second took it out again in
      favour of a wordmark drawn as an SVG, so carrying the net change
      avoids adding and removing a dependency. `QuillLogo` and
      `QuillName` become brand-aware. Under
      `frontend/public/brands/ldd/`:
      - **`logo.png`** - the 714 by 714 PNG from `media/ldd-logo.png` in
        `letsdodigital/letsdodigital.github.io`, unchanged, with the
        commit it was taken from recorded beside it. No SVG of the logo
        exists in the `letsdodigital` organisation, and 714 pixels is
        more than the app ever draws (Mark, 10 November 2026). The brand
        file's logo path, its backend check and its type allow a PNG.
      - **On a white tile** - the logo's back head is the ribbon's blue,
        so on the ribbon `QuillLogo` draws it on a small white tile, as
        `LetsDoDigitalLogo` already does on the navy public pages (Mark,
        10 November 2026). The tile belongs to the brand (a flag in the
        brand file), not to every logo.
      - **`wordmark-white.svg`** - "Let's Do Digital" in white, in
        Source Sans 3, the site's and the email theme's font, each
        letter's outline written as a path so no font loads. Shaped with
        HarfBuzz and outlined with fontTools in the scratchpad, as the
        source's was; the box sized so the letters sit as Quill's do in
        `quill-name-white.png`, since the ribbon is a fixed height. Three
        words may need a smaller size than a one-word name; settled from
        screenshots of the ribbon and flagged in the pull request.

      **Built, with two findings.** The ribbon does not show `QuillLogo`
      at all, only `QuillName`; the logo is on the sign-in and
      registration pages, on the page's own background. So the tile does
      its work in dark mode, where the page is the brand's dark blue
      behind a blue head, and is invisible on a white light-mode page.
      And the tile's colour is carried on `theme.other.logoTile`, read by
      `QuillLogo` like the logo itself: a first try set it as a CSS
      variable from the theme's variables resolver, but a theme nested
      with `MantineThemeProvider`, as a story's is, never runs the
      resolver, so the tile vanished. The logo comes from commit
      `2970845dfdd9` and weighs 217 KB, unoptimised as the step asks.
      The wordmark is Source Sans 3 700 from Fontsource 5.3.0, chosen
      over 600 because it carries on the ribbon as Quill's heavy serif
      does; the box runs from 20% above the cap height to 45% of it below
      the baseline, so the capitals fill about three fifths of it, a
      little smaller than Quill's, and it draws about 196 pixels wide at
      the ribbon's 2.1rem against Quill's 71. `just uf src/theme.test.ts
      src/components/images/QuillLogo.test.tsx
      src/components/images/QuillName.test.tsx` passes (96), and
      `just ub app/email/brand_test.py` (22). Both stories were looked at
      in a running Storybook, in light and dark.

      **The wordmark is now Geostar Fill** (Mark, 11 November 2026:
      it is the font he sets the name in). It is a Google Font under the
      SIL Open Font Licence, by Joe Prince, in one weight only. The font
      file, unchanged, and its `OFL.txt` are kept in
      `frontend/brand-sources/ldd/`, outside `public/` so the build does
      not ship a font nothing loads; the licence reserves the name
      "Geostar", so the file is never trimmed or edited.
      `scripts/brand-wordmark.py` draws the wordmark from it, so it can
      be drawn again. A bold, made by tracing every letter's outline with
      a line 50 font units wide, was tried and looked too heavy in the
      app, so the font's one weight is used; the script keeps `--bold`
      for a font that needs it. The font is wide: the name draws about
      290 pixels across at the ribbon's height, against 196 in Source
      Sans 3.

      **A dark wordmark too** (Mark, 11 November 2026), for the dark font
      story, which showed Quill's name whatever the brand.
      `wordmark-dark.svg` is the same drawing in the brand blue,
      `#0848a9`, named by an optional `dark_src` on the wordmark;
      `QuillName` takes `colour="dark"` as `QuillLogo` takes its colour,
      and falls back to the white wordmark for a brand without a dark
      one. The ribbon still uses the white. The stories that wrapped the
      name and logo in Let's Do Digital's theme were taken out
      afterwards (Mark, 11 November 2026): `just sb ldd` shows every
      story as the brand, so they repeated the stories above them.

- [x] **`brand-storybook-switch`: choose the brand in Storybook.** From
      `brand-switch` and `brand-foundations`: `just sb <brand>`, with the
      recipe's `case` reading `quill|ldd`, the switch in
      `.storybook/preview.tsx`, and Foundations/Colours showing the
      running brand (`BrandFoundations.tsx`), with Let's Do Digital's
      own labels ("blue", "grey") and logo section. `.storybook/preview.tsx`
      also gained a line from `safety-frontend` on the source stack; take
      only the brand lines.

      **Built.** `theme.other` also gains `colours`, the brand's four
      colours, which the Colours page reads. `just sb purple` stops with
      "Unknown brand 'purple': quill or ldd." and starts nothing.
      `just sb ldd` was opened and looked at: the ribbon is the brand
      blue with the white wordmark and a grey bottom border, and
      Foundations/Colours shows the blue and grey, their scales and the
      Let's Do Digital logo section. `just uf src/theme.test.ts
      src/stories/BrandFoundations.test.tsx` passes (69).

      **The stories that show whichever brand is running no longer name
      Quill** (Mark, 11 November 2026): "Images/Brand name",
      "Images/Brand logo" and "Feedback/Brand spinner", the fixed
      "Quill Medical" alt text taken out of their default stories so it
      follows the brand, and "Loading Quill app" now "Loading the app".
      Where "Quill" names the product itself, as in "a Quill account", it
      stays. Foundations/Colours names Geostar Fill for the wordmark and
      shows the dark one too.

      **"Images/Brand logo", Default, is always the navy feather on
      white** (Mark, 11 November 2026). It had left `colour` at `"auto"`,
      which turns the feather white in dark mode, so the story showed a
      white feather on its white box. Pinned to `"default"`, and held in
      light mode so the whole canvas is white rather than a white box on
      a dark page, it now differs from Light grey and White in both
      modes. Light grey and White fill the whole canvas with the brand's
      own colour instead of a box, so each of the three is shown on a
      full screen of the colour it is meant for.

      **The EoEETA and Let's Do Digital logos no longer stretch**
      (Mark, 11 November 2026). Each sits on a `BaseCard`, which filled
      whatever width it was given, and the image was stretched across it:
      in their stories, where the card spans the canvas, both logos came
      out several times too wide. The public pages hid it, because a
      centred `Stack` shrinks the card. The card now hugs the logo
      (`w="fit-content"`), and a test in each holds it.

- [x] **`brand-colour-fixes`: contrast and colours held for every
      brand.** From `brand-inbox-icon`,
      `brand-<alternative brand name>-contrast` and `brand-dark-ribbon`,
      as one unit: the idle inbox icon takes a colour per brand
      (`ribbon_icon_idle`), each brand has its own light-mode `link`
      colour, links and the current navigation item meet WCAG AA in
      every brand (held in `theme.test.ts`), and the ribbon in dark mode
      is the page's own colour (`--ribbon-bg`). Let's Do Digital's values
      are chosen to pass those tests. Then sweep the whole Storybook as
      Let's Do Digital with the Storybook test runner, in light and dark:
      the alternative brand passed its unit tests but failed 66 Storybook
      contrast checks, because Quill's colour tokens assume Quill's dark
      ramp. **Fix only by changing Let's Do Digital's own values** in
      `brand.yaml`. A failure that needs a shared colour token changed is
      not fixed here: it is recorded in this plan, under a new step in
      Phase 3, with the story and the colours that fail (Mark,
      10 November 2026).

      **Built, and the grey moved.** The idle mail icon is secondary 6,
      `#c0c0c0`, 4.6:1 on the light ribbon and 9.2:1 on the dark one,
      where Quill's grey 6 would be 2.5:1. Links are the logo blue,
      `#0848a9`, 8.4:1 on white, as the brand's emails' links are. The
      first sweep, with `just sbt` against `just sb ldd`, failed 54 of
      971 Storybook tests in 18 files, every one colour contrast, from
      two causes in the brand's own values. **The mid-dark grey,
      `#707070`, was too dark**: the app sets the secondary against the
      brand primary (public pages, secondary buttons) and against
      dark-mode surfaces, which is why Quill's amber is light, and the
      grey was 1.7:1 on the blue and 2.2:1 on blue shade 6. So the
      secondary is now `#d0d0d0`, from the lighter half of the logo's
      head, 5.4:1 on the blue; shade 6 stays light (`#c0c0c0`, 4.6:1
      with blue text) because a hovered secondary button is shade 6 with
      blue text, and shade 7 is dark (`#686868`, 5.0:1 on `gray.1`) for
      the current navigation link. This departs from the mid-dark grey
      chosen in Phase 1 and is flagged for Mark in the pull request.
      **Blue shade 4 took white text at 4.32:1**, so it is now `#3d6fc0`,
      5.0:1. No failure needed a shared colour token, so nothing was
      recorded for Phase 3. The second sweep passed: 968 passed and 3
      skipped of 971. `just uf src/theme.test.ts
      src/components/inbox/InboxButton.test.tsx
      src/components/ribbon/TopRibbon.test.tsx
      src/stories/BrandFoundations.test.tsx` passes (119), and
      `just ub app/email/brand_test.py` (24).

- [x] **`brand-runs-locally`: the app runs locally as a brand.** From
      `brand-runs-the-app` and `sa-takes-a-brand`, shaped by Phase 1 (named
      `brand-runs-locally` here, because the source branch holds the
      other name):
      `BRAND` in `backend/app/config.py`, checked against the brand file;
      `VITE_BRAND` in `frontend/src/main.tsx` and `vite-env.d.ts`; the
      page title from the brand in `useDocumentTitle`; `BRAND` and
      `VITE_BRAND` in `compose.dev.yml`; `just sa <brand>` with
      `scripts/start-app-args.sh`, its bats tests and the line in
      `.claude/rules/just.md`. The `identity` block gives each brand a
      `name`, `short_name` and committer address; the committer's name is
      `identity.name`. Let's Do Digital's are "Let's Do Digital", "LDD"
      (the label under a home screen icon, where about 12 letters fit)
      and `info@letsdodigital.org` (Mark, 10 November 2026). The passport
      store's `COMMITTER_NAME` and `COMMITTER_EMAIL` then read from the
      brand that `BRAND` names, with a test that a Let's Do Digital build
      commits as "Let's Do Digital". No `QUILL_DEV_STACK_HERE` and no
      `CLAUDE.md` paragraph.

      **Built.** The identity holds `name`, `short_name` and
      `committer_email`; there is no separate committer name. The
      passport package must import without `app.config`, so
      `LocalPassportStore` and `GcsPassportStore` take a `Committer`
      (defaulting to Quill's, for tooling with no application round it),
      the bucket store passes it to the local store each write is made
      in, and `brand_committer` in `backend/app/passport_storage.py`
      builds it from `settings.BRAND`. The frontend's `Identity` has no
      committer, since only the backend commits. The source also renamed
      the volume `just sa b` removes to follow the folder it runs from;
      that was for the override, so it stays out. `just ub
      app/email/brand_test.py app/config_test.py
      app/passport_storage_test.py app/features/passport/store_test.py
      app/features/passport/gcs_store_test.py
      tests/features_import_boundary_test.py` passes (227), `just uf
      src/theme.test.ts src/lib/accessibility/useDocumentTitle.test.tsx`
      (81), and `just ts scripts/tests` (438, the seven new among them).
      `just sa ldd` itself waits for the main checkout, as Phase 0 says.

- [x] **`brand-splash-and-icons`: the brand from the first paint.** From
      `<alternative brand name>-spinner`, `brand-icons` and
      `brand-splash-first`: the Vite plugin in
      `frontend/scripts/brandSplash.ts` that rewrites `index.html` for
      the brand (title, splash spinner, tab icon, home screen icon,
      manifest, theme colour, run with `order: "pre"` so deep dev
      addresses work), the brand spinner in `QuillSpinner`, and the
      `spinner` and `icons` blocks in `brand.yaml`. These three sit above
      the safety work in the source stack, but they touch no safety file;
      expect small conflicts only in `frontend/src/generated/index.d.ts`.
      Let's Do Digital's assets:
      - **The spinner, for now** - the Let's Do Digital logo turning,
        made in the form the brand's `spinner` block already takes (an
        animated webp and a still frame under
        `frontend/public/brands/ldd/`, rendered from `logo.png`), so the
        later swap is a change of files only.
      - **Mark's own spinner, later** - when Mark provides it, its
        source goes under `frontend/brand-sources/ldd/`, the files are
        replaced on this branch with `just stu`, which rebases anything
        above it.
      - **Tab and home screen icons, and the manifest** - rendered from
        `logo.png` with Playwright's Chromium, as the source's were from
        its logo.

      **Built.** The stand-in spinner is the logo on its white tile,
      turning on its upright axis, 48 frames of 50 ms, so one turn in 2.4
      seconds as the quill's; `logo-spinner.webp` (230 KB) and
      `logo-spinner-still.png`. It and the icons were drawn with Pillow
      in the scratchpad rather than Playwright's Chromium, because the
      source is a PNG, not an SVG, so there is nothing to render; no
      script is kept, as the artwork is made once. The icons are the logo
      cropped to its mark and set on white inside the 80% safe zone a
      maskable Android icon needs: 512, 192, the 180 pixel touch icon,
      and a favicon of 16, 32 and 48. `just uf scripts/brandSplash.test.ts
      src/components/loading-spinner/QuillSpinner.test.tsx
      src/theme.test.ts` passes (124), and `just ub
      app/email/brand_test.py` (41). The spinner stories were looked at
      in Storybook, in light and dark.

      **Mark kept the stand-in, and asked for it to be lit as the quill
      is** (10 November 2026). The quill fades lit and shadowed copies
      over its face; the brand spinner is one image, so the light is
      drawn into its frames instead. After a first try, Mark asked for no
      tile and a bright light from the left: the two heads alone, on a
      transparent ground. He then asked for a darker shade, a slower
      change into the light, and a much lighter end. Counting each half
      turn from 0 degrees, edge on, through 90, face on, to 180: the
      heads are at 30% of their colours until 45 degrees, ease up to the
      colours as drawn by 110, hold them to 120, then ease 80% of the way
      to white by 165. The change into the light starts earlier than the
      70 degrees Mark first named, because 70 to 100 still looked like a
      light switched on. 72 frames of 33 ms, so still 2.4 seconds a
      turn, at webp quality 70 (340 KB). The still frame is the heads as
      drawn, with no tile. The blue head is faint on the dark-mode page
      while in shade, and the very light end fades into a white page.
      The two spinner stories and two page spinner stories that wrapped
      the spinner in Let's Do Digital's theme were taken out (Mark,
      11 November 2026): under `just sb ldd` they repeated the stories
      above them.

## Phase 3: Make it a feature for clients

- [ ] **Write `docs/docs/frontend/branding.md`: how to add a brand, and
      what was learnt.** The steps a developer follows for a new client,
      in order: the block in `shared/brand.yaml`, the files under
      `frontend/public/brands/<brand>/` and how each is made, running
      `yarn generate:types`, and checking it with `just sb <brand>`,
      `theme.test.ts`'s contrast checks and a Storybook sweep, then
      `just sa <brand>` from the main checkout. Then the lessons from the
      source stack, which is where they are kept now its plans do not
      come across:
      - **Ramps from the logo** - hue kept, lightness stepped in OKLCH,
        the logo colour at shade 5, and shades 6 to 9 dark enough for
        dark mode.
      - **Contrast is tested, not judged by eye** - the unit tests
        caught two failures and the Storybook sweep found 66 more.
      - **Quill's baseline** - `theme.quill-baseline.json` is what shows
        a brand change left Quill alone.
      - **The brand rides on `theme.other`** - no context of our own.
      - **Wordmarks are drawn SVGs** - outlines as paths, so no font
        loads, made once with HarfBuzz and fontTools.
      - **Mantine's `deepMerge` turns `undefined` into `{}`** - so a
        brand's optional keys are left out, never set to `undefined`.

      Link it from the docs index.

- [ ] **A test that every brand in `brand.yaml` is complete.** Every
      file a brand names exists under `frontend/public/` (as
      `brandSplash.test.ts` already checks for the manifest icons), for
      every brand, so a new client's brand cannot ship with a missing
      icon.

- [ ] **Name the accessibility journeys this touches.** The ribbon's
      colours, the logo and the splash change for a brand, so per the plan
      rules, list the journeys in
      `docs/docs/frontend/accessibility/journeys.md` that pass through the
      ribbon and navigation, and add them to the "Not yet run" list in
      `testing-log.md`, for Let's Do Digital as well as Quill.

## Phase 4: Afterwards

- [ ] **Swap in Mark's Let's Do Digital spinner** when he provides it,
      on `brand-splash-and-icons`, as that unit's step describes.

- [ ] **Once the brand stack has merged, decide what happens to the
      source stack's own brand branches.** Rebasing the source stack onto
      a `main` that already has the branding would make its brand
      branches conflict or empty out, as the offline fix did on
      10 November. After the demo, rebase it with `just stack-rebase` in
      `quillmedical-4` and resolve towards `main`'s version; empty
      branches can then be dropped from that stack.

## Decisions

- **The source stack is read, never changed** - it holds the demo for
  11 November and is copied to the alternative brand's own repository.
  Branding is carried out of it by diff, so nothing in `quillmedical-4`
  moves.

- **Let's Do Digital, not the alternative brand, is Quill's example
  brand** - it is Mark's own and already public in Quill, so the units
  can land without anyone else's agreement, and Quill holds no client's
  identity. The cost is reworking each unit and making its assets, rather
  than copying them.

- **The lessons come across, the source plans do not** - both source
  plans are written about the alternative brand, so what they taught is
  rewritten into the units and the branding guide instead.

- **Local only** - the plan recreates `just sa <brand>` and
  `just sb <brand>`. Choosing a brand for a deployment needs its own
  decisions, such as one build per brand or one deployment per web
  address, and waits for a client who needs it.

- **Contrast is fixed in the brand's own values only** - changing a
  colour token Quill shares risks Quill's own look for the sake of an
  example brand, so failures that need one are recorded for a later
  decision rather than fixed in this stack.

- **Units follow the source order, with small neighbours folded
  together** - a logo unit that adds a font and the next that removes it
  are one unit, and three one-line colour fixes are one, so each pull
  request is a change worth reviewing, not a step and its undoing.
