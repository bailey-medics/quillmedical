# Site tree unification plan

**Supersedes:** the "Site vs Organisation" and "Org-Site link" decisions in
[Organisation and Site](2026-05-20-organisation-site-plan.md)

## Summary

Organisations and sites become a single concept, the **org_unit**, whose
`type` says what it is: `organisation` at the top, `site` for the level
below, and `ward`, `bed` and the rest added if and when they are needed.

Ownership is modelled as a tree: every org_unit has exactly one parent,
apart from the roots, which have none. Any relationship that is not ownership becomes a typed
link between two org_units rather than a second parent, so a medical school
teaching on a trust's wards is a link, not a parent.

**What an org_unit is comes from its `type`, never from its position.** An
organisation is an org_unit of type `organisation`, not an org_unit that
happens to have no parent. The difference matters the day something has to
sit above today's top level.

The tree exists to answer governance questions — who is accountable for this
place, whose rules apply here, and who may administer it.

**Two levels only, for now.** The schema permits any depth, but this plan
builds no interface for deeper trees, because nothing yet requires one.

## Why

The two models have drifted into the same shape. Both have members with a
capacity, both can hold positions and practising competencies, and both have
a name, a type and a location. The only remaining difference is that an
organisation has no parent.

Keeping them separate now costs us:

- **Two columns for a single idea.** Practising competencies and positions
  each carry a pair of columns to point at a place, one for an organisation
  and one for a site, of which exactly one may be populated. Enforcing that
  takes a check constraint and two partial unique indexes.

- **Two membership tables sharing one vocabulary.** Organisation members and
  site members draw on the same list of capacities, and the comment on that
  list argues for one shared list rather than one per table, so that two
  meanings of a word cannot drift apart. The same argument applies just as
  well to two tables of places.

- **Two overlapping type vocabularies.** Both `department` and `clinic`
  appear in each of them.

- **Three helper functions whose only job is to referee.** They reconcile the
  site tree against the many-to-many organisation link, so removing that link
  removes all three.

- **A site can belong to two organisations**, which means it inherits both
  their feature sets and has no single answer to the question of who the
  clinical lead is.

A comment in the code rejects the idea of a shared table of places. It is
worth reading, because the objection it raises does not apply to this plan:

> A shared "places" table was considered and rejected: it would need a row
> for every organisation and site forever, and a missed one makes that place
> invisible to the whole permission system.

That warns against a separate supertype table sitting above both, where a
missing row silently hides a place. Merging the two tables into one leaves no
such gap, because every place is a row by construction — there is nowhere
else for it to be.

### What the code does today

The argument above is considerably stronger with evidence, so we checked it
against the working tree.

**The tree is vestigial.** The parent column exists, and is written by the
two site write routes and read back as a plain number, but it is never
traversed. No endpoint returns children, and there is no recursive query
anywhere in the backend. The model declares a `parent` relationship but no
`children` backref, which is itself the tell that nothing ever needed to
descend.

**The frontend cannot create a nested site at all.** The create form submits
four fields and offers no parent picker, while the edit form declares the
parent column and then omits it from both the form values and the save. Every
org_unit created through the application therefore sits exactly one level
down.

```text
Create site form sends:
  name, type, location, organisation_id

It does not send:
  parent_id
```

**The data is flat everywhere.** The CI seed script creates no sites at all,
and every populated parent across the entire repository lives in eight
assertions inside a single test file — all of them two-node cases written to
exercise the ownership guard itself. Teaching's own tests build flat sites
throughout.

The many-to-many link is therefore doing all the real hierarchy work, which
is precisely the drift this plan sets out to correct.

**The type field is currently decorative.** A user can select `room` and
receive a room hanging directly off a trust, because nothing in the model can
express that a room belongs inside a ward. That argues for the type
capabilities described below rather than against them.

The useful consequence is that no tree data exists to preserve, so the
migration is substantially cheaper than a first reading suggests.

## Precedent

One tree for ownership, plus a separate table of typed relationships for
everything else: nearly every serious system that models this problem
converged on that shape, largely without copying one another. It is worth
recording, because it means the design here is conventional rather than
clever.

### FHIR matches this plan almost exactly

FHIR permits an organisation only one parent, and a location only one parent,
then provides a separate resource for relationships that are not parenthood.

> The Organization.partOf is used to form a hierarchical relationship within
> an organization which eventually resolves to a single organization. Each
> child in the tree is a subdivision of the parent.

And on the separate resource for other relationships:

> [OrganizationAffiliation] does not require a hierarchical relationship.
> This resource should not be used when the affiliates are part of a single
> organization.

That is our tree plus our link table, arrived at separately.

- <https://hl7.org/fhir/R4/organization.html>
- <https://hl7.org/fhir/R4/organizationaffiliation.html>

### Our many-to-many is the odd one out

FHIR allows a location to name one managing organisation rather than several,
so our many-to-many link is exactly where this codebase departs from the
standard. Merging the tables moves us towards FHIR rather than away from it.

- <https://hl7.org/fhir/R4/location.html>

### NHS ODS looks like the exception and is not

ODS is a typed directed graph rather than a tree, with nine relationship
codes covering "is a sub-division of", "is commissioned by", "is located in
the geography of", "is operated by" and "is partner to". Its rules are
deliberately open:

> Any organisation or site record can be linked to one or more others via
> relationships.
>
> There is no restriction on the number of times a record may be referenced
> as a Target from other Source records.

Follow any single code in isolation, however, and a tree comes back. ODS has
not built one graph with many parents so much as declined to privilege any
one hierarchy, which is the right choice for a national directory whose job
is to describe every relationship neutrally. We are an application that must
name one accountable body per place, so we do privilege one.

- <https://www.odsdatasearchandexport.nhs.uk/referenceDataCatalogue/Relationships_571324965.html>

### Directory systems are strict trees, for our reason

Keycloak puts it in one line:

> A group can have multiple subgroups but a group can have only one parent.
> [...] Users can be members of any number of groups.

In LDAP the tree is load-bearing because a record's distinguished name _is_
its path through the tree, so a second parent would render names ambiguous.
Active Directory treats its containment tree primarily as an authority
structure and uses groups as the orthogonal many-to-many layer, which is the
same split as our tree plus our membership table.

- <https://www.rfc-editor.org/rfc/rfc4512.html>

### Business systems add another tree, never another parent

Workday states that an organisation may "Exist in a single hierarchy only"
and that a hierarchy may not mix types, so a worker sits in several parallel
trees rather than one forked one. SAP pairs a single compulsory hierarchy
holding every entity exactly once with as many optional hierarchies as
reporting requires.

- <https://doc.workday.com/admin-guide/en-us/manage-workday/organizations/manage-organization-concepts/concept--superior-and-subordinate-organizations.html>

### Many parents belong in reporting, if anywhere

Kimball is the one authority treating many parents as a goal, and even there it
needs a derived table holding one row per ancestor-to-descendant path, and
concludes there is "no universally great solution". Working systems keep the
single tree and build other views downstream from it.

- <https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/ragged-variable-depth-hierarchy/>

### FHIR also flags our naming problem

FHIR splits the idea of an organisation from the idea of a physical place,
and admits the two get muddled:

> Locations and Organizations are very closely related resources and can
> often be mixed/matched/confused.

It then puts _ward_ on the organisation side as a conceptual unit, while also
listing `ward` as a physical code on the location side. Our own list of
hospital, ward and room sits on that same fault line. See **Naming**.

## Naming

The tree is about governance rather than geography. Everything hanging off a
node is a governance fact — members and their capacity, positions such as
clinical lead and Caldicott Guardian, features, admin scope — whereas a
vocabulary of hospital, building, ward and room reads as physical. Calling a
teaching establishment a "site type" is where the strain shows.

**The node is an `org_unit`, and this plan performs the rename.** It is the
standard term in LDAP, Active Directory, Workday and SAP for a node that has
members, authority and a single parent.

The important half of the word is _unit_, not _org_. A unit of organisational
structure can be a whole division or a single team, and in those systems
nobody reads it as meaning "a company". A ward is genuinely a unit of
organisation, as is a trust, and as an ICB would be.

Names we turned down:

- **`site`** implies geography, which is the fault line FHIR itself warns
  about. It is also what the codebase says today, which is how the confusion
  arose in the first place.
- **`locale`** is unusable, because anywhere near internationalisation
  `locale` already means language and region formatting.
- **`node`** and **`entity`** tell a reader nothing at all.
- **`governance_unit`** is more precise, but nobody says it, and precision
  that has to be explained is not precision.

**The column is `type`**, matching the name already used on both tables it
replaces, so the vocabulary a reader knows carries straight over.

It is never called `level`, because the tree has no fixed depth. A ward might
sit directly under a trust in one organisation and under trust, hospital,
building in another. If `level` meant depth it would duplicate what the tree
already records and eventually contradict it; if it did not mean depth, the
name misleads. FHIR calls the equivalent field `form`, ODS uses a record
class alongside roles, and Workday uses organisation type — none of them call
it level.

**Splitting physical from governance is out of scope.** There is no
geographic requirement today: no room booking, no travel, no estates. Should
one arrive it is a genuinely separate tree with different edges, and forcing
it into this one would recreate the many-parents problem somewhere new.
Naming this tree for governance is what keeps that eventual split cheap.

## Depth

**The frontend builds two levels: roots and their children.** No parent
picker, no nested display, no expanding rows — which matches both what the
application does today and what teaching actually needs.

- **The schema keeps `parent_id` and enforces no depth limit.** Any depth
  remains valid in the table and the API, exactly as now, so deeper trees are
  an interface we have not built rather than a migration.

- **Why not constrain it to two levels.** A constraint refusing a grandchild
  would be honest about current capability, but it would need a second
  migration to lift, and the backend already validates parents correctly at
  any depth.

- **Why not drop `parent_id` altogether.** Reinstating the tree later would
  mean a new column, a new migration and reworking every scoping query,
  whereas keeping the column costs nothing.

- **Scoping is still written as a subtree query**, not a two-level join. On a
  two-level tree both return the same rows, so the day a third level appears
  nothing needs rewriting.

- **The organisations page lists roots; the org_units page lists
  descendants.** The latter is written to show an entire subtree rather than
  a single layer, even though today those amount to the same thing.

## Design principles

- **One governance parent per org_unit.** Ownership is a tree, so an org_unit
  with two organisations above it is either a joint body deserving to be its
  own root, or a relationship that is not governance and belongs in a link.

- **A graph with many parents was considered and rejected.** Permitting many
  parents while guarding against cycles is a well-understood design, and the
  cycle guard is not the difficult part. The cost is that questions with a
  single answer today acquire a set of answers instead: which root's features
  apply, who the clinical lead is, why a given admin can edit a given ward.
  Each would then need a rule for merging those answers, which reinstates
  precisely the ambiguity listed under **Why** as something this plan
  removes. Clinical accountability requires one answer, so ownership stays a
  tree and the additional relationships live in the link table.

- **How to judge an awkward case.** Ask whether the second organisation needs
  to be the answer to a governance question about that place: who is admin,
  who is clinical lead, whose features apply, whose patient list it appears
  on. If it does, it is a joint body and should be a root; if not, it is a
  link.

- **Membership and permissions still do not descend the tree.** A membership
  row at a trust says nothing whatever about its wards, and only admin scope
  and reach traverse the hierarchy, exactly as the existing code comments
  intend.

- **Clinical lead resolution stays an exact match on one org_unit.** This is
  the single place where quietly introducing inheritance would break live
  teaching features. See **Risks**.

- **Type is declared, never inferred.** Whether something is an organisation
  comes from its `type`, never from having no parent. This keeps the door
  open for a body above today's organisations without a schema change, which
  is the one piece of future-proofing the plan deliberately pays for.

- **Ownership is acyclic, and we enforce that rather than assume it.** A tree
  means one parent each _and_ no cycles. A single parent column gives us the
  first for nothing, since one column cannot hold two parents, but the second
  has to be checked on every re-parent or the tree quietly stops being one.

- **This tree is not how cross-organisation care works.** See **Non-goals**.

## Non-goals

Two things this tree deliberately does not do. Both will return as feature
requests, and both would be implemented as a second parent by anyone who has
not read this section.

### It does not decide whether a patient's care can continue elsewhere

A patient may be cared for at two organisations that share no parent and have
no link between them. What spans the two is the patient's own record — one
person, one FHIR patient, one EHR, belonging to no org_unit — alongside a care
relationship at each place recording who is properly involved and when.

Modelling the patient as a _member_ of both organisations would turn
membership into a governance fact and pull the two organisations into each
other's admin scope, which is exactly what this tree exists to prevent.
Widening the tree so that cross-organisation access falls out automatically is
how an admin at a national root ends up governing every patient in the
country.

Where the tree can legitimately help is **reach without authority**: a
`shares_care_with` link can make cross-organisation access expected rather
than anomalous, without granting anything by itself.

### It does not model authority over another person

"Read my father's notes" and "administer my mother's chemotherapy" are real
competencies held by people with no profession, and they are scoped to a
_person_ rather than a place. Such a grant must record who holds it, who it
concerns, what it rests on, who verified it and when it expires. The basis
might be a lasting power of attorney, parental responsibility, next-of-kin
status, or a child judged competent to decide for themselves.

The practising competency table has no column for who a grant concerns, and
should not acquire one, because that table answers the question of what I may
do here. A patient reading their own notes at an org_unit they belong to fits
it unchanged, whereas authority over another person needs its own model in its
own plan. This tree's only part is recording who authorised it.

## End product

### Schema

**One table for every place**, named `org_unit`, replacing both
`organisations` and `sites`. Organisations become rows of type
`organisation`, which today have no parent.

**A `type` column, and it is the only thing that says what an org_unit is.**
The list of valid types lives in code rather than as a database enum, so it
can grow without a migration, and a validation hook rejects unknown types.

The starting vocabulary is deliberately small, because only two values are
needed today:

```text
organisation   the top of a tree: a trust, a GP practice,
               a teaching establishment
site           the level below, which is what teaching uses now

later, if needed:
hospital, building, ward, room, bed, clinic, department, virtual
```

**Nothing is inferred from an empty parent.** A root is an org_unit whose
type says it is one, not an org_unit that happens to have no parent above it.
This is the single most future-proofing decision in the plan, and it is worth
being explicit about why.

Suppose an ICB, a region or some successor body eventually has to sit above
today's organisations. If root-ness were derived from an empty parent, that
day would bring a schema change: the constraint saying organisations have no
parent would start refusing the truth, and every query distinguishing an
organisation from a site by testing the parent column would quietly mean
something else. Because the type is declared instead, the trust keeps
`type = "organisation"`, gains a parent, and one capability flag changes in a
configuration file. No migration, and no query rewritten.

We cannot currently name the body that would sit there, which is precisely
the argument for not encoding the assumption that none ever will.

**Each type declares what it can hold.** The rules this tree has to answer do
not care whether a node is a ward or a clinic; they care what sort of question
it can answer. There are three groups, and they cut across type:

- **Nodes that hold governance.** A trust, carrying features, patient lists
  and a Caldicott Guardian.
- **Nodes that hold clinical roles.** A ward or a clinic, where naming a
  clinical lead means something.
- **Nodes that are only an address.** A bed — nobody is clinical lead of bed
  four.

Without this, every rule becomes a hardcoded list of types scattered across
the backend, and adding a type means hunting all of them down. That is the
same duplication this plan already complains about, where one type list
appears twice in a single file. So each type carries explicit capability
flags:

```yaml
- id: ward
  display_name: Ward
  requires_parent: true
  can_hold_features: false
  can_hold_positions: true
  can_hold_competencies: true
  can_have_members: true
```

A rule then asks whether this type can hold positions, rather than checking
its name against a list.

Note that `requires_parent` is a flag on the type rather than a rule about
roots in general. Today `organisation` sets it to false and everything else
sets it to true, which produces exactly the two-level shape we want. Should
an ICB ever appear above the organisations, `organisation` flips that one
flag and the tree grows a level without a schema change.

**The parent column is the only ownership link.** Deleting a parent is refused
while it still has children, rather than quietly promoting a ward to an
organisation.

**The parent column gets an index.** It has none today — only the name column
is indexed — and every traversal up or down the tree goes through it, so
scoping would otherwise scan the whole table.

**No depth limit.** Any depth is valid here; see **Depth**.

**The many-to-many link table is removed.**

**One membership table**, formed by merging the organisation and site
membership tables. The capacity column keeps its `trainee` default, which is
the least-privilege value. One asymmetry to watch:

```text
organisation_member.capacity — has a server default of "trainee"
site_member.capacity        — has NO server default
```

The merge must carry the organisation side's default across, or the
least-privilege behaviour is silently lost.

**One place column everywhere.** Practising competencies and positions drop
the either/or pair of columns, along with the check constraint and the two
partial unique indexes that policed it, keeping a single mandatory place
column with one ordinary uniqueness constraint.

**Organisation-only tables keep their shape** and point at the new table
instead. Features, patient membership and the conversation link all follow the
same rename, and whether they may later attach below a root is a product
decision rather than a schema change.

**A link table for everything that is not ownership**, holding the two
org_units, the relation, and who created it when. Valid relations are `hosts`,
`teaches_at`, `partners_with` and `shares_service`, with one row per distinct
triple.

This is a first-class typed relationship table, not a repository for awkward
cases, playing the same part as the affiliation resource in FHIR and the
relationship codes in ODS. Each relation can carry its own rule about what it
confers: `teaches_at` grants reach but no admin rights, and nothing grants
membership. Our relations align with ODS closely enough to be worth
preserving:

```text
hosts          ~ RE6  is operated by
teaches_at     ~ RE2  is a sub-division of
partners_with  ~ RE8  is partner to
```

**The tree maps onto FHIR cleanly.** HAPI FHIR is already in the stack, so the
export is worth recording even though this plan does not build it:

```text
root org_unit    -> Organization, no partOf
child org_unit   -> Organization.partOf
link table row   -> OrganizationAffiliation, one per relationship
```

The single parent is what makes that a mapping rather than a reconciliation.

### Backend

**The two models become one.** Organisation and Site both go, replaced by
`OrgUnit`.

**Scoping becomes subtree scoping.** "Admin of my organisations" becomes
"admin at a place governs that place and everything beneath it", which needs
a recursive query. Both PostgreSQL and the SQLite test database support one,
but it would be the first in this repository, so there is no local pattern to
copy.

**The organisations module becomes an org_units module**, answering the same
two questions: who is a direct member, and what a user can reach by walking
up to the root and adding anything reached through a teaching link. Reach
still flows downwards and still confers no membership.

**The three referee helpers go.** Two of them validate a proposed parent
against the organisation link and collapse into "the parent must be in the
caller's subtree", while the third becomes "the org_unit must be in the
caller's subtree". All three live in the main routes file rather than the
organisations module, so deleting that module does not remove them.

**Resolving the root is one query**, walking the parent column up to the row
with no parent. Features and patient membership are read from the root until
a product decision says otherwise.

**A cycle guard on every re-parent.** Before setting X's parent to Y, walk up
from Y and refuse with a 400 if X appears; Y may not be X either. This is the
same upward walk that root resolution already performs, so it is one shared
helper rather than a new query shape.

No such guard exists today beyond the obvious case:

```text
Checked today:      a site cannot be its own parent
Not checked today:  whether the proposed parent is already a descendant

So A -> B, then B -> A, is accepted right now.
```

That is harmless only because nothing traverses the chain, so the guard
becomes load-bearing the moment scoping walks the tree.

The guard belongs in the write path rather than in a database constraint,
because no portable constraint can express whether Y already sits below X.
Belt and braces for the queries themselves: cap the recursion depth and
select distinct ids, so a cycle that somehow reaches the table degrades to a
wrong answer rather than a hung request.

### API

**Add before removing**, following the expand-contract rule in the backend
rules file. The rename makes this the largest compatibility surface in the
plan, so it gets its own steps.

- **The new surface is `/api/org-units`.** Listing with a roots filter returns
  the organisations, creating with an empty parent produces a root, and a
  sub-path handles the typed links.
- **Both old surfaces keep working** as views over the same table for a full
  deploy cycle, then return 410, then go. They are retired only once the
  frontend has migrated and a human has approved the breaking-change gate.
- **The link and unlink routes** return 410 once the frontend has migrated.

### Frontend

**Two page sets, one model, two levels.** The organisations pages list roots
and the org_units page lists the children of one root, both using a single
type, so the split is purely presentational.

**No tree interface.** No parent picker, no nested rows, no expanding.
Creating an org_unit under a root sets its parent to that root and nothing
else, which is what the application does today and what this plan keeps.

**The sites pages are thinner than the organisations pages**, so the plan
should not assume they can simply share components:

```text
pages/admin/organisations/   13 files
pages/admin/sites/            5 files, no list page, no create page

Site creation lives on the organisations side.
The site edit page has no test.
```

Closing that gap is part of the work, not a free consequence of merging.

**A links tab** on an org_unit displays and edits its link rows.

## Migration steps

Each step is its own pull request and leaves the application working. Steps 1
to 9 perform the merge; steps 10 to 12 perform the rename.

1. [x] **Add the capability flags file** and the code that reads it, listing
   `organisation` and `site` plus whichever descriptive types the existing
   site vocabulary still needs. The `type` column already exists on both
   tables, so this step adds validation and flags rather than a column. No
   behaviour change.

   Built as `shared/org-unit-types.yaml` and `backend/app/org_units/types.py`.
   Two readings the plan left open were settled while building:

   - **`room` is the address-only type, and `bed` was not added.** The plan
     names a bed as the example of a node that is only an address, but `bed`
     is not in today's site vocabulary and adding it would widen what the
     API accepts. `room` carries the same argument — nobody is clinical lead
     of room four — so it takes all four capability flags as false and gives
     the address-only group a real member without widening anything.
   - **Nothing is wired into the routes yet.** The loader validates a type
     and answers capability questions, but no route calls it, because step 1
     is meant to change no behaviour and step 12 is where the flags are
     enforced.

2. [x] **Make the organisation link one-to-many.** Add a nullable organisation
   column to sites, backfill it from the link table wherever a site has
   exactly one organisation, and report any site with more than one for a
   human to resolve. Stop writing the link table. This step removes most of
   the referee helpers before any tables merge.

   Three readings the plan left open were settled while building:

   - **The migration refuses outright rather than reporting.** A site with
     two organisations raises and names the site ids, so the deploy stops
     and nothing half-migrated is left behind. A report that let the
     migration succeed would leave those sites owned by nobody and
     invisible to every admin list.
   - **The link route now refuses a second owner with a 409.** It used to
     add another organisation; it now takes on a site that has no owner,
     and says so rather than silently moving one that belongs to somebody
     else. Unlink still leaves the site owned by nobody, which is what it
     always did.
   - **`GET /api/sites/{id}` still returns a list of organisations**, now
     always of length one. The shape is kept so the frontend does not have
     to change in this step; it narrows when the frontend migrates.

   The old link table is left in place, read and written by nothing, so the
   step that adds the typed link table can carry any surviving rows across
   before it is dropped.

3. [x] **Add the link table** and its routes, migrating any multi-organisation
   cases from step 2 into links.

   Three readings the plan left open were settled while building:

   - **There was nothing to migrate.** Step 2's migration refuses to run at
     all while any site belongs to two organisations, so by the time this
     arrives none are left. The plan predicted this; it is now true rather
     than expected.
   - **Both ends of a link point at `sites`.** That is the table the tree is
     being built in, so when organisations become rows there a
     school-to-trust link becomes expressible with no change to this table.
   - **The routes live under `/api/sites/{id}/links`**, because
     `/api/org-units` does not exist until step 11. They move with the rest
     of the surface then.

   Two rules the plan did not spell out, both recorded in the route
   docstrings:

   - **Only the place a link is *from* has to be the caller's.** The
     relationships worth recording cross between organisations, so
     requiring both ends would make the table useless for exactly those.
     Recording one confers nothing, so naming someone else's place gives
     the caller nothing.
   - **Either end may remove a link.** A relationship somebody else
     recorded about your place is still a claim about your place.

4. [x] **Insert a root row for every organisation**, carrying its name, location
   and `type = "organisation"`, and point each organisation's sites at that
   root. Drop the temporary organisation column. Because the data is flat
   today this is a single update statement, with no existing depth to
   preserve.

   Five readings the plan left open were settled while building:

   - **`organisations.org_unit_id` is the bridge.** The organisation-only
     tables still key on the organisation, so something has to say which
     tree row stands for it. The column goes with the rename in step 10.
   - **The mapper creates the root, not the route.** An organisation with no
     root is invisible to the whole permission system — its places reach no
     root, so nobody can administer them. Holding that by remembering to
     call a helper would eventually fail, so it is a `before_insert`
     listener; renames and deletions follow the same way. It disappears
     when the two tables become one.
   - **The drop of the temporary column is its own migration.** The
     backend rules keep destructive operations out of additive migrations,
     so the tree is built by one and the column removed by the next.
   - **A site already nested inside another keeps its parent.** Only the
     ones with no parent are hung off the root, so existing depth survives
     even though the plan expects none.
   - **The site routes refuse a root.** Organisations are rows in the same
     table now; without the guard a trust could be renamed, deactivated or
     deleted from a screen built for wards.

   The subtree walks are written in `backend/app/org_units/tree.py` with a
   depth cap and a set of seen ids, so a cycle degrades to a wrong answer
   rather than a hung request. Step 9 replaces the level-by-level walk with
   one recursive query behind the same functions.

5. **Move membership.** Copy organisation member rows across against the root
   rows, carrying the `trainee` default. Switch readers, then writers, then
   drop the old table.

   Split into two pull requests along the seam the step itself names, because
   one of them is more than a reviewer can hold in their head at once:
   membership is read in sixty-odd places.

   - [x] **5a — write both, read the old one.** The copy, the `trainee`
     default on the merged table, and every route writing both. Three
     functions in `organisations.py` are the only code that knows there are
     two tables, so switching the readers is a change there rather than a
     hunt through the routes.
   - [x] **5b — read the new one, stop writing the old one, drop it.**

   Two readings the plan left open were settled while building 5b:

   - **The old table's name survives as a query.** `organisation_member`
     is now a select over the merged table joined through each
     organisation's own row, exported from `organisations.py` under the
     name the sixty-odd call sites already used. They ask the same
     question; only where the answer comes from changed.
   - **Asking for "a place" now has to say "not an organisation".** Two
     reads assumed every row in the membership table was a place inside an
     organisation. The clinician passport's "narrowest place" lookup would
     otherwise have called every trust a site.

   Two readings the plan left open were settled while building 5a:

   - **A repeat membership changes the capacity rather than failing.** A
     caller that has already checked and one that has not both end up with
     one row saying the same thing, which is what makes writing two tables
     safe to retry.
   - **Clearing somebody's organisations leaves their ward memberships.**
     Both are rows in the merged table now, so the superadmin path that
     replaced every row would have undone the organisation edit made
     moments earlier. It is narrowed to places inside an organisation.

6. [x] **Move practising competencies and positions.** Backfill the single place
   column from the organisation column via the root rows, then drop the
   organisation columns, the check constraints and the partial indexes.

   Three readings the plan left open were settled while building:

   - **"Required" is a check constraint, not a NOT NULL column.** The
     backend rules refuse a NOT NULL column added to a populated table
     without a server default, and there is no sensible default for the id
     of a place. A check saying the column may not be null says the same
     thing and needs no default.
   - **It took three migrations, in that order.** The old check refuses a
     row with both columns set, and the backfill has to set both for a
     moment, so the check comes off first; then the backfill and the new
     rules; then the column.
   - **An organisation the tree has never heard of authorises nobody.**
     The one branch that translates an organisation into its row fails
     closed rather than matching every place.

   `cbac/scoped.py` paid for itself here: it says in its own docstring that
   confining the place branch to one function means the storage can change
   without touching call sites, and not one call site changed.

7. [x] **Move features, patient membership and conversation links** the same way.

   Three readings the plan left open were settled while building:

   - **The columns are renamed, not quietly repointed.** They hold a
     different number than they used to, so a call site that had not been
     moved across would have matched a different place and said nothing.
     Renaming makes a missed one fail loudly.
   - **Deleting an organisation is written out rather than left to the
     foreign keys.** Everything at its place goes with it — members,
     features, patient list, conversations, authorisations, posts, links.
   - **A conversation's `organisations` became `places`**, for the same
     reason the columns were renamed.

   Worth confirming before step 7 was whether feature resolution changed
   meaning: it does not. No site was ever linked to two organisations, so
   no place ever received two feature sets, and a place now takes its
   root's.

### Discovered while building: the unit-test database ignores foreign keys

SQLite does not enforce foreign keys unless asked, so `ON DELETE CASCADE`
does nothing in the unit tests and a row left behind by a delete goes
unnoticed until production. Turning the pragma on was tried and reverted:
a dozen existing fixtures insert rows pointing at organisations that do
not exist, and fixing those is its own piece of work rather than something
to bury inside this merge.

Two deletes are therefore written out in `models.py` rather than left to
the database. Worth closing properly in a plan of its own, because the
next person to rely on a cascade will have the same surprise.

8. [x] **Add the cycle guard and index the parent column**, with a shared upward
   walk helper. Do this before step 9, so no recursive query is ever written
   against a table that can hold a cycle.

   Two readings the plan left open were settled while building:

   - **Departed from what the code did: the self-parent refusal is now a
     400, not a 422.** The plan asks for 400, and one rule refusing the
     same thing with two different codes depending on how far up the chain
     the loop closes would be worse than either.
   - **The tree walks are imported from their own module, not the package.**
     They read the models and the models read the vocabulary, so
     re-exporting them from `app/org_units/__init__.py` made importing
     either one depend on the other being finished.

9. [x] **Switch scoping and reach to subtree queries**, with a depth cap and
   distinct ids. Write them as subtree queries even though the tree is only
   two levels deep, so a third level needs no rewrite.

   Every walk was already a subtree walk from step 4, level by level. This
   step makes each of them one recursive query instead, which is what
   stops depth costing round trips the day a third level appears.

   Three readings the plan left open were settled while building:

   - **`UNION`, not `UNION ALL`.** Both databases drop duplicate rows in a
     recursive query, which stops a cycle looping on its own; the depth cap
     is the second line of defence rather than the only one.
   - **Naming the organisation for a list of places is two queries, not
     one per place.** One walk up for the whole list, then one lookup of
     which organisation each root stands for. There are tests counting the
     queries, because "one query" is the point and nothing else would
     notice it quietly becoming four.
   - **Checked against both databases.** These are the first recursive
     queries in the repository, so they were run against a real Postgres
     as well as the unit tests' SQLite, cycles included.

   No measurement suggested a materialised path column is needed, so none
   was added. See **Risks**.

### Still unassigned: reach through a teaching link

The plan says reach is "walking up to the root and adding anything reached
through a teaching link", and the testing list asks for "a teaching link
grants reach without admin rights". No numbered step builds it, and step 9
is only about the shape of the queries, so it is deliberately not built
here.

`relation_grants_reach` in `app/org_units/relations.py` already declares
which relation confers it — `teaches_at` and nothing else. What remains is
one clause in `get_reachable_org_ids`, and it belongs with the org_units
module in step 10, where the plan describes reach.

### How steps 10 to 12 are sequenced

Two questions were put to the person the plan is for, and both are
settled:

- **The column renames take the full expand-contract, inside this stack.**
  `site_id` becoming `org_unit_id` is three units, not one: write both
  names, then read the new one, then drop the old. A *table* rename stays
  a single step, which the backend rules already bless.

- **`organisations` folds into `org_unit`, breaking changes and all.** The
  gates will be signed off. Even so the fold is staged rather than
  dropped in: the new `/api/org-units` surface arrives alongside the old
  one, the frontend moves across, the old surfaces are retired, and only
  then does the `organisations` table go. Nothing is broken at any point
  a reviewer stops at.

So the remaining steps land as:

- [x] 10a — write both names for the place column
- [x] 10b — read the new name
- [x] 10c — stop writing the old name, and drop it
- [x] 10d — rename the tables and the model
- [ ] 10e — the org_units module, and reach through a teaching link
- [ ] 11a — the `/api/org-units` surface, alongside the old ones
- [ ] 11b — the frontend onto it, and the thin-pages gap closed
- [ ] 12a — retire the old API surfaces
- [ ] 12b — drop the `organisations` table, and enforce the type flags

#### 10a — write both names for the place column

Two readings the plan left open were settled while building:

- **The mirror lives in the mapper, not at every write.** There are dozens
  of places that record a place, and one of them being missed is a row
  whose place is known under one name and not the other — the very failure
  this plan exists to remove, reintroduced by accident.
- **Both unique rules are in force meanwhile.** While both columns hold
  the place, both have to refuse the same duplicates, or a row the old
  rule would have stopped slips in under the new one.

`Site.staff` was removed on the way: two foreign keys to the same table
made it ambiguous, and nothing used it.

#### 10b — read the new name

Every read moved across; every write still sets both. One thing worth
recording:

- **The test fixtures that write a membership row directly had to start
  writing both names too.** They stand in for the old revision, which in
  production writes both from 10a onwards — so this is the fixtures
  catching up with the application rather than a change in behaviour.
  A row carrying only the old name is simply not found once the reads
  move, which is what makes the backfill in 10a load-bearing; there is a
  test saying so.

#### 10c — stop writing the old name, and drop it

Three readings the plan left open were settled while building:

- **The membership table's key moved with the column.** It keys on the
  place, so the old key had to go before the column under it could.
  Postgres marks a new key's columns as required by itself, which is how
  the place stays mandatory without a default that would make no sense
  for an id.
- **Two indexes became one.** The old name carried a pair — place, and
  place with competency — and the new name gained a single-column one
  while both were live. One index answering "who here may practise this"
  is enough.
- **`test_the_place_column_is_being_renamed.py` was deleted.** Its whole
  subject was the period when both names existed, and that period is over.

The keyword arguments on `cbac/scoped.py` still read `site_id`, meaning "a
place inside an organisation" as opposed to `organisation_id`. They
collapse into one when `organisations` folds away in 12b; renaming them
now would leave two words for one idea sitting next to each other.

#### 10d — rename the tables and the model

`sites` becomes `org_unit` and `Site` becomes `OrgUnit`, with the tables
that hang off a place renamed to match. Three readings the plan left open
were settled while building:

- **The rename was done by token, not by text.** A search-and-replace on
  the word would have rewritten the API path `/api/sites`, which is still
  live, and the messages a user reads. Only names in code moved.
- **Every index was renamed by hand.** Postgres leaves a renamed table's
  auto-named indexes alone, so autogenerate would flag them against the
  model's expected names forever.
- **The dead many-to-many table went with it.** Nothing had read or
  written it since ownership moved onto the parent column, and it held no
  rows.

### Discovered while building: a third table still has the pair of place columns

`site_common_competency`, in the clinician passport, carries the same
either/or `site_id` and `organisation_id` pair that step 6 removed from
practising competencies and positions — with a check constraint policing
it, and a comment saying it follows that pattern deliberately. The plan
does not mention it.

It only needed repointing at the renamed table here. The pair itself
collapses in 12b, where `organisations` goes and one of the two columns
stops meaning anything.

10. [ ] **Rename the table and model** to `org_unit` and `OrgUnit`, renaming the
    membership, features, patient membership, conversation and link tables to
    match, and delete the old organisations module.

11. [ ] **Add the new API surface** alongside the old one, migrate the frontend
    onto it, and rename the frontend type. Close the thin-pages gap in the
    same pass.

12. [ ] **Retire both old API surfaces** once nothing reads them, then refuse to
    delete a parent that still has children and enforce each type's
    `requires_parent` flag.
    Last, so the earlier steps are not blocked by it.

## Risks

### Clinical lead lookup would break silently if inheritance crept in

This is the sharpest risk in the plan. Four live teaching features resolve the
clinical lead by matching positions against a list of site ids, with no
ancestor walk whatsoever:

```text
registration clinical-lead validation
delegate enrolment
the delegate list's site and lead columns
the certificate coordinator email
```

If the merge ever implies that a ward inherits its hospital's lead, all four
fail without raising an error: registration turns away a legitimate lead, the
delegate table shows a dash, and the coordinator email goes to nobody.

Keep the lookup an exact match on one org_unit, and test all four at every
step.

### The rename touches those same teaching paths

The same four features traverse the organisation-to-site link, so steps 10
and 11 must move them together with their tests rather than leaving one of
them reading an old name.

### An org_unit with two organisations

Step 2 must refuse to guess. In practice there are none — every link row in
every test and seed points at exactly one organisation — so this should be a
no-op that proves itself rather than a resolution exercise.

### A cycle is already reachable through the API

Today's parent check only prevents a site being its own parent, so A to B to A
can be created right now. Step 8 adds the guard, but the backfill steps should
also assert that every row reaches a root, so any pre-existing cycle is caught
by a migration that refuses rather than by a hung request later.

### Recursive queries in hot paths

Every admin route currently performs one join through the link table. Measure
the recursive version on the admin list pages before step 9, and add a
materialised path column only if it proves necessary.

### Feature resolution changes meaning

Today a site linked to two organisations would receive both feature sets,
whereas after the merge it receives the root's. No data relies on this,
because no such sites exist, but confirm that again before step 7.

### Registration must never break

The public registration route inserts teaching delegates into the membership
table. It has to keep working at every step, and its tests have to run at
every step.

## Testing

- **Backend, at each step:** the site, organisation, org_unit, position and
  practising competency tests, plus the four teaching flows named under
  **Risks**. Run the full backend suite before marking a pull request ready.

- **Add tests for the tree rules:** a root cannot have a parent, a non-root
  must have one, deleting a parent with children is refused, subtree scoping
  does not leak a neighbouring trust's org_units, reach confers no
  membership, and a teaching link grants reach without admin rights.

- **Add cycle tests:** an org_unit cannot be its own parent, cannot be
  re-parented under its own child, and cannot be re-parented under a deeper
  descendant, so the guard is known to walk the whole way up rather than a
  single level. A legitimate move to a sibling subtree must still succeed.
  Each test asserts a 400 and an unchanged row.

- **Add one test per capability flag:** a type that cannot hold positions
  refuses a position, and a type that cannot hold features refuses a feature
  row.

- **Add a three-level test at the query layer**, even though the interface
  builds only two, so subtree scoping is known to work before anyone adds a
  parent picker.

- **Frontend:** the admin page tests and the Storybook suite, since these
  pages and their components change shape.

- **End to end:** the existing organisation and site admin journeys must pass
  unchanged until step 11, then be updated alongside the route retirement.

## Out of scope

- **A tree interface:** parent picker, nested rows, more than two levels. See
  **Depth**.
- **Attaching features or patient membership below a root.**
- **Any change to competency resolution** or to the system permission levels.
- **A separate physical or estates tree** alongside the governance one.
- **Authority over another person**, such as reading a relative's notes,
  which needs its own model and its own plan. See **Non-goals**.
- **Care relationships and cross-organisation patient access.** See
  **Non-goals**.
- **Exporting to FHIR.** The mapping is recorded under **Schema** so the
  design does not foreclose it.
- **Anything above the accountable provider**, such as an ICB, a region or a
  national body. Because `requires_parent` belongs to the type, adding one
  later is a configuration change rather than a schema migration, but nothing
  here builds for it. Note that oversight bodies commission and inspect
  rather than administer, so they are probably links rather than parents,
  which is the distinction ODS draws between being commissioned by and being
  a sub-division of.
