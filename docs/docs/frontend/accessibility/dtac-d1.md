# DTAC D1 evidence: usability and accessibility

The evidence for section D1 of the NHS Digital Technology Assessment Criteria
(revised April 2026), which asks a supplier to show accessibility was
designed in rather than asserted. It has four parts: the user journey map,
the WCAG 2.2 AA conformance record, the testing log, and the Accessible
Information Standard note.

Last updated: 24 September 2026. The status of each criterion changes as the
[testing log](testing-log.md) gains entries; this page should never claim
more than the log shows.

## User journey map

The four journeys that are scripted for assistive-technology testing, in
[journeys.md](journeys.md), and who walks each.

- **Log in with two-factor authentication** — every user with two-factor
  authentication on, which is every clinician. Covers the login form, the
  second-factor prompt, and landing on the first page. Automated keyboard
  test: yes. Screen reader: not yet run.
- **Find and open a patient** — clinicians and clinical administrators.
  Covers the patient list, the patient record, and the side navigation on
  a narrow screen. Automated keyboard test: no. Screen reader: not yet run.
- **Open and complete a teaching lecture** — delegates on the teaching
  platform. Covers the learning materials list, the slide reader, video
  with captions, and the slide list. Automated keyboard test: no, because
  CI seeds no teaching modules. Screen reader: not yet run.
- **Sign off a passport competency** — assessors. Covers the sign-off
  inbox, a request's evidence, and the sign-off form with its errors.
  Automated keyboard test: no. Screen reader: not yet run.

## WCAG 2.2 AA conformance record

Every level A and AA success criterion in WCAG 2.2, in the order of the
[NHS accessibility checklist](https://nhsdigital.github.io/accessibility-checklist/),
with its status and how it was established. 4.1.1 Parsing is omitted, as
WCAG 2.2 removed it.

What the statuses mean:

- **Pass** — met, and the evidence is named. Automated evidence is the axe
  checks on every Storybook story and on the e2e pages, in light and dark.
- **Pass by design** — met by how the product is built, checked in the code,
  not yet by a person using it.
- **Partial** — part of the criterion is evidenced; the rest needs the
  manual testing in the log.
- **Fail** — known not to be met.
- **Not applicable** — the product has no content of this kind.
- **Not yet assessed** — needs a person, and has not had one.

### 1. Perceivable

- **1.1.1 Non-text content (A)** — Partial. `Image` and `IconButton`
  require alt text and a label at compile time, and axe finds no image or
  control without one. Whether each alternative is meaningful needs a
  person.
- **1.2.1 Audio-only and video-only, prerecorded (A)** — Not yet assessed.
  Depends on the teaching content, not the software.
- **1.2.2 Captions, prerecorded (A)** — Partial. Hosted video carries
  WebVTT captions the learner can switch on, and YouTube provides its own.
  Whether every lecture has captions is a content check.
- **1.2.3 Audio description or media alternative, prerecorded (A)** — Not
  yet assessed. A content check.
- **1.2.4 Captions, live (AA)** — Not applicable. No live audio or video.
- **1.2.5 Audio description, prerecorded (AA)** — Not yet assessed. A
  content check.
- **1.3.1 Info and relationships (A)** — Partial. axe passes on labels,
  headings, lists, tables and landmarks, and every page has one h1.
  Screen reader testing is needed to confirm the structure is announced.
- **1.3.2 Meaningful sequence (A)** — Not yet assessed.
- **1.3.3 Sensory characteristics (A)** — Not yet assessed.
- **1.3.4 Orientation (AA)** — Pass by design. Layouts are responsive and
  nothing locks the orientation.
- **1.3.5 Identify input purpose (AA)** — Pass by design for the login,
  registration and password forms, which set `autocomplete` (`username`,
  `current-password`, `new-password`, `one-time-code`, `email`). Other
  forms not yet assessed.
- **1.4.1 Use of colour (A)** — Pass by design. Every status has an icon
  or text as well as a colour, and links are underlined.
- **1.4.2 Audio control (A)** — Pass by design. Nothing plays
  automatically.
- **1.4.3 Contrast, minimum (AA)** — Pass. axe on every story and page in
  both colour schemes, and `theme.test.ts` holds every text colour token to
  4.5:1 on the surfaces it is used on.
- **1.4.4 Resize text (AA)** — Not yet assessed. The 200% zoom run.
- **1.4.5 Images of text (AA)** — Pass. The only image of text is the
  logo, which the criterion exempts.
- **1.4.10 Reflow (AA)** — Not yet assessed. The 400% zoom run.
- **1.4.11 Non-text contrast (AA)** — Partial. Icons and input borders use
  greys of 3:1 or more by design; axe does not check this criterion, so a
  person needs to.
- **1.4.12 Text spacing (AA)** — Not yet assessed.
- **1.4.13 Content on hover or focus (AA)** — Not yet assessed. Tooltips
  are the case to check.

### 2. Operable

- **2.1.1 Keyboard (A)** — Partial. Automated keyboard tests log in with
  two-factor authentication and use the navigation, and the lint rules stop
  click handlers on elements a keyboard cannot reach. The side navigation
  failed this until #1091. The rest needs the manual keyboard runs.
- **2.1.2 No keyboard trap (A)** — Partial. The navigation drawer traps
  focus only while open, by design, and is inert when closed. Not yet
  tested by a person.
- **2.1.4 Character key shortcuts (A)** — Pass by design. The only
  shortcuts are the arrow keys in the slide reader, which are not
  character keys.
- **2.2.1 Timing adjustable (A)** — Pass by design. Sessions renew
  silently for seven days, beyond the criterion's twenty-hour exception.
  Timed assessments are an essential time limit, which the criterion
  exempts, since the timing is part of what is being assessed.
- **2.2.2 Pause, stop, hide (A)** — Not yet assessed. Loading skeletons
  animate while content loads; the reduced-motion setting is respected.
- **2.3.1 Three flashes or below threshold (A)** — Pass by design for the
  interface. Video content not yet assessed.
- **2.4.1 Bypass blocks (A)** — Pass. A skip link starts every page in a
  layout, checked by an automated keyboard test.
- **2.4.2 Page titled (A)** — Pass. Every page's title is its h1 and the
  site's name, since #1094; an e2e test checks one.
- **2.4.3 Focus order (A)** — Partial. Automated for the login journey;
  the rest needs the manual runs.
- **2.4.4 Link purpose, in context (A)** — Not yet assessed.
- **2.4.5 Multiple ways (AA)** — Not yet assessed.
- **2.4.6 Headings and labels (AA)** — Partial. Every page has one h1 and
  axe finds every control labelled; whether they describe their topic
  needs a person.
- **2.4.7 Focus visible (AA)** — Pass by design. Mantine draws a focus
  ring on keyboard focus throughout. Not yet checked page by page.
- **2.4.11 Focus not obscured, minimum (AA)** — Pass. An automated walk of
  every layout story at desktop and mobile widths found no focused element
  under the sticky ribbon.
- **2.5.1 Pointer gestures (A)** — Pass by design. Swiping between slides
  has Next and Previous buttons beside it.
- **2.5.2 Pointer cancellation (A)** — Pass by design. Controls activate on
  release, as native buttons do.
- **2.5.3 Label in name (A)** — Not yet assessed.
- **2.5.4 Motion actuation (A)** — Not applicable. Nothing responds to
  device motion.
- **2.5.7 Dragging movements (AA)** — Pass by design. The only dragging is
  dropping a file onto an upload area, which can also be clicked to open a
  file picker.
- **2.5.8 Target size, minimum (AA)** — Pass. axe's target-size rule on
  every story, and a measured sweep of every control.

### 3. Understandable

- **3.1.1 Language of page (A)** — Pass. `lang="en"` on the document.
- **3.1.2 Language of parts (AA)** — Not applicable. The interface is
  English only.
- **3.2.1 On focus (A)** — Not yet assessed.
- **3.2.2 On input (A)** — Not yet assessed.
- **3.2.3 Consistent navigation (AA)** — Pass by design. Every page uses
  one of three shared layouts.
- **3.2.4 Consistent identification (AA)** — Pass by design. Controls come
  from shared components.
- **3.2.6 Consistent help (A)** — Pass by design. Feedback is in the side
  navigation on every signed-in page, and every public page links to the
  accessibility statement, with its contact address, from the footer.
- **3.3.1 Error identification (A)** — Partial. Form errors are shown in
  text beside the field and announced; not yet tested with a screen reader.
- **3.3.2 Labels or instructions (A)** — Partial. axe finds every field
  labelled.
- **3.3.3 Error suggestion (AA)** — Not yet assessed.
- **3.3.4 Error prevention, legal, financial, data (AA)** — Partial.
  Creating a patient ends on a confirmation step, and destructive actions
  ask for confirmation. Not assessed across every form.
- **3.3.7 Redundant entry (A)** — Pass. Multi-step forms keep earlier
  answers, pinned by a unit test; "Confirm password" is the criterion's
  own exception.
- **3.3.8 Accessible authentication, minimum (AA)** — Pass by design.
  Passwords and codes can be pasted and filled by password managers, and
  there is no CAPTCHA.

### 4. Robust

- **4.1.2 Name, role, value (A)** — Partial. axe passes on every story and
  page. The side navigation's items had no usable role until #1091.
- **4.1.3 Status messages (AA)** — Partial. Loading, search results and
  form outcomes are in live regions; not yet tested with a screen reader.

## Testing log

The [testing log](testing-log.md) records every run, automated and manual,
with its date, tool, browser and findings, and lists the runs not yet done.

## Accessible Information Standard

The Accessible Information Standard (DAPB1605) obliges health and care
providers to identify, record, flag, share, meet and review the information
and communication needs of patients with a disability, impairment or
sensory loss. The obligation is the provider's; a supplier's part is a
product that can hold those needs as coded data and put them in front of
the person who has to meet them.

**What Quill will record.** The standard's four data subsets, held on the
patient's FHIR `Patient` resource as SNOMED CT coded entries:

- **Communication support** — for example a British Sign Language
  interpreter, or a deaf-blind manual alphabet interpreter.
- **Communication professional** — who is needed, for example a lip
  speaker.
- **Information format** — for example easy read, large print, Braille or
  audio.
- **Contact method** — for example text message rather than telephone,
  or contact through a carer.

Each entry records who recorded it and when, so that it can be reviewed,
which the standard also requires.

**How a recorded need will be flagged.** In the patient banner, beside the
patient's name, wherever the patient is open: a single, consistent marker
that the patient has communication needs, which opens the list of them.
The marker has text as well as an icon, and is announced to screen reader
users, so the flag itself is accessible.

**Status: designed, not built.** Quill holds no live patient records, and
the recording and flagging obligations only apply once it does. Building
the fields now would mean building them against no real requirements. The
data model work is on the [project to-do list](../../plans/todo.md) under
"Application bugs and missing features", to be done with the FHIR
demographics work, where it belongs alongside a patient's language
preference.
