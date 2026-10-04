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

## Phase 1: Add pdf.js, loaded from our own origin

- [x] Add `pdfjs-dist` to `frontend/package.json` with Yarn, then run
      `just utr` so the unit-test container picks it up. `pdfjs-dist`
      rather than `react-pdf`: only pages on a canvas are needed, and
      `react-pdf` adds a wrapper, its own text and annotation layers and
      their stylesheets, none of which this plan uses. Version 6.3 went
      in, with `yarn add` on the host, as no `just` recipe adds a
      package.

- [x] Bundle the pdf.js worker from our own origin, imported through
      Vite's `?url` suffix and handed to `GlobalWorkerOptions.workerSrc`,
      in `frontend/src/lib/pdf/openPdf.ts`. The application's policy in
      `caddy/prod/Caddyfile` is `script-src 'self'` with no `worker-src`,
      so a worker falls back to `script-src` and must be a file we serve.
      A worker from a CDN or a `blob:` URL would be refused.

- [x] Serve the image decoders pdf.js loads on demand, and choose the
      ones the policy allows. Scanned PDFs often hold JBIG2 or JPEG 2000
      images, which pdf.js decodes with code it fetches only when a
      document needs it, by a fixed file name from a folder it is told
      about. It ships each decoder twice: in WebAssembly, and in plain
      JavaScript as a fallback. Compiling WebAssembly needs
      `'wasm-unsafe-eval'` in `script-src`. The plain JavaScript ones
      need nothing, since a script from our own origin is already
      allowed. So `openPdf.ts` passes `useWasm: false`, and
      `pdfjsDecoders` in `frontend/vite.config.ts` serves the two
      JavaScript decoders under `pdfjs/`, in dev and in the build. A
      slower scan is a better trade than a looser policy, and the policy
      is unchanged.

      The fixed names are why they cannot go through the bundler, which
      would add a hash. They are read from the installed package at build
      time, not copied into the repository, so they cannot drift from the
      version in use.

      Not done: no JBIG2 or JPEG 2000 PDF was to hand, so the decoders
      are served but have not been seen decoding one.

- [x] Evaluated code needs nothing. This plan first said to pass
      `isEvalSupported: false`, so pdf.js would never build font code
      with `eval`. Version 6 has no such option and no `eval` left in it.

- [x] Check the worker file against the service worker's precache in
      `frontend/vite.config.ts`. Nothing to change: `globPatterns` there
      lists the logo and icon files by name and nothing else, so neither
      the worker nor the decoders are swept in. They are fetched when a
      PDF is first opened.

## Phase 2: A component that draws the pages

- [x] Create `PdfPages` in `frontend/src/components/documents/`, with
      `PdfPages.module.css`, `PdfPages.stories.tsx` and
      `PdfPages.test.tsx`. It takes the same `name` and `url` that
      `Document` does. It is a new component with nothing existing to
      compose it from, so this plan is the review the component rules
      ask for before one is built.

- [x] Fetch a file from the API with `api.blob` from `@/lib/api.ts` and
      hand the bytes to pdf.js, rather than giving pdf.js the URL. pdf.js
      would otherwise make its own request, which sidesteps the client:
      no retry on a 401, so a PDF opened just after the access token
      lapsed would fail where every other request recovers.

      Only a URL under `/api/` goes this way. `api.blob` can fetch
      nothing else, and clinic letters are still demonstration files
      served beside the application (`frontend/src/data/fakeDocuments.ts`),
      so any other URL is left to pdf.js to fetch.

- [x] Draw each page to a canvas in a column, one under the other, sized
      to the width of the container and scaled by `devicePixelRatio` so
      text is sharp on a phone screen. Redraw when the width changes, as
      it does when a tablet is turned. The ratio is capped at two: a
      phone reporting three would hold over thirty megabytes for each A4
      page, for a difference nobody sees at reading distance.

- [x] Draw a page only as it nears the viewport, with an
      `IntersectionObserver`, and hold its place until then. A long
      letter drawn all at once is slow and heavy on memory on a phone.
      The canvas itself holds the place: it carries the page's width and
      height as attributes, and `height: auto` keeps that shape, so no
      separate box and no inline style is needed.

- [x] Give each canvas `role="img"` and a label such as "Page 2 of 5".
      A canvas has no text a screen reader can read, so put a way to the
      file itself above the pages, labelled "Open file". It is also the
      way to save or print, since there is no toolbar. Built as a button
      (`IconTextButton`) that opens the file in a new tab, not a link:
      the only link component, `TextLink`, is for routes inside the
      application, and a new typography component needs a human to ask
      for it.

- [x] Show `ErrorState` when the file cannot be fetched or pdf.js
      cannot read it, with "Open file" as its action, and a spinner
      until the document has opened. A single page that cannot be drawn
      says so beneath itself and leaves the others showing.

- [x] Clean up on unmount: cancel any page still drawing and destroy
      the pdf.js loading task. Without it, leaving the page mid-draw
      leaks the worker's copy of the document.

- [x] Styling in the CSS module, in `rem`, with colours from the design
      system. No inline styles. A page is white in both colour schemes,
      because it is a sheet of paper and a PDF assumes one.

- [x] Tests mock `pdfjs-dist`, because jsdom cannot draw a canvas. Cover
      one page and several, the labels, the loading state, a failed fetch,
      a file pdf.js rejects, and clean-up on unmount. Stories use a
      three-page PDF, `frontend/public/mock-documents/6_three_page_letter.pdf`,
      in light and dark.

- [x] Let Storybook's fetch mock in `frontend/.storybook/preview.tsx`
      pass real files through. It replaced `fetch` for every request,
      answered 404 to anything it did not know, and assumed a string, so
      pdf.js, which passes a `URL`, could not load a PDF in any story.
      Only `/api/` requests are mocked now. Found by opening the stories
      in a phone-sized Chromium, where the three-page fixture and a
      clinic letter both drew every page with a clean console.

## Phase 3: Choose the viewer in `Document`

- [x] Add a hook beside `Document`, `useNativePdfViewer`, true only when
      both hold: `navigator.pdfViewerEnabled` is true, and the main
      pointer is a mouse (`pointer: fine`). Neither is enough alone.
      Android answers the first with "no", which is right. iOS Safari
      answers "yes" and then draws one page, so the pointer check is
      what catches it. No device is named: an iPad announces itself as a
      Mac, so matching on names would miss it. The pointer is read on the
      first render, not after it: starting from "no" would have every
      desktop browser begin loading pdf.js and then drop it.

- [x] In `Document`, keep the iframe when the hook is true and render
      `PdfPages` otherwise. Import `PdfPages` with `React.lazy`, so a
      desktop browser never downloads pdf.js.

- [x] Delete the phone workaround in `Document`: the iframe scaled to
      two thirds inside a clipped box, and the `#toolbar=0&navpanes=0`
      parameters added to the URL. Both only ever tidied the iframe on a
      small touch screen, which no longer gets an iframe. Move the one
      remaining iframe's inline style into a CSS module while there.

- [x] Update `Document.test.tsx` and `Document.stories.tsx`: the iframe
      when the hook is true, `PdfPages` when it is false, and a story
      that forces the pdf.js path so it can be seen on a desktop. The
      story does it by making the browser report no viewer, so
      `Document` gains no prop that exists only for Storybook.

- [x] Correct the docstring in
      `frontend/src/pages/passport/PassportCertificatePage.tsx`, which
      says a PDF is shown "in the browser's own viewer". Leave the
      framing comment in `infra/modules/load-balancer/main.tf` alone:
      desktop still frames the API response, so `frame-ancestors 'self'`
      is still needed.

## Phase 4: Prove it behind the production policy

Moved here from Phase 1, where it was first written. There was nothing
to open until `Document` used the component, so it could not come first.

- [x] Open a PDF of several pages through pdf.js behind the production
      Caddy policy, and fail on any refusal. `just e2e` runs the built
      application behind `caddy/prod/Caddyfile`, so an end-to-end test,
      `frontend/e2e/tests/pdf-pages.spec.ts`, is the proof and keeps
      proving it. It opens a certificate page with the browser made to
      report no PDF viewer, in Chromium and in WebKit, the engine
      Safari on an iPhone uses.

      The result: nothing pdf.js does is refused, and the policy needed
      no change. The worker starts, a three-page PDF draws every page,
      and a PDF carrying its own font draws too, which settles the
      `font-src 'self'` question. The test also checks the two decoders
      are served as scripts under `pdfjs/`.

      The stack seeds no passport, so the test supplies the three API
      answers the page needs and the PDF bytes. The app, its worker and
      its policy are real.

- [x] Found on the way, and fixed: the inline script in
      `frontend/index.html` that sets the colour scheme before the
      styles load was refused by `script-src 'self'` on every page, so
      in production it never ran, and somebody using dark mode saw a
      light flash on each load. It had nothing to do with pdf.js. It is
      now a file of its own, `frontend/public/colour-scheme.js`, which
      the policy allows. `frontend/e2e/tests/colour-scheme.spec.ts`
      checks it runs behind the policy, and the PDF test no longer sets
      any refusal aside.

## Phase 5: Check on real devices

On the live application, open a certificate with a PDF of several pages
and confirm every page can be reached. One step for each device, so what
has and has not been seen is plain.

- [x] **Galaxy tablet** – pdf.js path. Confirmed on 4 October 2026:
      the pages draw, and "Open file" downloads the PDF. Which of Chrome
      and Samsung Internet it was tried in was not recorded.

- [x] **iPhone, Safari** – pdf.js path. Confirmed on 4 October 2026:
      every page can be reached, and "Open file" works.

- [-] **iPad, Safari** – pdf.js path. Not checked: there is no iPad to
  try it on. It is assumed to behave as the iPhone does. If it turns
  out to report a mouse as its main pointer, as it may with a
  keyboard case attached, it would get the frame and show one page,
  and the gate in `useNativePdfViewer` would need another look.

- [x] **MacBook** – the frame, unchanged. Confirmed on 4 October
      2026: a PDF shows in the browser's own viewer as it did before.
      Which of Chrome and Safari it was tried in was not recorded.

- [x] Confirm on a desktop, in the network panel, that no pdf.js file
      is requested. Confirmed on the MacBook on 4 October 2026: with a
      PDF open, nothing from pdf.js is fetched.

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
