# Legal links at registration plan

Somebody who registers for Quill gives a name and an email address, and
nothing on the form points them to the privacy policy or the terms of
service. UK GDPR Article 13 wants the privacy information given at the
moment the data is collected, and terms bind only somebody who was shown
them before signing up. The links exist today only in the public site's
footer, which no app page uses. Worse, the two pages they lead to are
placeholders saying the text is "currently being finalised", so a link
added now would point at nothing.

The outcome is real policy pages on the public site, and one sentence
above the submit button on every form that creates an account, linking to
both. No tick box: the privacy policy is a notice, not something people
consent to, and continuing past a clear sentence is enough to accept the
terms.

## Phase 1: Write the policies (Mark)

Nothing in Phase 2 may ship before this. A sentence saying "you agree to
our terms" beside a page with no terms on it is worse than no sentence.

- [ ] **Write the privacy policy,** replacing the placeholder in
      `frontend/public_pages/src/pages/privacy-policy.tsx`. It has to say
      who the controller is, what is collected at registration (name,
      email, username, password hash), the lawful basis for each use, who
      it is shared with (Resend for email, Google Cloud for hosting), how
      long it is kept, and the rights people have and how to use them.
      The marketing emails need their own paragraph: the form already
      carries the opt-out from the
      [Marketing opt-out](2026-10-03-marketing-opt-out-plan.md) plan, and
      the policy is where that choice is explained.

- [ ] **Write the terms of service,** replacing the placeholder in
      `frontend/public_pages/src/pages/terms-of-service.tsx`. Give the
      page a visible "Last updated" date, because that date is the only
      record of which terms somebody was shown (see Decisions).

- [ ] **Have both read by somebody qualified** before they go live. The
      reading of the law behind this plan is not legal advice.

- [ ] **Deploy the public site** and check both pages at
      `https://quill-medical.com/privacy-policy` and
      `https://quill-medical.com/terms-of-service`.

## Phase 2: The sentence on the forms

- [x] **Add an external link component, `ExternalTextLink`,** in
      `frontend/src/components/typography/`, with its `.stories.tsx` and
      `.test.tsx`. `TextLink` cannot do this job: it wraps React Router's
      `Link`, and the policies live on the public site at
      `quill-medical.com`, a different origin from the app. The new one
      takes `href` and `children`, reuses `TextLink.module.css` so the two
      look the same, and opens in a new tab with `rel="noopener
      noreferrer"`, so a half-filled form is not lost. It says "(opens in
      a new tab)" to a screen reader. This is a new component, so its
      shape is for Mark to agree before it is built. Built on 5 October
      2026 in an unattended run, so that agreement is the review of its
      pull request.

- [x] **Put the wording and the two addresses in one place,**
      `frontend/src/lib/legal/links.ts`, the way
      `frontend/src/lib/marketing/wording.ts` holds the marketing
      sentence. The addresses are absolute and point at
      `https://quill-medical.com` in every environment: the dev stack
      does not serve the public pages, and the backend already does the
      same with `EMAIL_ASSET_BASE_URL`. As built, the file holds the two
      addresses and the two link labels; the sentence around them is in
      `LegalNotice`, because it has links inside it and cannot be one
      string.

- [x] **Add a `LegalNotice` component** in
      `frontend/src/components/registration/`, with stories and tests,
      rendering: "By creating an account you agree to our terms of
      service and have read our privacy policy", with both phrases
      linked. One component so the two forms cannot drift apart. Nothing
      uses it yet, which is what makes this safe to merge before Phase 1
      is done.

- [ ] **Show it above the submit button in `RegistrationForm.tsx`,**
      under the marketing tick box. This covers self-registration through
      `TeachingRegisterPage.tsx`. The first step in `RegisterPage.tsx`,
      which only checks the clinical lead's email, collects nothing about
      the person registering and stays as it is.

- [ ] **Show it in `ResetPasswordForm.tsx` when `askAboutMarketing` is
      set,** which is how the form already knows it is an invite. Somebody
      whose account was made for them never saw the registration form, so
      setting their first password is their moment of collection. An
      ordinary password reset does not show it. Rename the prop if it now
      reads wrongly: it has come to mean "this is a first sign-up".

- [ ] **Update the tests and stories** for both forms: the sentence and
      both links are present on registration and on an invite, and absent
      on a plain reset. Run `just uf
      src/components/registration/` and the two page tests.

## Decisions

- **No tick box** – a required box adds a step and a way to fail, and
  buys nothing here. Consent is not the lawful basis for holding an
  account, so there is nothing to consent to; the privacy policy only has
  to be given, and terms are accepted by carrying on past a clear notice.

- **The policies stay on the public site, not in the app** – agreed on
  5 October 2026. Showing them in the app, as routes or a pop-up over the
  form, would mean a second copy of the text or an app release for every
  change of wording. The public site holds one copy and updates at any
  time.

- **Acceptance is not recorded per person, yet** – no column, no
  migration. What somebody agreed to is worked out from when their
  account was created and the "Last updated" date on the terms. That
  holds while the terms have one version. The first material change to
  them needs a recorded version and a prompt to existing users, as
  `MARKETING_WORDING_VERSION` does for the marketing sentence, and that
  is a plan of its own.

- **The login page gets no sentence** – nothing is collected there that
  registration did not already collect. Whether the app should carry the
  legal links somewhere permanent, such as Settings, is a separate
  question and not needed for compliance at sign-up.
