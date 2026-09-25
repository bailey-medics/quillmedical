# Accessibility test journeys

Four scripts for testing Quill with a screen reader, a keyboard, zoom and
magnification. Each is a numbered list of steps, with what the tester
should hear, or where focus should be, after each one. A step passes when
that happens, fails when it does not, and is partial when it happens only
with effort a real user would not make. Record every run in the
[testing log](testing-log.md).

Automated end-to-end tests already walk parts of journeys 1 and 3 by
keyboard (`frontend/e2e/tests/keyboard.spec.ts`); these scripts are for
what automation cannot judge: whether the announcements make sense, and
whether a person can actually get through.

## How to run a journey

- **Screen readers.** VoiceOver with Safari on macOS and on iOS, NVDA with
  Firefox on Windows, and TalkBack with Chrome on Android where a device is
  available. Use the screen reader's own navigation (headings, landmarks,
  form controls) as a real user would, not only Tab.
- **Keyboard only.** No mouse or trackpad at all: Tab, Shift+Tab, Enter,
  Space and the arrow keys.
- **Zoom.** Browser zoom at 200% and at 400%. At 400% on a 1280px window
  the page is 320px wide, which WCAG 1.4.10 Reflow requires to work with
  no horizontal scrolling.
- **The expected results are written for a screen reader.** For a
  keyboard-only run, read "hear" as "see focus on".

## Journey 1: log in with two-factor authentication

Who walks it: every user with two-factor authentication on, which is
every clinician.

1. Open `/login`. Hear the page title and the level 1 heading "Sign in to
   Quill" ("Sign in to Quill Teaching" on the teaching platform).
2. Move to the username field. Hear "Username, edit text, required".
3. Type the username, move to the password field. Hear "Password, secure
   edit text, required".
4. Type the password and press Enter. Hear the message "Enter the 6-digit
   authenticator code", and focus moves to the new field: hear
   "Authenticator code, edit text".
5. Type the six-digit code and press Enter. Hear "Signed in" or the
   landing page's heading; focus is not left on a control that has gone.
6. Press Tab once. Hear "Skip to main content, link".
7. Press Enter. Focus moves into the page content; reading on starts at
   the page's heading, not at the ribbon or navigation.
8. **Wrong code.** Repeat steps 1 to 4, type a wrong code, press Enter.
   Hear the error "Wrong code entered…" without having to search for it;
   focus stays in or returns to the code field.

## Journey 2: find and open a patient

Who walks it: clinicians and clinical administrators.

1. From the home page, navigate by headings. Hear one level 1 heading,
   "Patients", then each patient's name as a level 2 heading.
2. While the list loads, hear "Loading patients"; once it has loaded, the
   list is not announced again.
3. Move to a patient and activate it. Hear the patient's name; focus
   lands on the new page, not back at the top of the old one.
4. Navigate by headings. Hear one level 1 heading, "Patient record".
5. Move through the cards (Messaging, Letters, Documents, Appointments,
   Notes). Each is announced with its title and is activated with Enter.
6. Open the side navigation from the ribbon's menu button on a narrow
   screen. Hear "Navigation, dialog"; Tab stays inside it; Escape or
   choosing a link closes it and focus returns to the menu button.
7. At 400% zoom, repeat steps 1 and 3 with no horizontal scrolling.

## Journey 3: open and complete a teaching lecture

Who walks it: delegates on the teaching platform.

1. From `/teaching`, navigate by headings. Hear "Teaching modules" (level
   1).
2. Open a module and then its learning materials. Hear "Learning
   materials" (level 1) and each lecture's title; each has one button,
   "Start", "Resume" or "Review".
3. Activate "Start". Hear the slide's title (level 2), and the slide
   progress bar as "Slide progress, 1 of N".
4. Read the slide with the screen reader's reading command. Callouts are
   read in their place, not announced as alerts when the slide opens.
5. Move to "Next" and activate it. Hear the next slide's title; the
   progress bar says "2 of N".
6. For a video slide: the player's controls are reachable by Tab, play
   and pause with Space, and captions can be switched on from its
   captions menu. Hear "YouTube video player" for a YouTube slide.
7. Reach the last slide and finish. Hear where you have landed.
8. Using only the side navigation's slide list, jump to slide 3. Each
   slide in the list is a button announced by its title.

## Journey 4: sign off a passport competency

Who walks it: assessors signing off a clinician's competency.

1. Open `/passport/inbox`. Hear "Sign-off requests" (level 1) and each
   request, announced by the competency's name.
2. Activate a request. Hear "Sign off" (level 1) and the competency.
3. Read the request's evidence with the reading command: observed date,
   the holder's details, the evidence. Each field is announced with its
   label.
4. Move through the sign-off form. Every field has a label; any date
   field's clear button is announced as "Clear date".
5. Submit. Hear the outcome as a status message without moving focus to
   find it.
6. Submit with a required field empty. Hear the error, and be able to
   reach the field it refers to.
7. At 200% zoom, the form and the evidence fit without horizontal
   scrolling.
