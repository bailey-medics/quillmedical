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

That endpoint has since shipped, on the too-wide gate, with the compromise written into
its docstring. `promote_bank_version` and `update_bank_org_settings` in
`backend/app/features/teaching/router.py` are the first two callers waiting on whatever
this document settles, and the teaching plan tracks them under **Provisional: who may
promote**. Whatever comes out of this has to be able to express "may promote on behalf of
organisation X" — that is the smallest concrete thing the design must deliver.

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

## Settled: where a request's context comes from

The question that had to be answered before any table, because it decides what the tables
are asked. Counting the code rather than arguing it:

- **21 routes already name the place** — 19 in `main.py`, 2 in the teaching router — taking
  an `org_id` or `site_id` in the path.
- **11 routes infer it**, all teaching admin routes, all through
  `_get_user_org_id`, which is `_get_user_org_ids(user, db)[0]`: whichever organisation the
  set happens to yield first. `list_items`, `validate_items`, `sync_items`, `list_results`,
  `list_syncs`, `list_admin_banks`, `sync_all_banks`, `update_settings`, `get_settings`,
  `get_admin_bank_detail`, `list_bank_organisations`. None of them takes a parameter that
  could say which — there is nothing in the signature to name a place with.
- **28 call sites resolve every organisation a person is in** and use it as a filter, which
  is a different thing and stays.
- **Nothing is session- or header-based.** There is no `X-Organisation`, no server-side
  selection, and the frontend's `AuthContext` carries no organisation at all.

### The rule

**The server never guesses which place a request is about.** That, rather than
path-versus-session, is the decision. A session selector and a path parameter are both fine
if the client states them; picking the first row of a set is what has produced three bugs in
two days.

Context comes from exactly two places, in this order:

1. **Named in the path.** The organisation or site is a path parameter, and the caller's
   membership of it is checked. This is the default and covers most routes.
2. **Determined by the object being acted on.** Where the URL names a thing rather than a
   place — `/sites/{site_id}` — the place is the object's own organisations, and membership
   is checked against those. `_require_site_in_own_org` is this shape.

And never from the caller. If a route cannot say which place it means, that is a missing
parameter, not a reason to infer one.

### What that costs

The 11 inferred routes each need a place in the path or the query, and their callers
updated. That is the real bill for this decision, and it is worth paying: `update_settings`
is on that list, and its neighbour `update_bank_org_settings` was one of the three bugs.

It is also more than an afternoon, because moving a place into the path changes the URL, and
`.claude/rules/backend.md` treats that as a breaking API change: expand first with the new
route, deprecate the old one, contract a release later, with an `oasdiff` finding and a
decision file for each. Putting the place in the **query** instead is additive while it
stays optional, so the cheaper sequence is query parameter first, then require it, and only
reshape URLs where the route reads better for it.

Two of the three came from exactly this pattern — `_get_user_org_id` answering a question
the caller never asked. The third, the site routes, came from asking no question at all.

### Why not a session context

It was the tempting answer, because choosing "I am at St Mary's today" matches how
clinicians work. But it puts the most security-relevant part of a request in server state
rather than in the request, so a stale tab acts on the wrong place with no way to tell from
the log. Keep the choosing in the client — it holds the selection and puts it in the URL —
and the audit trail then records where every request meant, because the request says so.

This does mean the frontend needs a notion of "which organisation am I looking at",
which it currently has nowhere: `AuthContext` has no organisation field. That work belongs
with the interface, not here, but nothing on the backend should wait for it.

## Settled: what a "place" is

A grant has to point at a place, and organisations and sites are separate tables. Three
candidates, and the choice is **two nullable foreign keys with a database constraint**:

```sql
CHECK ((organisation_id IS NOT NULL) <> (site_id IS NOT NULL))
```

- **Two columns, exactly one filled.** Real foreign keys to real tables. The obvious
  objection — nothing stops a row filling in both — is answered by the constraint above,
  which Postgres and SQLite both enforce, so the unit tests get it too.
- **A shared `places` table** was rejected on synchronisation, not on migration size. It
  would need a row every time an organisation or a site is created, forever, and a missed
  one makes that place invisible to the whole permission system. This project already
  produces orphan rows of exactly that kind: `create_site` and the link to an organisation
  are two separate calls, so a site can already exist attached to nothing. A supertype
  turns that from annoying into catastrophic.
- **One column plus a type label** was rejected outright. It gives up foreign keys, so the
  database can no longer say whether the thing a permission points at exists. Not a trade
  worth making in a clinical system, and against `CLAUDE.md`'s rule to enforce at the
  database level.

**Places are organisations and sites, and nothing else.** Projects, courses and research
were considered and ruled out. The "clinical safety officer for one project" criterion is
served by a site.

### The duplication this accepts, and when to revisit

Three tables will want a place — grants, positions and memberships — so the two-column
pattern gets written three times, with three pairs of indexes. That is tolerable, not free.

- [x] Put every read behind one resolver function, so the branching lives in one place
      rather than in every query and the storage can change without touching call sites.
      `app/cbac/scoped.py` is that boundary: `competencies_at`, `can_practise_at` and
      `who_can_practise_at`,
      each taking exactly one of `organisation_id` or `site_id` and raising `ValueError`
      when given both or neither. Refusing to guess is the whole point, so it is an error
      rather than a default.
- [ ] **If a fourth table needs a place, build the supertype.** Three is duplication; four
      is a pattern, and by then the resolver boundary makes the change cheap.

### Uniqueness needs partial indexes, not a constraint

Written first as one `UniqueConstraint` over user, organisation, site and competency. It
never fires: one place column is always NULL and SQL treats NULLs as distinct, so the same
row could be written twice. Caught by a test that expected the second insert to be
rejected and watched it succeed.

Replaced with two partial unique indexes, one per kind of place, declared for both
dialects — `postgresql_where` **and** `sqlite_where`, since the unit-test database is
SQLite and silently ignores the first. That is the trap `.claude/rules/backend.md` already
records for `ix_site_staff_one_clinical_lead`, met again for the same reason.

### The ceiling and the place are separate, and both are needed

`practising_competency` says what is authorised here. `get_final_competencies` stays as the
ceiling — what the person is qualified for at all. What they may actually do is the
intersection:

- A row beyond the ceiling does nothing, so a lapsed qualification narrows every place at
  once without touching a single row.
- A ceiling with no row does nothing, so being qualified is not being let loose.

Both halves earn their place in the tests: a receptionist authorised for `access_patient_records`
is still refused, and a consultant with no row is refused too.

`who_can_practise_at` deliberately does not apply ceilings — filtering by every user's ceiling would
mean loading every user. It returns a candidate list, and callers check `can_practise_at` before
acting on a name from it. That is documented on the function and tested.

### A competency id is a bare string in three places

Nothing joins them and nothing validates them:

- as a `- id:` in `shared/competencies.yaml`, the catalogue
- inside the `additional_competencies` and `removed_competencies` JSON arrays on `users`
- as a `String(100)` column on the per-place row

So a misspelt id in `additional_competencies` is silently a competency nobody holds, and a
per-place row naming one that does not exist is equally silent. Neither is reported.
This predates the scoping work; the new table adds a third place to get it wrong.

**Settled: the YAML stays authoritative, and ids are validated rather than joined.** Making
competencies a database table would let a foreign key do the work, but the YAML is
deliberately the source of truth — it is code-generated into the frontend's types — so a
table would have to be kept in step with it. That is the same synchronisation hazard that
ruled out a shared `places` table, and it is not worth taking on for spelling.

- [ ] **Validate at every write boundary.** Reject an unknown competency id where it enters:
      the Pydantic schemas that set `additional_competencies` and `removed_competencies`, and
      wherever a per-place row is created. Fail at the point the typo is introduced, not
      silently at read time.
- [ ] **Add a test that walks every stored id against the catalogue** — the two JSON columns
      on every user, every per-place row, and every `base_competencies` entry in
      `base-professions.yaml`. It catches a competency removed from the catalogue while rows
      still reference it, which write-boundary validation cannot see.
- [ ] **Decide what a removal from the catalogue means** before that test can pass on real
      data. Retiring a competency leaves existing rows pointing at nothing, and the honest
      options are to refuse the removal, or to require the rows be cleared first.

### Settled: the per-place row is `PractisingCompetency`

It was first written as `CapabilityGrant`, which was wrong twice over.

- **"Capability" is not this codebase's word.** Around 40 files say _competency_ —
  `competencies.yaml`, `has_competency`, `get_final_competencies`, `useHasCompetency`, and
  CBAC itself, which stands for competency-based access control. "Capability" entered
  through this document, where it was distinguishing a person's skills from a _position_,
  not from a competency. If the wider word is genuinely wanted, that is a rename of the
  whole subsystem and deserves its own decision.
- **"Grant" claims too much.** It reads as though the system confers the competency. It does
  not: the competency is held by the person, and the row only records that they may exercise
  it here.

Healthcare already names this exact two-layer split — **credentialing** verifies
qualifications, **privileging** authorises specific procedures at a specific facility. This
document reaches for the word twice on its own: "a locum with narrower privileges at a
second", and "Locum at C with narrower privileges than their ceiling".

- [x] **Renamed to `PractisingCompetency`**, table `practising_competency`, column
      `competency`, with `authorised_by` and `authorised_at` in place of `granted_*`.
      - The name reads as the question the class answers: _can this person practise this
        competency here?_ That is better than naming the row after a thing, because the row
        is only ever consulted as a question.
      - `CompetencyPrivilege` was the alternative, and privileging is the exact clinical
        term. Rejected as less direct, and because "privilege" already means something else
        in `CLAUDE.md`'s security guidance.
      - **`Practising` takes an `s`.** British English uses the `s` spelling for the verb
        and reserves the `c` for the noun, which `gp_practice` already uses.
      - Done before anything read the table and before the migration merged, so it was a
        rename rather than an expand-contract across two deploys.

## The cases any schema must express

Written as acceptance criteria rather than prose, because a candidate schema either handles
them or does not. They now live as tests in
`backend/tests/test_org_scoped_access_criteria.py`, so they run rather than being read.

Seven are `xfail(strict=True)`: they can be set up with today's tables, they fail, and the
build breaks the moment one starts passing — which is the signal wanted, because a test
there going green is news. Five are `skip`, because they cannot be expressed at all yet,
and each names what is missing. That shorter list is the queue:

- **No position model.** A vacant clinical lead post and acting cover both need one;
  `site_staff_member.role` can only record an absent row, not a vacancy.
- **The patient and staff namespaces.** Two cases wait on this.
- **No self-scoped capabilities.** `access_patient_records` carries the distinction in a
  comment rather than in the model.
- **Nothing records how a capability was acquired**, so nothing can lapse.

Every capability the tests name exists in `shared/competencies.yaml`. Some are stand-ins —
there is no rota or clinical-safety-officer capability yet — because what is asserted is
that the answer differs by place, not which capability it is.

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

1. [x] **Fix the unguarded cross-organisation write now, independently.** It is live, it
   predates this discussion, and closing it does not depend on any decision here.
   Done, and it was three holes rather than one: `update_bank_org_settings`, then all eight
   site routes, then a `get_site` bug found while testing them.
2. [x] **Decide where context comes from before touching tables.** Settled above: named in
   the path, or determined by the object acted on, and never inferred from the caller.
3. [x] **Write the acceptance criteria above as failing tests**, before the model changes. A
   red, named test is worth more than a paragraph. Done: seven red, five that could not be
   written, and the five are more informative than the seven.
4. [x] **Then choose the storage**, knowing what it has to answer. Settled above: two
   nullable foreign keys and a constraint, places being organisations and sites only.

## Not addressed here

- Whether the existing `Role` model and `user_role` table have a part to play; their
  consumers are untraced.
- How any of this interacts with the jurisdiction configuration in `shared/`.
