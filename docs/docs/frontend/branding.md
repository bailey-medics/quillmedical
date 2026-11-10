<!-- cspell:words HarfBuzz Harf OKLCH -->
# Branding

Quill can run as another brand: its own name, colours, logo, wordmark,
spinner, tab icon and web app manifest. Let's Do Digital (`ldd`) is the
example brand, and the one every test checks beside Quill. A brand is
chosen when the app starts locally: `just sb <brand>` runs Storybook as
it, and `just sa <brand>` runs the dev stack as it. How a deployment would
choose its brand is not built yet.

Everything a brand changes is one entry under `app_themes` in
`shared/brand.yaml`, and the files that entry names under
`frontend/public/brands/<brand>/`. Quill's own values stay at the top of
the file, so nothing that already reads it, the email themes above all,
changes when a brand is added.

## What a brand sets

- **`identity`** - its full `name`, for the page title and as the
  committer of every passport commit; its `short_name`, for the label
  under a home screen icon (about twelve letters fit); and the
  `committer_email` those commits come from.
- **`brand`** - the four brand colours: `primary`, `secondary`,
  `background` and `mark`, the tile the logo sits on.
- **`palette`** - the `primary` and `secondary` ramps, ten shades each,
  lightest first. The grey ramp is Mantine's, shared by every brand.
- **`ribbon_icon_idle`** - the top ribbon's mail icon while nothing is
  waiting. It must reach 3:1 on the ribbon in light and dark.
- **`link`** - links in light mode, 4.5:1 or more on white.
- **`logo`** - the logo, under `frontend/public`. One file for light and
  dark.
- **`logo_tile`** - optional: a tile colour drawn behind the logo, for a
  logo that would be lost on the brand's own colours.
- **`wordmark`** - the name drawn as an image for the top ribbon, white,
  with its `alt` text, and optionally `dark_src`, the same name drawn
  dark for a light background.
- **`spinner`** - optional: an animated image and its still first frame,
  in place of the turning quill. Without one the brand keeps the quill.
- **`icons`** - optional: the tab icon, the touch icon, the web app
  manifest and the phone's status bar colour. Without them the brand
  keeps Quill's.

`AppTheme` in `backend/app/email/brand.py` checks every field when the
backend starts, and refuses any field it does not know.

## How to add a brand

1. **Add its entry under `app_themes` in `shared/brand.yaml`**, with the
   fields above. Copy the `ldd` entry and its comments, and say on each
   colour where it came from.
2. **Put its files under `frontend/public/brands/<brand>/`**: the logo,
   the wordmark, and the spinner and icons if it has them. How each is
   made is under "What was learnt" below.
3. **Add it to the two hand-written lists of brands**: the `case` in the
   `storybook` recipe in the `Justfile`, and `BRANDS` in
   `scripts/start-app-args.sh`. Both refuse an unknown brand before
   anything starts. Add a line for it to the bats test beside the script.
4. **Give it words in `BRAND_WORDS`** in
   `frontend/src/stories/BrandFoundations.tsx`, so Foundations/Colours
   describes its colours and logo in its own terms. The page throws for a
   brand with none.
5. **Run `yarn generate:types`** in `frontend/`, so `brand.json` holds
   the new entry.
6. **Run the tests**: `just uf src/theme.test.ts` checks every brand's
   contrast, `just uf scripts/brandSplash.test.ts` checks every file a
   brand names is there, and `just ub app/email/brand_test.py` checks the
   backend accepts the entry.
7. **Look at it, then sweep it.** Run `just sb <brand>` and open
   Foundations/Colours and the ribbon stories in light and dark. Then, with
   that Storybook still running, run `just sbt`, which tests every story's
   accessibility against it.
8. **Run the app as it**, from the main checkout: `just sa <brand>`.

## What was learnt

These come from building the branding against a real second brand first,
and then Let's Do Digital.

- **Build the ramps from the logo.** Keep the logo colour's hue in OKLCH
  and step the lightness, lightest at shade 0, with the logo colour at
  shade 5, which Mantine uses for filled buttons. Shades 6 to 9 of the
  primary must be dark enough to be dark mode's surfaces, as Quill's navy
  6 to 9 are.
- **The secondary must be light.** The app sets the secondary against
  the brand primary: on the public pages, on secondary buttons, and on
  dark-mode surfaces. That is why Quill's is amber. Let's Do Digital's
  first grey, a mid-dark `#707070`, failed 54 Storybook contrast checks;
  a light `#d0d0d0` passed them all. Shade 6 stays light too, because a
  hovered secondary button is shade 6 with primary-coloured text.
- **Contrast is tested, not judged by eye.** `theme.test.ts` holds every
  brand's links, current navigation item, body text and idle mail icon to
  WCAG AA. Those checks caught two failures; the Storybook sweep, which
  axe runs over every story, found the rest. Run both.
- **Quill's baseline keeps Quill still.** `theme.quill-baseline.json`
  holds every CSS variable `theme.ts` set before brands existed. If a
  brand change moves Quill, that test fails.
- **The brand rides on the Mantine theme.** `theme.other` carries the
  brand's name, colours, logo, tile, wordmark and spinner, so a component
  asks `useMantineTheme()` and there is no second provider to keep in step.
  Keep it there rather than in a CSS variable: a theme nested with
  `MantineThemeProvider`, as a story's is, never runs the theme's
  variables resolver.
- **Leave a brand's optional keys out, never `undefined`.** Mantine's
  `deepMerge` turns `undefined` merged with an object into `{}`, so a
  brand's theme nested inside Quill's would lose its wordmark.
- **Draw the wordmark as an SVG, from the brand's own font.** Keep the
  font, unchanged, with its licence under `frontend/brand-sources/<brand>/`,
  outside `public/` so the build does not ship it. Then run
  `scripts/brand-wordmark.py`, which writes each letter's outline as a
  path, so no font has to load, with the font's own kerning. Its box puts
  the capitals in the ribbon as Quill's sit in `quill-name-white.png`.
  `--bold` thickens a font that comes in one weight, as Let's Do
  Digital's Geostar Fill does. Look at it on the ribbon before settling:
  a wide font or a long name draws wide.
- **Make the spinner and icons from the logo.** The spinner is an animated
  WebP and its first frame as a PNG; the icons are the logo on white,
  inside the middle 80% an Android launcher may crop to, at 512, 192 and
  180 pixels, with a 16, 32 and 48 pixel favicon. Let's Do Digital's were
  drawn with Pillow from its PNG logo; an SVG logo can be rendered with
  Playwright's Chromium instead.
- **Check the files a brand names exist.** `brandSplash.test.ts` does it
  for every brand in the file, so a brand cannot ship with a missing icon.

See the [branded app plan](../plans/2026-11-10-branded-app-plan.md) for
how the branding came into Quill.
