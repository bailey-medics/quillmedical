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

### Built: positions and who holds them

`Position` is a slot at an organisation or a site, `PositionHolding` is a dated row saying
who fills it. Two tables rather than a holder column, because the post has to outlive its
holders: "who was Caldicott Guardian in March?" is a question about the slot over time.

- **A vacancy is a real state.** `is_vacant` asks whether anyone substantively holds the
  post, so a site with a lead post and nobody in it is distinguishable from a site that
  never needed one. An absent row could not tell those apart.
- **Acting cover sits alongside the substantive holder** rather than replacing them, so the
  record still shows whose post it is, and it does not count against `max_holders` — or
  nobody could ever cover a singular post. A post held _only_ by cover still reports as
  vacant, which is the state worth chasing.
- **Appointment is checked at the place.** `appoint` refuses anyone whose required
  competency is not authorised there, using `can_practise_at`. Holding it somewhere else
  does not qualify you here, in either direction between an organisation and its sites.
- **`max_holders` lives on the post**, not on the kind, as the argument settled: one site may
  job-share what another treats as singular.
- **Position kinds are a small list in code** — `POSITION_KINDS` — rather than a free string.
  A free string would repeat the competency-id mistake. A YAML catalogue is not earned at
  four entries, and the display name is on the row so an organisation can call it what it
  likes.

**Dates are inclusive at both ends.** Someone whose holding ends on the 30th still held the
post on the 30th, which is what a review of that date needs to be told. So a handover is the
outgoing holder ending one day and the incoming starting the next; appointing a successor to
start on the predecessor's last day is two holders, and is refused.

### `site_staff_member.role` goes

Only `clinical_lead` is ever read; `trainee` is written in three places and compared
nowhere, and `staff` appears only in a validation set. Where `clinical_lead` is read it is a
lookup — _who is the lead here_ — not a gate. So the column is doing very little, and what
it does becomes a position.

- [x] **Expand: reads moved across, both written.** `validate_clinical_lead` and the site
      listing now answer from `PositionHolding` via `clinical_leads_of`, and
      `add_site_staff` and `remove_site_staff` keep the post in step with the column. A
      backfill migration creates a post and holding for every existing `clinical_lead` row.
      - `started_on` in the backfill is the migration date, not a guess at when the person
        took the post. Inventing one would put a claim in the record that nothing supports.
- [x] **Expand the API first.** `SiteDetailOut` gains `clinical_lead_id`, populated from
      the post, and the interface reads that instead of scanning staff rows for a role.
      Additive and optional, so nothing breaks and there is no `oasdiff` finding yet.
      - The contract step could not come next without this: the interface had nothing else
        to read, so removing `role` would have broken three pages. Expand-contract applies
      to the response as much as to the column.
      - Six usages across three pages, not the four this document counted — `SiteAdminPage`
        looks the lead up three more times to display its name and email.
      - Those pages had **no tests at all**. Three now cover the clinical lead field,
        including one asserting that a staff row whose `role` says `clinical_lead` is
        ignored — which is what proves the display reads the post.

### Settled: `role` is three facts in one column

The consumer count grew three times — two, then four, then six — and each time from a search
that looked exhaustive. The reason is not carelessness: `role` holds three unrelated facts,
so no single search for its meaning finds them all.

- **`clinical_lead`** — who holds a post. Already a `Position`.
- **`staff`** — that the person is attached to the site. The row says that by existing, so
  the value restates its own table.
- **`trainee`** — that the person is on placement there. Compared in
  `list_delegates`, which uses it to answer _which site is this delegate at_ — so it is
  load-bearing, and the earlier claim in this document that `trainee` is "compared nowhere"
  was wrong.

**What each becomes:**

- **Membership** answers _where are they?_ — `site_staff_member` keeps one row per person per
  site, with a column saying in what **capacity**: `staff` or `trainee`.
- **Competencies** answer _what may they do there?_ — `PractisingCompetency`, as now.
- **Positions** answer _who holds the post?_ — `Position`, as now, and clinical lead stays
  one. A column cannot express a vacancy, acting cover, or who held it in March, and those
  are the three reasons the post exists.

**`capacity`, not `level` or `role`.** "Level" implies a ranking, and there is not one: a
trainee on placement and a substantive staff member are different relationships to the site,
not rungs of a ladder. A column that reads as a ladder is one the next person needing a
site-level permission check will reach for — which is the trap this column is today.

- [x] **Rename the table to `site_member` and the column to `capacity`.**
      `site_staff_member` is a straightforward lie about a third of its rows: `register`,
      the public self-registration route, inserts teaching delegates with `role="trainee"`,
      and they are not employed by the site. One membership table per place, with the
      capacity column saying what kind of member.
      - The existing tables use `_member`, so `site_member` rather than `site_membership`.
      - `.claude/rules/backend.md` records the trap: Postgres does not rename a table's
        auto-named indexes, so `op.rename_table` needs explicit `ALTER INDEX` beside it or
        autogenerate flags the leftovers for ever. One of them,
        `ix_site_staff_one_clinical_lead`, goes anyway — `max_holders` on the post enforces
        that now.
      - It also sketches where organisations have to end up. They have two membership tables
        keyed differently, on `user_id` and on a FHIR `patient_id`, which is the namespace
        problem still open below.
- [x] **Keep `capacity` open-ended.** `staff` and `trainee` are the two needed now, and
      more are expected — volunteer, contractor, honorary, visiting. `SITE_CAPACITIES` and
      `validate_site_capacity` in `models.py`.
      - So a `String` column validated against a small list in code, the way
        `POSITION_KINDS` is, rather than a database enum. Extending an enum needs a
        migration; extending a list needs a line. A free string is not the alternative:
        that repeats the competency-id mistake.
      - This is a second reason not to call it `level`. Two values could be mistaken for a
        ranking; six certainly would be, and none of them rank.
      - **Capacity must never become a permission check.** As the list grows the pull will
        be to write "contractors cannot do X". That belongs in what is enabled for them at
        that place, not in what kind of member they are — otherwise the column becomes the
        access-control-shaped field this whole exercise is removing.
- [x] **Move the remaining `clinical_lead` reads onto positions** — two in the teaching
      router, one in `get_site`, and the one-lead check in `add_site_staff`, which
      `max_holders` on the post now enforces.
      - **`_maybe_enqueue_certificate_emails` has no test at all**, and it is one of the
        two in the teaching router. A first attempt at moving it was written and then
        reverted: it referenced `clinical_leads_of` without importing it, the module still
        imported cleanly because the name is only resolved when the function runs, and the
        whole suite passed either way. The bug would have shipped and surfaced as a failed
        certificate email.
      - So this one needs its test written first, not alongside. It decides who is emailed
        when a candidate passes, and nothing currently checks that it emails anybody.
      - [x] **Test written**, in `backend/tests/test_certificate_email_recipients.py`, and
        checked against a deliberately broken lookup: dropping the organisation filter makes
        it fail. Nine cases, the load-bearing one being that a site with no clinical lead
        produces no coordinator email — the behaviour most at risk when the lookup moves to
        the post, since a vacancy is exactly what the old query could not express.
      - Writing it turned up dead defensive code: `User.email` is NOT NULL, so the
        `if lead.email` guards only ever fire for the empty string, never for None.
      - [x] **`_maybe_enqueue_certificate_emails` moved.** The net earned its keep at once:
        two tests failed, because the fixture seeded only the role column and the lookup now
        reads the post. The fixture writes both, as the API does, and a new test pins the
        cut-over — a `clinical_lead` row with no post behind it emails nobody.
      - [x] **`list_delegates` moved**, with its test written first. It came with the rename
        rather than after it, because `clinical_lead` stopped being storable.
        - It should move **after** the capacity rename, not before. It reads the column
          twice — once for `trainee` to find the delegate's site, once for `clinical_lead` to
          name that site's lead — so doing it once afterwards avoids touching it twice.
        - It also matches the lead by `Site.name` rather than by id, so two sites sharing a
          name in different organisations cross-match. Moving to the post fixes that as a
          side effect, which makes it a behaviour change and not only a refactor.
- [x] **`list_delegates` moved**, both reads at once as planned — the capacity for the
      delegate's site, and the post for that site's lead. Keyed on the site's id rather than
      its name, which fixes the cross-match between same-named sites in different
      organisations. Five tests written first, one of which pins that cross-match.
- [x] **Autogenerate proposed destroying the table.** It read the rename as one table
      appearing and another disappearing, and emitted `create_table` plus `drop_table` —
      which would have discarded every row. The migration is hand-written as a real rename:
      drop the partial index, rename the column, move `clinical_lead` rows to `staff`, rename
      the table, then rename the primary key and both foreign keys, which Postgres leaves
      under their old names. Checked by running it down and up and inspecting the result.
- [x] **Removed `role` from `SiteStaffItem`.** The contract step, and the only genuinely
      breaking change of the sequence.
      - **No migration, and no destructive gate.** An earlier version of this item said the
        column would be dropped and would trip `db-destructive-migration-review`. That was
        written before the rename settled: `capacity` stays, because `list_delegates` reads
        `trainee` to resolve a delegate's site. Only the response field goes.
      - `oasdiff` reports exactly one breaking change —
        `response-required-property-removed` on `GET /api/sites/{site_id}` — with a decision
        file recording `forces_reload: false`. A stale tab loses a column from the staff
        table; nothing it can do produces a wrong answer.
      - The wording was taken from `oasdiff` itself rather than guessed, by generating both
        specs and diffing them locally with the pinned image. Guessing it would have failed
        the coverage check in CI on an exact-string comparison.
      - The staff filter on `SiteAdminPage` went with it, as settled.

### Now and "on a date" are different questions

Found by a test, not by design. Vacating a post set `ended_on` to today, and the "who holds
this" query treated a holding ending today as still in force — so removing someone from a
site left them clinical lead until midnight.

Both readings are right, for different questions, so both exist:

- **Now** — holdings that have not ended. Removal takes effect at once.
- **On a date** — holdings in force at any point that day, both ends inclusive. Someone
  whose holding ended on the 30th held the post on the 30th, which is what a review of that
  date needs to be told.

A handover is therefore the outgoing holder ending one day and the incoming starting the
next; appointing a successor to start on the predecessor's last day is two holders that day,
and `max_holders` refuses it.

It is also a trap in its current form: it looks like an access-control field, so the next
person needing a site-level gate would reasonably reach for it.

## How a capability is acquired — moved to the clinical passport plan

**Settled: not this document's problem.** Sign-off lives in
`feature/clinical-passport-plan`. Here, a competency is a state that is turned on or off at
a place, and nothing more.

That is a real simplification rather than a deferral. Scoping asks _where does this apply_;
sign-off asks _how was it obtained_. Only the second needs origins, signers, review dates and
an unchangeable record, and none of it has to exist for a competency to be enabled or
disabled somewhere. `PractisingCompetency` carries `authorised_by` and `authorised_at`, which
is enough to say who switched it on here — not a claim about how the person came to be
competent.

The reasoning worked through here is kept because the passport plan will want it:

- Every capability records an **origin** — a registration, a qualification, a named sign-off,
  or **pre-existing** for anything brought in at go-live. "We do not know, it came across in
  the migration" is a useful answer rather than a gap.
- Who may sign a capability off **differs by capability**. Peer sign-off suits hands-on
  skills; higher-risk ones want one named position; some are decided by an external register
  and no one in Quill signs them at all.
- A sign-off records **what the signer held at that moment**, and never changes. A signer
  whose own competency lapses next year must not silently invalidate everyone they ever
  signed — but the chain stays queryable, so a signer later found fraudulent can be traced,
  by a human decision rather than an automatic cascade.
- **Never backfill a plausible signer.** A manufactured chain cannot afterwards be told from
  a real one, and the audit trail becomes worthless exactly when it is needed.

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

- [x] **Validate at every write boundary.** `validate_competency_ids` in
      `app/cbac/competencies.py` is the one check; `AdminUserCreateIn` and
      `AdminUserUpdateIn` call it through field validators, so an unknown id is a 422 that
      names it rather than a row nobody notices.
      - The per-place row is guarded on the attribute instead, with SQLAlchemy's
        `@validates`. A schema only covers the endpoint that uses it; the attribute covers
        every path that writes a row, and there is no endpoint for these yet.
      - `base_profession` got the same treatment, found while writing this: it is a bare
        string too, and `get_profession_base_competencies` returns an empty list for an
        unknown one — so a typo gave a user no competencies at all and said nothing.
- [x] **Audit what is already stored** — `app/cbac/audit.py`, walking the two JSON columns
      on every user, every per-place row, and every `base_competencies` entry in
      `base-professions.yaml`. Read-only: it reports, and changes nothing, because what to
      do about a stale id is a decision rather than a cleanup.
      - The base-profession check is static drift between two files that ship together, so
        it runs as an ordinary test and fails in CI the moment one is edited without the
        other.
- [x] **Settled: competencies are retired, never removed.** See below.

### Removing a competency does not revoke it

The question turned out to rest on a mistaken premise. Deleting an id from
`shared/competencies.yaml` revokes nothing: `resolve_user_competencies` does set operations
on plain strings and `has_competency` compares a string from the route against that set.
Neither consults the catalogue. So a deleted competency keeps working for everyone who has
it — the access is unchanged, it has merely stopped being describable.

That is the worst available shape. The edit looks like a revocation, is not one, and quietly
leaves the data impossible to audit instead.

**The principle: editing a configuration file must never silently change who may do what.**
Revoking access is deleting rows, deliberately. Retiring a competency is saying "no new ones
of these". They are different acts, and deletion today conflates them.

The clinical argument decides it. A competency someone was signed off for is part of the
record; if the id disappears, "authorised for Y at Z on this date" can no longer be
rendered, exactly when an incident is being reviewed. This is the same instinct that makes
merged migrations and `api-compatibility/` decision files immutable — supersede, never
amend.

- [x] **Add `retired_on` to a competency entry rather than deleting it.**
      - `COMPETENCY_IDS` keeps everything, so history and existing rows still resolve.
      - `ACTIVE_COMPETENCY_IDS` excludes retired ones.
      - **Write boundaries validate against active**: a retired competency cannot be newly
        granted.
      - **Reads and the audit validate against all**: nothing already stored becomes an
        error.
      - Base professions must not name a retired id, enforced by the existing drift test.
      - The audit reports rows holding retired competencies as a cleanup queue rather than a
        failure — `retired_ids_on_users` and `retired_ids_in_practising_competencies`.
- [x] **A CI check that no competency is ever deleted.** The rule is worth nothing if the
      next person can delete a line and get a green build, and this is the same class of
      guard as the migration immutability check: compare the catalogue against its state on
      `main`, and fail if an id has disappeared. Retiring one is a modification and passes;
      removing one does not. `.github/scripts/ci/check-competencies-not-deleted.sh`, run by
      the `Competency catalogue check` job and required by `infra/github/branch_rules.tf`.
      - It also refuses **un-retirement**. Removing a `retired_on:` line makes a competency
        available for granting again, which is the same thing the check exists to stop: a
        change to who may do what, made by editing a configuration file. A competency that
        should be available again is a new entry with a new id, so what the old one meant
        stays intact.
      - Covered by bats, which caught what a hand-check had missed: the script compares
        committed refs, so editing the catalogue in the working tree and running it
        reports success and proves nothing. One test now documents that trap.
      - The Python side has a round-trip test as well. Every other retirement test builds
        `CompetencyEntry` objects directly, so all of them would pass even if the YAML
        could not be read back — and since `CompetencyEntry` forbids extra keys and the
        module loads at start-up, a mismatch there would take the backend down the first
        time anyone retired anything.

Two alternatives were rejected:

- **Refuse removal while rows reference it.** Cannot work — the check runs in CI against a
  test database and cannot see production data, so it would give a false all-clear.
- **Require the rows be cleared first.** The same two-phase idea, but it destroys the
  vocabulary at the end, and there is no reason to.

The cost is one YAML field, one extra constant, and knowing which list each boundary uses.
The catalogue grows for ever, which at 32 entries and a rare retirement is not a problem.

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

- [x] Doctor at A, patient at B — cannot act clinically at B.
- [ ] Nurse treated at her own hospital — reads her own record, not a colleague's, without
      changing mode.
- [ ] Patient administers their own chemotherapy at home.
- [x] Locum at C with narrower privileges than their ceiling.
- [x] Site administrator who holds no organisation-level authority at all.
- [x] Student at one teaching site and nothing at another.
- [x] Trained educator delivering at a site where they hold no administrative job.
- [x] Rota manager with no clinical capability whatever.
- [x] Clinical safety officer for one project, not for the organisation.
- [x] A site whose clinical lead post is vacant.
- [x] Acting clinical lead covering leave.
- [ ] Registration lapses — everything clinical falls away, memberships do not.
      Waits on `feature/clinical-passport-plan`: nothing here records how a competency was
      obtained, so nothing here can know it has lapsed.

## Answered since this was written

- **Position history.** `PositionHolding` is dated rows rather than a column on the post, so
  "who was Caldicott Guardian in March?" is `holdings_on(db, post, that_date)`. Both ends of
  a holding are inclusive, and "now" is a separate question from "on a date" — someone
  removed this morning does not hold the post this afternoon, but a review of today still
  finds them.

## Still open

- **What becomes of `system_permissions`.** **Answered, in
  `2026-09-09-platform-role-plan.md`:** it becomes `platform_role`, with `superadmin` and
  nothing else, because that is the only one of the four that is not about a place. The
  original note below is kept for its reasoning.
- **The original note.** `superadmin` is genuinely global — Quill's own
  operators. `admin` and `staff` look like capabilities or positions at a place.
  `single-user` may be nothing more than the absence of any grant.
- **The patient and staff namespaces.** **Shape chosen, timing deferred:** a
  `user_patient_link` table recording who asserted the match and on what evidence, tracked in
  `todo.md` and to be built when Quill is first asked to hold real patient data, so it is
  shaped by a real requirement rather than a guess. Staff membership keys on `user_id`; patient
  membership keys on a FHIR `patient_id`, bridged only by the nullable `User.fhir_patient_id`.
  Until they meet, "doctor at A, patient at B" cannot be written as two similar rows, and the
  first two acceptance criteria cannot be satisfied.
- **Ceiling expiry.** A lapsed registration should drop the grants that depended on it. A
  ceiling that does not lapse quietly stops meaning anything. **Moved to
  `feature/clinical-passport-plan`**: expiry is a property of how a competency was obtained,
  and nothing here records that.
- **Break-glass access.** Tracked in `todo.md` under Security and compliance, to be
  answered before organisation-scoped access is finished for clinical use. Reaching records
  outside your normal context. A policy question
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
