# PDF viewer on touch devices plan

A PDF attached to a passport certificate cannot be read on a phone or
tablet. `Document` (`frontend/src/components/documents/Document.tsx`) shows
a PDF by pointing an iframe at it and leaving the browser's built-in viewer
to draw it. That works on a desktop browser. Found in UAT on 4 October 2026:
Chrome on a Galaxy tablet has no viewer that works inside a frame and shows
a broken-file icon, and Safari on an iPhone draws the first page only, with
no way to scroll to the rest. Clinic letters go through the same component
(`frontend/src/pages/PatientDocumentView.tsx`), so they fail the same way.

The outcome wanted is that a PDF can be read in full on any device. Desktop
keeps the built-in viewer, which gives search, print, zoom and download for
nothing. Everything else draws the pages itself with pdf.js, loaded only
when it is needed.

## Phase 1: Prove pdf.js works under our content security policy

- [ ] Add `pdfjs-dist` to `frontend/package.json` with Yarn, then run
      `just utr` so the unit-test container picks it up. `pdfjs-dist`
      rather than `react-pdf`: only pages on a canvas are needed, and
      `react-pdf` adds a wrapper, its own text and annotation layers and
      their stylesheets, none of which this plan uses.

- [ ] Bundle the pdf.js worker from our own origin, imported through
      Vite's `?url` suffix and handed to `GlobalWorkerOptions.workerSrc`.
      The application's policy in `caddy/prod/Caddyfile` is
      `script-src 'self'` with no `worker-src`, so a worker falls back to
      `script-src` and must be a file we serve. A worker from a CDN or a
      `blob:` URL would be refused.

- [ ] Build the frontend and open a multi-page PDF through pdf.js behind
      the production Caddy policy, watching the console for refusals.
      Three things are not yet known and each would need the policy
      loosened or pdf.js configured around it:

    - **WebAssembly decoders** – recent pdf.js versions decode some
      image formats common in scanned letters (JPEG 2000 is one) with
      WebAssembly, which `script-src 'self'` refuses unless
      `'wasm-unsafe-eval'` is added. Try a scanned PDF, not only a
      generated one.

    - **Images and fonts** – `img-src` allows `'self'` and `data:` but
      not `blob:`, and `font-src` is `'self'` only. pdf.js draws to a
      canvas, so it should need neither, but embedded fonts are the case
      to try.

    - **Evaluated code** – pass `isEvalSupported: false`, so pdf.js
      never tries to build font code with `eval`, which the policy
      refuses.

      Record here what was needed. If the policy has to change, it
      changes in `caddy/prod/Caddyfile` and the dev Caddyfile together.

- [ ] Check the worker file against the service worker's precache in
      `frontend/vite.config.ts`. It should be fetched when a PDF is first
      opened, not downloaded by every visitor on install. Exclude it from
      the precache if it has been swept in.

## Phase 2: A component that draws the pages

- [ ] Create `PdfPages` in `frontend/src/components/documents/`, with
      `PdfPages.module.css`, `PdfPages.stories.tsx` and
      `PdfPages.test.tsx`. It takes the same `name` and `url` that
      `Document` does. It is a new component with nothing existing to
      compose it from, so this plan is the review the component rules
      ask for before one is built.

- [ ] Fetch the file with `api.blob` from `@/lib/api.ts` and hand the
      bytes to pdf.js, rather than giving pdf.js the URL. pdf.js would
      otherwise make its own request, which sidesteps the client: no
      retry on a 401, so a PDF opened just after the access token lapsed
      would fail where every other request recovers.

- [ ] Draw each page to a canvas in a column, one under the other, sized
      to the width of the container and scaled by `devicePixelRatio` so
      text is sharp on a phone screen. Redraw when the width changes, as
      it does when a tablet is turned.

- [ ] Draw a page only as it nears the viewport, with an
      `IntersectionObserver`, and hold its place with a box of the right
      height until then. A long letter drawn all at once is slow and
      heavy on memory on a phone.

- [ ] Give each canvas `role="img"` and a label such as "Page 2 of 5".
      A canvas has no text a screen reader can read, so put a link to
      the file itself above the pages, labelled "Open file". That link
      is also the way to save or print, since there is no toolbar.

- [ ] Show `ErrorState` when the file cannot be fetched or pdf.js
      cannot read it, with the same "Open file" link, and a loading
      state until the first page is drawn.

- [ ] Clean up on unmount: cancel any page still drawing and destroy
      the pdf.js loading task. Without it, leaving the page mid-draw
      leaks the worker's copy of the document.

- [ ] Styling in the CSS module, in `rem`, with colours from the design
      system. No inline styles.

- [ ] Tests mock `pdfjs-dist`, because jsdom cannot draw a canvas. Cover
      one page and several, the labels, the loading state, a failed fetch,
      a file pdf.js rejects, and clean-up on unmount. Stories use a small
      PDF fixture of two or three pages, in light and dark.

## Phase 3: Choose the viewer in `Document`

- [ ] Add a hook beside `Document`, `useNativePdfViewer`, true only when
      both hold: `navigator.pdfViewerEnabled` is true, and the main
      pointer is a mouse (`pointer: fine`). Neither is enough alone.
      Android answers the first with "no", which is right. iOS Safari
      answers "yes" and then draws one page, so the pointer check is
      what catches it. No device is named: an iPad announces itself as a
      Mac, so matching on names would miss it.

- [ ] In `Document`, keep the iframe when the hook is true and render
      `PdfPages` otherwise. Import `PdfPages` with `React.lazy`, so a
      desktop browser never downloads pdf.js.

- [ ] Delete the phone workaround in `Document`: the iframe scaled to
      two thirds inside a clipped box, and the `#toolbar=0&navpanes=0`
      parameters added to the URL. Both only ever tidied the iframe on a
      small touch screen, which no longer gets an iframe. Move the one
      remaining iframe's inline style into a CSS module while there.

- [ ] Update `Document.test.tsx` and `Document.stories.tsx`: the iframe
      when the hook is true, `PdfPages` when it is false, and a story
      that forces the pdf.js path so it can be seen on a desktop.

- [ ] Correct the docstring in
      `frontend/src/pages/passport/PassportCertificatePage.tsx`, which
      says a PDF is shown "in the browser's own viewer". Leave the
      framing comment in `infra/modules/load-balancer/main.tf` alone:
      desktop still frames the API response, so `frame-ancestors 'self'`
      is still needed.

## Phase 4: Check on real devices

- [ ] On the teaching deployment, open a certificate with a PDF of
      several pages on each of these and confirm every page can be
      reached:

    - **Galaxy tablet, Chrome and Samsung Internet** – pdf.js path.
    - **iPhone, Safari** – pdf.js path.
    - **iPad, Safari** – pdf.js path. Not checked before this plan; it
      is assumed to behave as the iPhone does.
    - **MacBook, Chrome and Safari** – the iframe, unchanged.

- [ ] Confirm on a desktop, in the network panel, that no pdf.js file
      is requested.

## Decisions

- **Desktop keeps the iframe** – the built-in viewer has search, print,
  zoom and download, and on pdf.js each would have to be built. The
  price is two paths to keep working. It is accepted because the pdf.js
  path can be forced in Storybook and so stays testable without a phone.

- **The gate asks what the browser can do, not what it is** – "has a
  viewer and uses a mouse". A wrong guess sends a capable browser down
  the pdf.js path, which still shows the PDF. The other way round would
  not, so the gate errs towards pdf.js.

- **No text layer on the pdf.js path** – pages are pictures, so text
  cannot be selected or searched on a phone, and a screen reader reads
  only the page labels. The "Open file" link is the way through for
  both. A text layer is pdf.js's answer and can be added later if
  anybody asks for it; it roughly doubles the component.

- **Images are untouched** – a PNG or JPEG attachment already shows on
  every device, and HEIC keeps its download link.
