# Legal documents

The reviewed text of the documents published on the public site. The
Markdown here is the source; the pages under
`frontend/public_pages/src/pages/` are its rendering, and the two must
change together.

- [Terms of service](terms-of-service.md) - published at
  `https://quill-medical.com/terms-of-service`. One document in three
  parts: Part A for everyone, Part B for people who reach Quill through a
  sponsor, Part C for people and organisations who deal with Bailey
  Medics directly.
- [Privacy policy](privacy-policy.md) - published at
  `https://quill-medical.com/privacy-policy`. Opens with which situation
  the reader is in, because that decides who the controller is.

Both were drafted on 6 October 2026 under the
[Terms and privacy policy plan](../plans/2026-10-06-terms-and-privacy-policy-plan.md),
which records the research behind them and the facts still to confirm.
Neither is published yet: the public pages still carry placeholders
until Phase 6 of that plan.

The privacy policy was revised on 7 October 2026, when email moved from
Resend, which stored its records in the United States, to Amazon SES in
London. It is still version 1.0: that version had never been published or
shown to anybody, so it was corrected in place and no earlier version is
kept. The terms of service name no email provider and did not change.

It was corrected again on 11 October 2026, after a review of the
documentation against the code: section 3.9 now says that switching the
usage count off in Settings is remembered on the device. Still version
1.0, for the same reason.

Corrected again on 13 October 2026, for the same reason and with the
same version number. Both documents now have a part for each sponsor,
holding only what is particular to that sponsor: section 4.7 of the
privacy policy and clause 22.3 of the terms. The East of England
Endoscopy Training Academy is the first. The privacy policy also says,
where it gives the two years an account is kept after closing, that a
sponsored account is kept for as long as that sponsor's training
records are; and it no longer says that training bodies commonly keep
records for six years or more, which sat badly beside a named sponsor
keeping them for three and a half.

Changed on 13 October 2026, by Mark's decision: closing an account no
longer takes somebody off the newsletter. Section 3.6 of the privacy
policy used to say that no newsletter is sent to a closed account; it,
section 3.11, section 7 and clause 21.2 of the terms now say that the
name, address and answer move to the newsletter list when an account is
closed. The move, and the one email that tells somebody of it, were
built on 13 October 2026. One step of that phase is not: removing
somebody from the newsletter list when they ask for their data to be
deleted, for which there is no journey in the app yet. Until there is,
such a request is carried out by hand.

Added on 13 October 2026: section 7 of the privacy policy now says
that a copy of something deleted may remain in backups for up to 30
days, and that backups are used only to restore the service. Thirty is
what the App production database keeps, checked against the database
itself that day.

Added on 13 October 2026: section 3.1 of the privacy policy now says
what "remove everything that identifies you" means, and names the two
things that stay because they are part of somebody else's record: a
sign-off given on another clinician's passport, under the name it was
given with, and a message, with no name.

Changed again on 14 October 2026, by Mark's decision: the answer
somebody has given about news and updates stands for everybody, through
closure and deletion. Section 3.6 and clause 21.2 no longer treat a
sponsored user's unticked box differently, and 21.2 no longer says we
do not market to sponsored users.

Added on 14 October 2026, by Mark's decision: section 3.1 now says we
email somebody once when their account is closed, unless their address
was never confirmed, and section 3.6 points to that email for how to
stop the newsletter. The same section says we email them again if the
account is opened again.

Corrected on 20 October 2026, after a review of both documents against
the code and the law that day, still as version 1.0. The privacy policy
now lists every email the service sends, the error reports a browser
sends, the page-view count, how sign-in attempts are slowed, how the
organisation is found at registration, and the staff check before an
account or a sponsor's records are deleted. It no longer describes
messages or browser notifications, which App production does not
offer, and it gives the subject access timings and the automated
decision rights as the Data (Use and Access) Act 2025 left them. The
terms say an unverified account cannot sign in, and that notifications
are not offered yet. What the review found that wording cannot fix is
in the
[Legal review follow-ups plan](../plans/2026-10-20-legal-review-follow-ups-plan.md)
and at the top of Phase 6 of the
[Terms and privacy policy plan](../plans/2026-10-06-terms-and-privacy-policy-plan.md).

Changed again on 20 October 2026, by Mark's decision, still as version
1.0. Both documents say "Quill Medical" wherever they said "Quill". The
record of each newsletter answer is kept six years after the last one
or until the account is deleted, whichever comes first, since the
answer itself moves to the newsletter list. Clause 15.2 of the terms no
longer promises an "accept" screen at the next sign-in: a change that
is not minor gets 30 days' notice, and carrying on using the service
after it means accepting it.

Every version carries a version number and the date it took effect,
because acceptance is not recorded per person, so that date is the only
record of which version somebody was shown. When a version is replaced,
keep the old one here under its number rather than deleting it, so that
the "earlier versions stay available" promise in both documents is true.

## What is deliberately left out

No placeholders remain. The payment processor is not named, because
there is none yet: the terms promise to name it on the order page before
anyone pays, and when payments launch (Stripe is expected) it goes into
clause 28 of the terms and section 5 of the privacy policy as a new
version of each. Bailey Medics is not VAT registered, and both the terms
and the public site say so rather than carrying a number.
