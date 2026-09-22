# Clinician passport and CBAC

Both describe what a clinician can do. They are not the same thing, and the
difference is the most important idea on this page.

- **CBAC decides what somebody may do in Quill right now.** It is access
  control: a competency on a user unlocks an endpoint.
- **The passport records what somebody has been assessed as able to do.** It is
  an educational record: a sign-off says a named assessor watched, judged, and
  put their name to it.

**A sign-off grants nothing.** Signing off "perform bronchoscopy" in a holder's
passport does not add `perform_bronchoscopy` to their competencies, does not
open any endpoint, and changes nothing about what they may do in the software.

## Why they are kept apart

Coupling them is tempting and would be a mistake.

If a sign-off granted access, a sign-off would stop being a record of a
judgement and start being a decision about what somebody may do in a clinical
system. The assessor's act would change meaning: they would no longer be saying
"I watched this person do it competently" but "I am authorising this person to
do it here". Those are different claims, made by different people, on different
evidence.

An assessor judges a clinician's practice. An organisation decides who may act
in its systems — with local credentialing, indemnity, supervision arrangements
and its own risk appetite in view. A trust may reasonably decline access to
somebody demonstrably competent, and often does.

So the passport writes to nothing. An administrator reads it and decides
separately.

## Where they meet

One competency registry, `shared/competency-definitions/`, used by both.

A competency id means the same thing everywhere: `prescribe_sact` is one
identifier whether it appears in a user's CBAC competencies or a passport
sign-off. The passport adds optional fields to those definitions — levels,
expiry guidance — rather than introducing a parallel framework registry. One
name, nothing to drift, no second schema to maintain.

What a passport contains is whatever its holder has evidence for. Which
competencies constitute a given regional passport is local policy, and is
deliberately not encoded centrally.

## Reaching the passport at all

- **The `passport` feature flag** — is this switched on for the holder's
  organisation or site?
- **The `assess_clinician_passport` competency** — a CBAC competency, so CBAC
  does gate *reaching* the passport even though the passport never writes back
  to CBAC.

Passing both says only that the passport exists for this person. Whether they
may read a *particular* record is a third question, answered by whether they
are the holder or are named on a request against them.

## Assessing is free; holding is sold

Signing off somebody else's competency and keeping a passport of your own are
two different rights, because they have opposite economics.

**Assessing is a favour to somebody else's record.** The holder's organisation
gets the benefit and the assessor gets nothing, so an assessor who met a price
would simply decline, and the trainee waiting on them could not be signed off
at all. `assess_clinician_passport` is therefore granted by base
profession, never sold, and never lapses for payment.

**Holding is the product.** `passport_write` grants the right to create a
passport and add to it. No base profession carries it: it reaches a person
either through an organisation that pays, granted at onboarding, or through an
individual subscription. Most clinicians at a paying organisation hold both
competencies, and neither implies the other is beneath it — a consultant of
thirty years still gets signed off on new things.

**An entitlement ends on a date**, recorded in `passport_write_entitlement`
rather than as a flag, so the holder can be warned before it does. Somebody may
hold one from more than one source at once, and losing one does not end the
other.

## A record is never held hostage

**Reading, rendering and exporting a passport are derived from owning it, never
from paying.** An entitlement that has run out takes away the ability to add to
the record and nothing else: the holder keeps their whole passport, and can
still download it in full.

Two consequences follow, both deliberate:

- **A sign-off asked for before an entitlement ended still completes after
  it.** What lands is the assessor's judgement about work already observed,
  not the holder's own write.
- **The warning comes on the way in**, not when a write is refused. Finding
  out half way through typing a reflection is the worst possible moment.

## The deferred idea

An automatic grant — a signed-off passport competency raising a request to add
the matching id to a user's `additional_competencies`, subject to
administrator approval — is recorded as a future item.

It is deferred rather than rejected. The distinction worth preserving is that
approval stays a human act: a request an administrator approves is still an
organisation deciding, whereas a sign-off silently granting access is an
assessor deciding something they were never asked about.

Related: [CBAC](cbac.md), and the
[passport module documentation](../backend/passport/index.md) for how the
record is stored.
