# An individual has capabilities, a location enables them to be carried out

## The realisation

A person is not one thing everywhere. Someone can be a consultant at one trust, a locum
with narrower privileges at a second, and a patient at a third. Quill currently models
them as one thing everywhere, and treats that single answer as true wherever they go.

That is the whole issue. Everything below is a consequence of it.

## What Quill enforces today

**System permissions are one string on the user.** `User.system_permissions` holds a
single value from `single-user < staff < admin < superadmin`. There is no second column,
no association, no notion of "admin **of** something". An admin is an admin of Quill.

**Competencies are one set on the user.** `base_profession` plus
`additional_competencies` minus `removed_competencies`, resolved by
`get_final_competencies()`, which takes no arguments beyond the user. A person who can
prescribe can prescribe, full stop.

**The gate cannot ask where.** `has_competency("x")` in `deps.py` builds a FastAPI
dependency that compares `x` against that global set. It has no access to the request's
organisation or site, and no parameter for one. `check_permission_level` is the same
shape: two strings, no context.

So the enforcement points are structurally incapable of asking the question the user is
now asking, regardless of what the data said.

## Where the ground is more promising than expected

**Sites already carry a role per membership.** `site_staff_member` is
`(site_id, user_id, role)` with `role` one of `clinical_lead`, `staff`, `trainee`. That
is precedent for a per-place answer, and it is already in production use for teaching
governance.

**Organisations do not.** `organisation_staff_member` is `(organisation_id, user_id)` and
nothing else. Membership is a boolean fact. This asymmetry looks accidental rather than
designed — the two tables were written for different purposes and only one of them needed
a role at the time.

**Membership is already resolved per request in places.** Teaching's
`_get_user_org_ids` walks direct organisation membership _and_ site membership through
the site-to-organisation link. The plumbing to know "which organisations is this person
in, right now" exists; nothing consults it when checking a competency.

## Four problems, in the order they will bite

### 1. A competency granted anywhere is a competency everywhere

The headline case. A doctor at trust A who is a patient at trust B carries
`access_patient_records` from their base profession, and `has_competency` will honour it
against trust B's data. Nothing in the check distinguishes the two contexts.

This is the OWASP API #1 failure mode — broken object-level authorisation — arriving
through the authorisation model rather than through a missing filter. The existing
security suite tests _vertical_ escalation (a learner cannot reach an educator endpoint)
and does not test this, because there is nothing yet to test.

### 2. A person cannot hold two identities cleanly

Staff membership is keyed on `user_id`. Patient membership is keyed on `patient_id`, a
FHIR identifier string, and the link back to an account is `User.fhir_patient_id`.

So "staff at A, patient at B" is not two rows describing one person — it is a row in one
namespace and a row in another, joined only through a nullable column. Any rule of the
form "at this organisation you are a patient, not a clinician" has to bridge those two
namespaces before it can even be stated.

### 3. Cross-organisation actions are unguarded

`update_bank_org_settings` takes `org_id` in the path and checks only that the _caller's
own_ organisation owns the bank. Nothing checks the caller may act on the target. Anyone
holding `manage_teaching_content` can set a bank live — and now pin its served version —
for **any organisation in Quill**.

Twenty routes across `main.py` and the teaching router take an organisation or site in
the path. That number is the size of the audit, whatever model is chosen.

This one is live today. It is not hypothetical and it does not depend on the redesign.

### 4. "Org admin" is spoken but not modelled

The teaching plan asks for a promotion endpoint "for staff org admins, scoped to their
own organisation". No such role exists. The nearest available gates are the
`manage_teaching_content` competency, which is global, and `system_permissions`, which
`CLAUDE.md` explicitly says is not for data access. Writing that endpoint today means
choosing between a gate that is too wide and one that is the wrong instrument.

## Where the design has got to

Four rounds of arguing this out have collapsed the model rather than grown it. What
follows is where it currently stands, not a decision.

### Two things, and a test that separates them

**A capability is a property of a person.** They hold it because they were trained and
signed off. Clinical acts, safety work, delivering teaching, administrative jobs — all one
list, all on the person.

**A position is a slot the organisation has.** Clinical lead, Caldicott Guardian, head of
surgery. It exists whether or not anyone fills it.

The test is **can it be vacant?** "This site has no clinical lead" is a real and actionable
state. A capability nobody holds is not a vacancy, it is simply absent — and the difference
is one that needs chasing versus one that is fine.

Cardinality turned out to be a weak reason for the split. The stronger ones are:

- **Naming for accountability.** After an incident, "who was the clinical lead?" needs one
  name even if five people were eligible.
- **Routing.** Escalations and approvals go to the post, not to everyone qualified.
  `validate_clinical_lead` already works this way: a candidate names a supervisor and the
  system checks that person holds the post.
- **Statutory posts.** Caldicott Guardian, DCB 0129 Clinical Safety Officer, Data
  Protection Officer. The law requires the organisation to _have_ one, named. That is a duty
  of the organisation, not a fact about a person.
- **Acting cover.** "Acting clinical lead while Dr X is on leave" fills a slot temporarily.
  A capability cannot express it.
- **History.** "Who was Caldicott Guardian in March?" asks about the post over time.
  Capability history answers who was _eligible_, which is a different question.

So: head of surgery is a position with one holder. Fire warden is a position with several.
Prescribing is neither — nobody is "the prescriber".

### The shape

- **Capability** — held by a person, and enabled or not at each place.
- **Position** — belongs to an organisation or site, filled by someone whose matching
  capability is enabled there.
- **Grant** — one row per thing a person may do at a place: _who, where, what_.

The same grant table answers both directions, which is what makes it cheap:

- _What can Anna do at St Mary's?_ — filter on person and place.
- _Who here can act as clinical lead?_ — filter on place and capability.

Indexes on `(place_id, capability)` and `(user_id, place_id)` cover both. Carrying the place
on the grant row rather than reaching it through a membership id is what avoids a join on
every request — and the second lookup is cheaper than today's, where
`get_final_competencies()` resolves a base profession and applies two JSON deltas per call.

A thin membership table still earns its place, so that "attached here, nothing enabled yet"
is representable and a site can list its people before anything is granted.

### What the argument removed

Each of these was proposed and then discarded for a reason worth keeping:

- **No "kind" on membership.** Being a patient somewhere is not a kind — it is having only
  self-scoped capabilities enabled there. Being a nurse _and_ a patient at one site is then
  simply both sets enabled.
- **No acting-as selector in the interface.** It only existed to disambiguate kinds. With
  each action mapping to exactly one capability, there is no hat to choose.
- **No scope column.** Scope goes into the capability's name: `access_own_records` versus
  `access_patient_records`. Of 32 existing competencies, only two or three need splitting —
  most cannot be done to oneself at all, and `access_patient_records` already carries the
  comment _"Own records only (filtered by system)"_, so the ambiguity is real today and
  resolved in filtering code rather than in the model.
- **No inheritance from organisation to site.** A ward manager who administers their ward
  must not need trust-wide admin first. Grants are independent at each place; the only rule
  that narrows is the person's own ceiling. Convenience can copy grants when a membership is
  created, but nothing is derived at request time — so "why could this person do that?" is
  answerable from one row rather than by replaying a hierarchy.
- **No boolean for "only one per site".** How many clinical leads a site has is a fact about
  that site, not about the capability. One site may job-share.

### `site_staff_member.role` goes

Only `clinical_lead` is ever read; `trainee` is written in three places and compared
nowhere, and `staff` appears only in a validation set. Where `clinical_lead` is read it is a
lookup — _who is the lead here_ — not a gate. So the column is doing very little, and what
it does becomes a position.

It is also a trap in its current form: it looks like an access-control field, so the next
person needing a site-level gate would reasonably reach for it.

## How a capability is acquired

Separable from the scoping work — sign-off is about how a capability is _acquired_, scoping
about where it _applies_ — but the two share the same grant row, so the shape matters now.

Nothing exists yet. `User.professional_registrations` is a JSON column documented as holding
GMC and NMC details, and nothing reads it. Nothing records who signed off what.

### Every capability records its origin

Every capability a person holds records an **origin** — how it was obtained:

- **Registration** — a GMC, NMC or HCPC number, verifiable against an external register.
- **Qualification** — an exam, course or certificate.
- **Signed off** — a named person approved it, on a date.
- **Pre-existing** — brought in at go-live, with nobody named behind it.

Then _"how do we know Anna can prescribe?"_ always has an answer, and sometimes that answer
is "we do not — it came across in the migration", which is useful rather than a gap.

### Who can sign it off differs by capability

A single rule does not hold. Peer sign-off suits hands-on skills and is wrong elsewhere:
an educational supervisor signs off breadth they do not personally hold, an administrator
grants `manage_teaching_content` without holding it, and nobody peer-approves someone into
being a doctor.

So each entry in `competencies.yaml` declares which applies:

- **Anyone who holds it can sign it off** — the peer model. `perform_venepuncture`: if Anna
  can take blood, Anna can sign off Ben.
- **Only one named position can sign it off** — for higher-risk capabilities where one
  accountable person is wanted. `prescribe_controlled_schedule_2`: the clinical lead signs,
  not any prescriber.
- **A certificate instead of a person** — nobody in Quill signs it off.
  `access_patient_records`: the General Medical Council decided, and a registration number
  is the evidence.

One extra line per capability, reusing the position concept rather than inventing a parallel
approvals system.

The words matter enough to fix now, since two of them become field names:

- **Origin**, not provenance or evidence. Accurate, short, and it reads correctly for the
  weak case — _"origin: pre-existing"_ is fine where _"evidence: pre-existing"_ claims too
  much, there being no evidence to produce. It does overlap with CORS origins in `config.py` and
  `main.py`, which is survivable: nobody will confuse a capability's origin with an allowed
  request origin. **Evidence** remains the better word on screen and in conversation.
- **Sign off**, not attestation. It is the phrase already used when talking about this.
- **Go-live**, not epoch or cut-off date. Standard in health IT, and it points at a real
  moment in the project. Cut-off was rejected for sounding like an ending when this is a
  beginning.
- **Position**, not post, appointment or role. _Appointment_ means a clinic slot in a
  clinical application and always will; _post_ collides with the HTTP verb throughout a
  FastAPI codebase; _role_ is taken by the existing `Role` model and `user_role` table.

### Existing skills at go-live, and being honest about them

Chasing down who approved someone decades ago is not possible, so do not pretend:

- [ ] Treat go-live as the line: from that day, Quill records who signed off what.
- [ ] Everything from before it gets origin **pre-existing**, recorded by the organisation
      that imported it, on that date.
- [ ] Never backfill a plausible signer. A manufactured chain cannot afterwards be told from
      a real one, and the audit trail becomes worthless precisely when it is needed.
- [ ] Give these a review-by date, so each is properly signed off over time.
      The proportion still marked pre-existing is then a real measure of data quality.

### A sign-off records what happened, and never changes

- [ ] Record who signed it, when, and **what they held at that moment**. Never work it out
      again later.
- [ ] A signer whose own competency lapses next year must not silently invalidate everyone
      they ever signed.
- [ ] But keep the chain queryable: if a signer is later found fraudulent, finding everyone
      they signed is a query followed by a human decision — never an automatic cascade, which
      would take out a hospital.

## The cases any schema must express

Written as acceptance criteria rather than prose, because a candidate schema either handles
them or does not:

- [ ] Doctor at A, patient at B — cannot act clinically at B.
- [ ] Nurse treated at her own hospital — reads her own record, not a colleague's, without
      changing mode.
- [ ] Patient administers their own chemotherapy at home.
- [ ] Locum at C with narrower privileges than their ceiling.
- [ ] Site administrator who holds no organisation-level authority at all.
- [ ] Student at one teaching site and nothing at another.
- [ ] Trained educator delivering at a site where they hold no administrative job.
- [ ] Rota manager with no clinical capability whatever.
- [ ] Clinical safety officer for one project, not for the organisation.
- [ ] A site whose clinical lead post is vacant.
- [ ] Acting clinical lead covering leave.
- [ ] Registration lapses — everything clinical falls away, memberships do not.

## Still open

- **Where a request's context comes from.** The biggest unanswered question, and it shapes
  every endpoint rather than the tables. Today it is inferred:
  `_get_user_org_ids(user, db)[0]` silently picks the first, which is precisely the
  multi-membership case this work exists for. A path parameter is explicit; a chosen session
  context matches how clinicians work. Deciding storage before this risks a schema that
  cannot answer the request.
- **What becomes of `system_permissions`.** `superadmin` is genuinely global — Quill's own
  operators. `admin` and `staff` look like capabilities or positions at a place.
  `single-user` may be nothing more than the absence of any grant.
- **The patient and staff namespaces.** Staff membership keys on `user_id`; patient
  membership keys on a FHIR `patient_id`, bridged only by the nullable `User.fhir_patient_id`.
  Until they meet, "doctor at A, patient at B" cannot be written as two similar rows, and the
  first two acceptance criteria cannot be satisfied.
- **Ceiling expiry.** A lapsed registration should drop the grants that depended on it. A
  ceiling that does not lapse quietly stops meaning anything.
- **Position history.** Who held the post, and when — needed for any case reviewed later.
- **Break-glass access.** Reaching records outside your normal context. A policy question
  before a technical one, and it needs an audit trail more than a schema.

## What I would do first

1. **Fix the unguarded cross-organisation write now, independently.** It is live, it
   predates this discussion, and closing it does not depend on any decision here.
2. **Decide where context comes from before touching tables.**
3. **Write the acceptance criteria above as failing tests**, before the model changes. A red,
   named test is worth more than a paragraph.
4. **Then choose the storage**, knowing what it has to answer.

## Not addressed here

- Whether the existing `Role` model and `user_role` table have a part to play; their
  consumers are untraced.
- How any of this interacts with the jurisdiction configuration in `shared/`.
