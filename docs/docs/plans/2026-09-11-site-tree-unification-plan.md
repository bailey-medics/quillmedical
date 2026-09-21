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
- [x] 10e — reach through a teaching link (the module move goes with 12b)
- [x] 11a — the `/api/org-units` surface, alongside the old ones
- [x] 11b-i — one place client and type for the screens to use
- [x] 11b-ii — the organisation screens onto it
- [x] 11b-iii — the place screens onto it, and the edit page tested
- [x] 11b-iv — a list page and a create page for places
- [x] 11b-v — the last readers of the old surfaces, bar one
- [x] 12a-i — the rules the old surfaces prove, proved on the new one
- [x] 12a-ii — the rest of those rules: scoping, and one place per site
- [x] 12a-iii — retire `/api/sites`
- [x] 12b-i — the kinds of organisation become kinds of place
- [x] 12b-ii — an organisation created as a place is still an organisation
- [x] 12b-iii — the users API learns place ids, beside the old ones
- [x] 12b-iv — the user form onto place ids
- [x] 12b-v — the features, patients and staff rules onto the place surface
- [x] 12b-vi — the remaining organisation-surface tests onto places
- [x] 12b-vii — retire `/api/organisations`
- [x] 12b-viii — retire the organisation and site lists on the users API
- [x] 12c-0 — make the two id sequences disagree in the tests
- [x] 12c-i-a — a place column beside every organisation column, and both written
- [x] 12c-i-b — those tables read the place column, translating at the edges
- [x] 12c-i-b2 — teaching's surface answers in place ids, beside the old one
- [x] 12c-i-b3 — retire teaching's organisation-keyed fields and paths
- [x] 12c-i-c1 — stop writing the organisation column
- [x] 12c-i-c2 — drop the organisation column
- [x] 12c-i-d — `site_common_competency`'s two place columns collapse into one
- [x] 12c-ii-a — an organisation's place is required
- [x] 12c-ii-b — the membership writers take a place
- [x] 12c-ii-c — the users list excludes members of a place
- [x] 12c-ii-d — membership and reach answer in place ids
- [x] 12c-iii-a — a place remembers the prefix its media is filed under
- [x] 12c-iii-b — the place surfaces stop translating organisation ids
- [x] 12c-iii-c — the user listing names the right place
- [x] 12c-iii-d — drop the `organisations` table
- [x] 12c-iv — refuse deleting a parent with children, and enforce `requires_parent`
- [x] 12d-i-a — the membership writers take an org_unit
- [x] 12d-i-b — the reader helpers answer in org_unit ids
- [x] 12d-i-c — the membership subquery names an org_unit
- [x] 12d-i-d — the locals and parameters name an org_unit
- [x] 12d-i-e — `org_unit_ids` beside `place_ids` on the users API
- [x] 12d-i-f — the frontend sends and reads `org_unit_ids`
- [x] 12d-ii — retire `place_ids`
- [ ] 12d-iii — say `org_unit` everywhere `place` still stands in for it
  - [x] 12d-iii-a — the nine helper functions named for a place
  - [x] 12d-iii-b — the locals and parameters named for a place
  - [x] 12d-iii-c-i — `exclude_org_unit` beside `exclude_place`
  - [x] 12d-iii-c-ii — `org_unit_id` beside `place_id` on the passport replies

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

#### 10e — reach through a teaching link

The item left unassigned at step 9 is built: a `teaches_at` link makes the
place it points at reachable. Nothing else about it changes — not
membership, not admin rights.

**Departed from the plan on the module rename.** The plan pairs this with
turning the organisations module into an org_units module. Its two
functions still answer in *organisation* ids, because organisations still
exist; renaming them now would be a large diff that says nothing true
yet. The move goes with 12b, where the functions genuinely change meaning.

Three rules the plan did not spell out, all written into the code:

- **A link is followed away from its source, never back.** A link is a
  claim its source makes about itself, so following it backwards would let
  anybody name a school and be let into it.
- **A link belongs to the place that made it.** One ward recording a
  relationship must not quietly open it to everybody at the trust. An
  organisation that means it for all its people records the link on
  itself.
- **One hop.** Reach that chained would make "who can see this" depend on
  a path nobody drew.

#### 11a — the `/api/org-units` surface

Eleven paths, covering everything the two older surfaces do, all keyed on
a place id. The old pair is untouched and still answers in organisation
ids and site ids, which is why both run side by side rather than one being
a view over the other.

Four readings the plan left open were settled while building:

- **The type decides whether a place may be a root**, so neither a
  ward with no parent nor a nested organisation can be created by accident.
  Creating a root stays an operator's job, as creating an organisation
  always was.
- **Changing a type across that line is refused.** Turning a ward into an
  organisation is not a rename; it would move the place out of its tree
  without saying so.
- **Features and patient lists are refused on a place that cannot carry
  them**, rather than written and never read. A feature quietly enabled on
  a ward that does nothing is worse than being told it cannot be.
- **Scoping here is membership, not reach.** Reach is why somebody sees
  teaching content at a place they visit; it is not authority to
  administer it, and these are the administration routes.

`require_clinical_services` moved from `main` to `deps` so the new router
could depend on the *same* callable. A wrapper would have been a different
object, and the tests switch that gate off by overriding the object — so
the wrapper would have quietly stayed on.

#### 11b — the frontend, in three

The admin screens are about 2,700 lines of page code and 2,900 of tests.
Moving all of them in one pull request would be far past what anybody can
read at a sitting, so it is split: the client and type first, then the
organisation screens, then the place screens together with the thin-pages
gap.

**11b-i** adds `frontend/src/domains/orgUnit.ts`: the `OrgUnit` type and
every call the screens make, gathered so the addresses appear once. The
rename just done showed why that matters — the same path was written out
in a dozen files, and moving it meant finding all of them. No screen
changes yet.

**11b-ii** moves the eight organisation screens across. Five readings the
plan left open were settled while building:

- **The organisation page now makes one request instead of two.** A place
  carries its own people, the places inside it, the features switched on
  there and its patient list, so there is nothing to fetch separately.
- **The type's name comes from the server.** The pages used to title-case
  the stored value, which meant two places could disagree about what a
  kind of place is called.
- **Taking a place out of an organisation is deleting it.** A place that
  belongs nowhere is invisible to every list and reachable by nobody,
  which is worse than saying it has gone. The old "unlink" wording
  promised something the tree cannot do.
- **Adding somebody now says what they are.** The old address assumed
  staff; a place takes trainees and external assessors too.
- **Naming a clinical lead is two acts.** The person is at the place, and
  the person holds the post. They used to be one, which meant a post could
  not be made vacant without also removing the person — and a vacancy is a
  real, actionable state.

Two things were added to the surface from 11a while moving the screens,
because moving them is what showed they were missing: a place's children
carry their clinical lead's *name* as well as their id, so a list reads
without a request per row; and there is a route for naming or vacating a
clinical lead.

#### 11b-iii — the place screens onto it

The three screens under `pages/admin/sites/` now speak in places: the
place page, the edit page and the staff picker. Nothing on them fetches an
organisation any more.

- **A place says where it sits.** The detail answer now carries
  `parent_name` beside `parent_id`, so the page can print "inside Test
  Trust" without a second request for a single word. Empty at the top of a
  tree, which is a fact about the place rather than a missing value.
- **The staff picker separates what somebody is from what they hold.** The
  old form had one "role" field where clinical lead sat alongside staff
  and trainee, as if they were three of a kind. They are not: the first is
  a post, the other two are what a person is. Picking clinical lead now
  adds the person as staff and then names them to the post.
- **The edit page has a test at last.** It covers loading, renaming,
  naming a lead, leaving an unchanged lead alone, and the confirmation
  before a place is taken out of use. This was the gap the plan named, and
  the page that most needed it — it is the one screen that can rename a
  place, put it out of use, and change who leads it.

The gap the plan named has three parts, and this unit closes one of them.
The list page and the create page are the other two, and they are new
screens rather than moved ones, so they land as **11b-iv** rather than
swelling this unit past what anybody can read at a sitting. Creating a
place still works today, from the organisation side.

#### 11b-iv — a list page and a create page for places

The rest of the thin-pages gap. Both screens existed for organisations and
neither for the places inside them, which is why a site could only be
reached through the organisation that owns it.

- **One request builds the list.** Every place the person may administer
  comes back at once; the organisations among them name each site's owner
  rather than appearing as rows. Asking twice would cost a round trip to
  say the same thing.
- **A site whose owner is not in the answer is still listed.** Somebody
  may administer a ward without administering the trust above it, so the
  owner column reads "not known" rather than the row disappearing.
- **The create page asks what the old flow assumed.** Creating from the
  organisation side decided the parent before the question was put, so a
  ward could not be placed inside a building. The place above is now a
  field like any other.
- **Who leads a site is not asked while creating one.** The person has to
  be at the place before they can hold the post there, and both are one
  act on the site's own pages once it exists.
- **The list of kinds of place now comes from the shared file.** Three
  screens carried their own copy of it, which is how a screen comes to
  offer something the server will refuse. `shared/org-unit-types.yaml` is
  generated into the frontend like the professions and competencies
  already are, and `requires_parent` is what separates a ward from a
  trust.

#### 11b-v — the last readers of the old surfaces

Three screens outside `pages/admin/` were still reading the old
addresses, and one of them had gone quietly wrong when the admin screens
moved.

- **The breadcrumb was naming the wrong organisation.** It asked
  `/organisations/{id}` with what is now a place id, so it named
  whichever organisation happened to hold that number, or nothing at all.
  Both kinds of place come from one address now, which is the whole point
  of there being one.
- **The place above is not always an organisation.** A ward can sit
  inside a building, so a link upwards has to know which of the two pages
  to go to. The detail answer carries `parent_is_root` for that, rather
  than the screen fetching the parent to find out.
- **"new" is a page, not a place.** Visiting the create form used to send
  a request asking about a place called "new" and log the failure. Ids
  that are not numbers are left alone now.
- **Sub-pages are named rather than capitalised from the address.** The
  navigation read "Add-staff".
- **The count of organisations comes from the places at the top of a
  tree**, which is what every other admin screen already counts.

One reader is deliberately left: the user form sends `organisation_ids`
and `site_ids` to the users API, and those are organisation ids, not
place ids. Moving the screen means moving what the API accepts, so it
goes with **12b**, where the table folds — and until it does, `/api/organisations`
cannot be retired, which 12a has to respect.

#### 12a — retiring the old surfaces, in three

About ninety tests exercise `/api/sites` and `/api/organisations`, and
most of them are proving rules about places rather than about those two
addresses. Deleting them with the routes would lose the rules, so the
retirement is split: move what is worth keeping first, then retire.

**12a-i** moved the first group and found a gap while doing it.

- **Taking somebody off a place did not vacate what they held there.**
  Naming a clinical lead requires the person to be at the place, so
  leaving them holding the post after taking them off it left the place
  in a state the same surface refuses to create. The old surface got this
  right; the new one did not, and nothing noticed because no test asked.
  The post is vacated rather than deleted, so the handover is recorded.
- **The cycle guard walks the whole chain.** One level up was already
  refused. Moving a hospital under a room three levels below it is the
  case the walk exists for, and only the old surface asked it.
- **The membership competency is about the competency, not the address.**
  Holding `manage_users` alone still does not put somebody at a place,
  and `manage_staff_membership` alone still does, now asked of
  `/api/org-units` as well.

**12a-ii** moved the rest: who may see what, and whose tree a place can
be put into.

- **The list fails closed.** An admin belonging to no organisation sees
  nothing, because `IN ()` is the classic way a filter turns into its
  opposite. A place hanging off nothing is not shared either.
- **The gate is a competency, not a rank.** A consultant in the right
  organisation still cannot read the estate.
- **Whose tree a place goes into is checked on the move as well as on the
  create.** Only `/api/sites` asked that, and it is the same rule applied
  later. Somebody else's ward cannot be the parent, and neither can a
  place that belongs nowhere.

A site belonging to exactly one organisation needed nothing moved: a
place has one parent column, so a second owner is not a rule to enforce
but a state that cannot be written down. The link and unlink routes that
rule existed for go with the surface.

**12a-iii** retired `/api/sites`. Thirteen addresses answer 410, and
about 1,100 lines of routes and 1,300 lines of tests went with them.

- **The shapes stay, the answers stop.** Each retired route still
  declares the request it always took, so a stale client sending what it
  always sent is told the address has gone rather than that its request
  is malformed. Deleting the paths outright is a later step, and a
  visible one.
- **410 rather than 404**, so a caller can tell "this never existed" from
  "this used to be here": the second says there is somewhere else to
  look, and the answer names `/api/org-units`.
- **Same answer to everybody.** A retired address holds nothing to
  protect, so it answers without a permission check. Replying 403 to one
  caller and 410 to another would only tell them apart.
- **`oasdiff` sees no breaking change**, because the schema did not
  change — the behaviour did. So the gate is not raised by this step, and
  the deliberateness lives here and in the pull request instead. The one
  client that used these addresses is this repository's own frontend, and
  it moved in 11b.
- **Two gaps surfaced while moving the tests.** The new surface accepted
  a misspelt base profession where the old one refused it, which would
  have written a profession nobody holds onto a person's record; and an
  organisation could be read through the sites addresses, which is now
  moot.

`/api/organisations` cannot follow until the user form moves, which is
12b.

#### 12b-i — the kinds of organisation become kinds of place

The plan left open what happens to `organisations.type`, whose values —
hospital team, GP practice, private clinic, teaching establishment — say
what kind of organisation something is. Moving the screens onto the place
surface without settling it had already broken something: the create
screen offered those kinds, the tree knew only `organisation`, and every
attempt to create one answered "unknown kind of place". The screen's own
test mocked the request, so nothing caught it.

- **They become types of place**, alongside `organisation` itself, which
  stays as the plain answer for a body that is none of the others. One
  vocabulary for one question, and a root in the tree that can say which
  kind of organisation it is.
- **What makes something a root is the flag, not the name.** Three
  queries asked `type != "organisation"` to mean "the places inside
  organisations", which would have quietly lost a practice the day the
  kinds arrived. They ask the flag now.
- **`department` stays a place inside an organisation**, and is no longer
  offered as a kind of organisation. It was in both lists meaning two
  different things, and the nested meaning is the one the tree uses.
  Nothing is live yet, so nothing has to be reclassified.
- **The screens read the kinds from the shared file**, as the place
  screens now do, so the list on screen cannot drift from the list the
  server accepts. That drift is what broke it.

Still open, and what 12b-ii and 12b-iii are for: the user form sends
organisation ids to the users API, so `/api/organisations` still has one
reader; and creating an organisation through the place surface writes no
`organisations` row at all, which is fine only because that table is on
its way out.

#### 12b-ii — an organisation created as a place is still an organisation

Creating a root through the place surface wrote no row in the
organisations table, and that table is still what answers in organisation
ids: who may administer what, and which organisations the user form
offers. So a trust created on the new screens was a place only a
superadmin could see, with nobody able to belong to it — the first thing
anybody would try after creating it.

- **The row is written beside the place**, and kept in step when the
  place is renamed or retyped. It names its place on the way in, which is
  what stops the model listener creating a *second* root for it.
- **Deleting the place deletes the organisation**, through the same
  listener that already clears everything hanging off a root.
- **This is scaffolding with a known end.** The whole point of 12b-iv is
  that one of the two tables goes; until it does, the honest thing is for
  both to describe the same world rather than half of one.

#### 12b-iii — the users API learns place ids

The user form is the last reader of `/api/organisations`, because the
ids it sends to the users API are organisation ids. Changing what those
numbers mean in one step would be a breaking change no schema check can
see: a tab left open across the deploy would write place ids into fields
counted against another table, and nothing would notice. So it expands
first — the decision recorded is to expand and contract rather than
reinterpret.

- **`place_ids` is the one list**, counting in place ids, organisations
  included. There is one table of places, so there is nothing to split
  into two fields.
- **A request may use one vocabulary or the other, never both.** The same
  number means different things in each, so applying both would make the
  answer depend on which was applied last. Sending both is refused.
- **What somebody is at a place is unchanged**: staff at an organisation,
  a trainee at a place inside one, exactly as the two older lists each
  did. Widening the request must not quietly change who counts as staff;
  settling on one answer is a separate decision.
- **An admin settles their own places and leaves the rest.** Saving the
  form clears the memberships they can administer and keeps the others,
  so an admin at one trust cannot empty somebody's memberships at
  another by saving a form they could not even read. The old `site_ids`
  path checked only that a place existed, which is the hole this closes
  on the way past.

`oasdiff` reports no breaking change, as an expand step should.

#### 12b-iv — the user form onto place ids

The last screen reading `/api/organisations`. Nothing in the frontend
asks either old surface anything now.

- **One request instead of one per organisation.** It used to fetch the
  organisations and then a detail request for each one's sites, so an
  estate of thirty trusts meant thirty-one requests to fill two dropdowns.
- **The form keeps its two controls over one list.** Which control a
  place appears in is decided by what it is, not by where somebody put
  it, so the two cannot disagree about a place.
- **A ward is listed under the trust it is inside, however deep.** The
  walk goes up to the root rather than reading the immediate parent, so a
  ward inside a building inside a trust is still that trust's ward. The
  walk is bounded by the number of places, so a chain that somehow loops
  cannot hang the page.
- **A place whose organisation is not in the answer is left out.**
  Somebody may administer a ward without administering the tree above it;
  showing it under a name we do not have would be worse than not showing
  it, and the place's own screens can still put people there.

#### 12b-v — features, patients and staff, on the place surface

The first group of organisation-surface tests moved across, and moving
them turned up two more places where the new surface had quietly drifted
from the old.

- **Switching a feature on was operator-only on the place surface.** The
  organisations surface asks for `manage_users` at an organisation the
  caller administers, and the teaching plan says the same: features are
  how an organisation says what it does, and its own administrators
  settle that. Retiring the older surface would have taken a working
  thing away from every admin. The competency gate was missing from the
  route as well, so it now asks for both.
- **The organisation page listed trainees as staff again.** The old
  response had a filtered `staff_members` list; a place answers with
  everybody who is there and what each of them is, which is right for the
  answer and wrong for a heading promising staff. The page filters now,
  and the rule is tested where it lives — on the screen.
- **Patients and features moved without incident**, the shapes being the
  same either side.

#### 12b-vi — the rest of the organisation-surface tests

Seven more files now ask `/api/org-units`: membership through the
routes, reach through a link, what a site-only admin may not administer,
the platform-role column, messaging's removals, the grant that rides with
a membership, and the unauthenticated sweep.

- **What was only asked of the organisations surface is asked here now**:
  that an unauthenticated caller gets 401 and a signed-in one without the
  competency gets 403, that a member who does not exist and a place that
  does not exist are both 404, and that a name is stored without its
  surrounding spaces.
- **A place must have a name.** The routes strip a name before storing
  it, so a name of spaces became a place called nothing — a row nobody
  can search for, pick out of a list, or ask about. Both surfaces
  accepted it; this one refuses, which is a deliberate improvement rather
  than a port.

What is left on the old surface is its own CRUD tests, which the place
surface now covers rule for rule. They go with it in 12b-vii.

#### 12b-vii — retire `/api/organisations`

The second of the two old surfaces. Eleven addresses answer 410, and
about 670 lines of routes went with them, along with the tests that only
exercised that address.

- **Same shape as the sites retirement**: the request each route always
  took is still declared, so a stale caller is told the address has gone
  rather than that its request is malformed; 410 rather than 404; the
  same answer to everybody, because a retired address has nothing left
  to protect.
- **What the organisation detail said about its sites** — each one's
  clinical lead — the place detail says about its children, and the test
  for it moved there in 11b.
- **`oasdiff` sees no breaking change again**, because the schema has
  not changed, only the behaviour. The one client of these addresses was
  this repository's frontend, which moved earlier in the stack.

The `organisations` table is still there, still written beside each root
place and still what membership counts against. Dropping it is 12b-viii.

#### 12b-viii — the users API speaks only in places

The contract step for 12b-iii, and the last thing outside the database
that counted in organisation ids.

- **Removed rather than ignored.** Silently accepting a field that no
  longer does anything is how a caller comes to believe a membership was
  recorded when it was not.
- **Both went together**, because keeping either would mean keeping the
  organisations table they count against, which is the point of the next
  unit.
- **`site_ids` was the more misleading of the two.** It already answered
  in place ids and already carried places that were not sites, so its
  name said something narrower than it meant.
- **This is the first real breaking change in the stack.** Six decision
  files record it, and the `api-breaking-change-review` gate is the
  human half. Nothing on a stale tab breaks: the bundle that reads this
  response is the bundle that writes it, and the two dropdowns render
  from an empty list the same way they already do for an admin who can
  see no organisations.

#### 12c — what dropping the table actually needs

Attempted as one unit and abandoned, because it is not one. The refactor
itself is straightforward and was written: `organisation_member` becomes
the membership table filtered to root types, `_root_of` becomes a check
rather than a lookup, and the four translating walks in
`app/org_units/tree.py` collapse into `root_ids_of` and `descendant_ids`.
Every test passed.

**And it would still have been wrong.** Nine columns in two features are
foreign keys to `organisations.id`:

- **Teaching** — `question_bank_configs`, `question_bank_items`,
  `assessments`, `teaching_org_settings`, `question_bank_org_status`,
  `question_bank_syncs`, `module_media_link`.
- **The passport** — `passport_signoff_request`, and
  `site_common_competency`, which carries the pair of place columns this
  plan already noted, with a check constraint saying exactly one is set.

Those tables keep counting in organisation ids. Change what
`get_member_org_ids` answers without moving them, and teaching looks up
its rows by a number that means something else — silently, and only in
production: the two id spaces coincide in the unit tests, because each
fixture creates one organisation and it takes the same id as its place.
The suite went green on a coincidence, which is the sharpest reason this
plan exists at all.

So the order is: the columns first, each one expand-contract as the
backend rules require; then membership and reach; then the table. Some
of that work can borrow the refactor that was written here — it is
recorded in the pull request thread rather than the repository, since
code nothing calls is worse than code that does not exist.

The last unit is unblocked by none of it: refusing to delete a parent
that still has children, and enforcing each type's `requires_parent`
flag, need nothing from the fold.

#### 12c-iv — the two rules the fold never blocked

Both were listed last in the plan as though they waited on the table
going. Neither does.

- **A place with something inside it is refused rather than emptied.**
  The parent column says `SET NULL`, so deleting a ward left its rooms
  belonging nowhere: invisible to every list, reachable by nobody, and
  impossible to tell from a room that was always loose. The refusal is
  reversible — move them or delete them first — which is what makes it
  the kinder answer.
- **An organisation may not be given a parent.** This was possible until
  now, and produced a place whose type said "top of a tree" while every
  walk upwards landed in somebody else's trust. `is_root` would have gone
  on saying yes. Creating one that way was already refused; moving one
  was not.

#### 12c-0 — make the two id sequences disagree in the tests

The unit that makes the rest of 12c safe to attempt, and it had to come
first: without it the suite cannot tell a place id from an organisation
id, so every step of the fold would be marked correct by a test run that
proves nothing.

Every test now starts with one place that belongs to no organisation, so
each organisation created afterwards has a place id one higher than its
own. It is a ward rather than a top-level type, so no question the
application asks counts it as an organisation: it is not in a list of
roots, and nobody can see it, because nobody is a member of anything
above it.

**Measured rather than asserted.** The refactor that 12c-ii will need —
membership and reach answering in place ids, with the teaching and
passport columns left where they are — was applied to both:

- **Without the spacer: nothing failed.** The whole suite, green, on a
  change that would have matched teaching rows by the wrong number in
  production and written place ids into columns meaning organisation
  ids.
- **With the spacer: eighty-five failures**, in the teaching banks and
  assessments, the passport memberships, and scoped access — which is
  exactly where the confusion lives.

Two tests had to change, and both were wrong before. One asserted an
exact list of places where it meant "the organisation is not among
them". The other asked which places had nothing above them, when what it
meant was which places are organisations — the difference this whole
plan exists to draw, written in a test of the plan's own work.

#### 12c-i-a — a place column beside every organisation column

The expand step, taken for all eight tables at once because it is one
idea eight times: seven in teaching and one in the passport each gain an
`org_unit_id` beside their `organisation_id`.

- **The backfill is a join, not a guess.** Every organisation already
  names its own place, so the migration fills the new column for every
  existing row from `organisations.org_unit_id`.
- **Both columns are written from this deploy.** There is exactly one
  place each of these rows is created, which is what makes the step
  small; a row written with only the old column would be invisible to
  the reads that switch next, and nothing would say so — the reader
  would simply find less than there is.
- **Nullable for as long as the move takes.** A null means a writer that
  has not been moved across, which is a state the next step's tests can
  see rather than one the database forbids.
- **`site_common_competency` is not in this batch.** It carries a pair of
  place columns with a check constraint saying exactly one is set, so it
  collapses rather than gains a column, and that deserves its own review.

Round-tripped against a real Postgres — upgrade, downgrade, upgrade —
with `alembic check` reporting no drift afterwards.

#### What 12c-i-b has to be careful about

Switching these tables' reads is sixty-three query sites, which is
tedious but not interesting. What is interesting is where the ids come
from and where they go.

- **They come from membership**, which still answers in organisation ids
  until 12c-ii. So the read switch translates once, where teaching
  resolves the caller's organisations, rather than at each query.
- **They go out of the API.** Teaching and the passport both put
  `organisation_id` in responses, and teaching has paths of the shape
  `/admin/banks/{bank_id}/organisations/{org_id}/settings`. The frontend
  reads those ids and puts them back in URLs. Changing what the number
  means without changing its name is the silent break this plan refuses
  everywhere else, so the surface moves the way the users API did:
  a place id alongside, the screens across, then the old field out.
- **Which is why the two are separate steps.** The reads can move now
  with the boundary translating back, and the surface can move after,
  each one small enough to check.

#### 12c-i-b — teaching and the passport read the place column

The switch itself was sixty-three query sites and mechanical. Four
things around it were not.

- **One listener replaced eight hand-written dual-writes.** The writers
  are not only the eight places the application creates these rows —
  fixtures, scripts and whatever is written next also write them, and a
  row carrying one id and not the other is invisible to half the code
  with nothing to say so. The pair is now kept in step on insert and
  update, in either direction, which is what let the code move a writer
  at a time.
- **Media objects are addressed by organisation id, not merely filtered
  by it.** They live at `{organisation_id}/{module}/{asset}` in a
  bucket, and the signed-cookie prefix covers that path. Following the
  column there would have moved every future upload and left everything
  already uploaded unreachable — an object-store migration rather than a
  column switch. Those three call sites translate back, and the deletion
  reads the prefix from the row that remembers it.
- **The continuous-integration sync fell back to the literal
  organisation 1.** A guess that held while organisations were numbered
  from one and nothing shared their numbering. It resolves the first
  organisation in the tree now, and says so plainly when there is none
  rather than writing rows that point at nothing.
- **The tests found each of these**, because the id spacer from 12c-0
  made a place id and an organisation id different numbers. Without it
  every one of them would have passed.

The surface is untouched: teaching and the passport still answer in
organisation ids, translated at the edge. Moving that is 12c-i-b2.

#### 12c-i-b2 — teaching's surface learns place ids

The expand step for the API itself, so the screens can move before
anything is taken away.

- **Both ids in the answers.** The settings response and each row of the
  bank's organisation list carry `org_unit_id` beside `organisation_id`.
  Named for the column rather than prettily, because that is what every
  other place-shaped answer is named.
- **A second path beside each organisation-keyed one.**
  `/admin/banks/{bank}/places/{place}/settings` and its active-version
  twin, each translating once and calling the same handler, so the two
  cannot drift.
- **The screens moved across in the same unit**, because the ids they
  hold are ids they put straight back into URLs: the bank detail page
  links by place, the settings page matches its row by place, and
  registration sends the place the validation handed it.
- **Registration takes either.** `org_unit_id` is what the form sends
  now; `organisation_id` still works for a tab left open across the
  deploy.

The organisation-keyed fields and paths go in 12c-i-b3, which is a
breaking change and needs its decision files.

#### 12c-i-b3 — teaching answers only in places

The contract step for the same surface, one release after the expand.

- **`organisation_id` leaves four answers**: the teaching settings row on
  both its GET and its PUT, each row of a bank's organisation list, and
  the clinical-lead validation. Four `oasdiff` findings, four decision
  files, none forcing a reload — the screens moved in 12c-i-b2, so
  nothing open is still reading the field.
- **The organisation-keyed paths answer 410, not 404.** The two id
  sequences overlap for a small installation, so an organisation id
  would often name a real place: quietly doing the work under the old
  address is how a caller would go on believing the number means an
  organisation. The 410 names the place-keyed replacement instead. This
  is the same choice the retired sites and organisations addresses made.
- **The handlers behind them stayed, privately.** `_promote_bank_version`
  and `_update_bank_org_settings` still take an organisation id, because
  membership still counts in organisation ids; the place-keyed routes
  translate once and call them. 12c-ii is where that step goes.
- **Registration stops accepting `organisation_id`.** It is an optional
  request property, so removing it cannot break a caller that has
  stopped sending one — and both forms send `org_unit_id`.

#### 12c-i-c1 — stop writing the organisation column

Split from the drop, which follows as `12c-i-c2`. The migrations run as
a pre-deploy job, so dropping the column in the same deploy as the code
that stops writing it would pull the floor out from under the revision
still serving.

- **The unique rules are restated in place ids first.** Once
  `organisation_id` goes unwritten the constraints carrying it see a
  null on every new row and stop rejecting anything, because Postgres
  treats nulls as distinct. Both exist at once for one release, so
  uniqueness is never unenforced.
- **`module_media_link.organisation_id` is not one of them.** It is
  where the object sits in the bucket, not who owns the row: the signed
  cookie's prefix covers `{organisation_id}/{module}/{asset}`. It stays
  required, and a listener fills it from the place — moving it means
  moving objects and reissuing cookies.
- **The mirroring listener went with the writes.** Its job was to keep
  the pair in step; with one column written there is no pair. What
  replaced it is the narrower listener above, in teaching's own models
  rather than in `org_units`.
- **Two readers of the old column were still there**, and would have
  quietly found nothing: the passport's re-check lookup, and
  `validate-clinical-lead`, which asked `QuestionBankOrgStatus` which
  organisations offer a bank. Both now count in places.
- **`sync_question_bank`'s parameter was renamed to `place_id`.** It had
  held a place id under the name `organisation_id` since 12c-i-b, which
  is the confusion this whole step exists to remove.

#### 12c-i-c2 — drop the organisation column

Seven columns, their indexes, their foreign keys and four unique rules.

- **`module_media_link.organisation_id` stays**, and only its unique
  rule moves. It is the object's address in the bucket, not the row's
  owner, so dropping it would orphan every uploaded file. Moving it
  means moving objects and reissuing signed cookies, which is storage
  work and belongs in its own piece.
- **`org_unit_id` becomes required here, not earlier.** The revision
  serving alongside the previous migration still inserted rows without
  it.
- **`server_default=None` where those columns are tightened.** `check_migrations.py`
  asks every `nullable=False` to name a server default, to stop a NOT
  NULL column being added to a populated table. This is a tightening of
  a column backfilled two revisions ago, which the rule cannot express;
  `None` says truthfully that there is no default, where an actual
  default would be a nonsense value for a foreign key. Worth a look
  when the check is next touched.
- **The downgrade refills the column from the place** before restoring
  its unique rule, so a rollback finds the table as the revision before
  this one left it rather than empty.

#### 12c-i-d — one place column for the common competency shortlist

- **The check constraint goes with the pair.** `(site_id IS NULL) <>
  (organisation_id IS NULL)` existed to say "exactly one place", which
  one column says by existing. A trust-wide list is the organisation's
  own row in the tree; a ward's is the ward's.
- **One migration, not expand-contract.** Nothing reads or writes this
  table — the picker it feeds is unbuilt — so no serving revision
  depends on either column. The rows are still carried across, in case
  a deployment has any.
- **Alembic does not autodetect a dropped check constraint**, so that
  one is dropped by hand. Worth remembering: autogenerate would have
  left it in place, silently rejecting every row the new column allows.
- **The class is still `SiteCommonCompetency`.** Renaming it and its
  table is a separate move and not what this step is about.

#### 12c-ii-a — an organisation's place is required

Split out of 12c-ii, which was going to be one unit and is three: the
membership helpers alone have well over a hundred call sites.

`Organisation.org_unit_id` was nullable "only until the backfill has
given every organisation one", and that was two steps ago. Making it
required is what takes `int | None` out of everything downstream — the
assertions the test helpers were carrying purely to satisfy the type
checker go with it.

- **The foreign key becomes `CASCADE`.** `SET NULL` is what a nullable
  column allowed. Deleting the place an organisation *is* deletes the
  organisation, because there is nothing left for it to be.
- **The migration creates a place for any organisation still without
  one**, row by row, so the tightening cannot fail on live data. The
  mapper has made one for every organisation since the tree arrived, so
  this should find nothing; it is there because "should" is not a
  guarantee about somebody else's database.
- **`TestAnOrganisationOutsideTheTree` was deleted.** It set the column
  to null to check that such an organisation authorised nobody. That
  state cannot be written now, so the test could only have proved the
  database was refusing it.
- **The `before_insert` guard stays.** It reads a column typed as
  required, which is not a contradiction: before the insert the
  attribute is unset, and a caller that has chosen a place keeps it.

#### 12c-ii-b — the membership writers take a place

`add_organisation_member`, `remove_organisation_member` and
`remove_organisation_memberships` become `add_place_member`,
`remove_place_member` and `remove_place_memberships`, and stop
translating.

- **The translation was the only thing making them look
  organisation-shaped.** `org_unit_member` has always been keyed on a
  place; each of these took an organisation id and resolved it to that
  organisation's row before touching the table.
- **It was also a quiet failure.** Handed a ward id, the old writer
  looked for an organisation with that id: it found none and did
  nothing, or — where the two id sequences overlap, which they do on a
  small installation — found a different organisation and wrote the
  membership there. Two new tests pin the ward case.
- **`remove_place_memberships` still clears only organisations**, even
  when a ward is named. An admin editing which trusts somebody belongs
  to should not silently take them off a ward.
- **Three call sites in the application still hold organisation ids**
  and translate at the call. They stop needing to in 12c-ii-c, when the
  membership reads answer in places.

### Discovered while building: the users list excluded the wrong organisation

`GET /users?exclude_org=` powers "add a staff member" — everybody who is
not already here. The screen that asks holds a **place** id: its route is
keyed by one, and the membership it creates names one. The parameter read
that number as an **organisation** id.

The two id sequences agree on a small installation, because an
organisation and its own row in the tree are created together and come
out with the same number. They diverge the moment a ward is created
between two organisations, and from then on the filter excluded the
members of a different organisation, or of none, and the screen offered
somebody who was already a member.

There was no test of the parameter at all, which is how it survived.

#### 12c-ii-c — the users list excludes members of a place

- **`exclude_place` arrives beside `exclude_org`**, rather than
  `exclude_org` quietly starting to mean a place. Adding an optional
  query parameter is not a breaking change, and reinterpreting a number
  while keeping its name is the thing this plan refuses everywhere.
- **`exclude_org` keeps meaning an organisation id**, and a test says
  so. It goes when the organisations table does.
- **The tests state the failure both ways round**: a place id handed to
  `exclude_org` excludes nobody, and an organisation id handed to
  `exclude_place` excludes nobody. Either is somebody already a member
  being offered again.

#### 12c-ii-d — membership and reach answer in place ids

Folded back into one unit, because splitting membership from reach would
have left reach converting places back into organisation ids for a
release — more code than doing both at once, and none of it the shape
either function ends up.

- **`organisation_member` becomes `organisation_place_member`**, a
  narrowing of the membership table to rows naming an organisation's own
  place rather than a join through `organisations`. A ward membership is
  still not in it: that distinction is what every admin check rests on.
- **`organisation_places_of` replaces two hand-rolled copies.** The "which
  organisation is accountable here" walk lived inline in `/me` and in the
  feature gate, each spelling it differently. A place with no
  organisation above it contributes nothing rather than itself, which is
  what stops a member of a detached place — the test fixtures make one on
  purpose — having the run of somewhere nobody is accountable for.
- **Teaching's `_places_of` scaffold is gone**, as its docstring said it
  would be, and with it the translation in the bank settings and
  active-version handlers.
- **`_require_org_admin_over` returns a place**, so the passport's revoke
  route drops its lookup. `AssessorRevokeOut.place_id` now holds a place
  id whichever kind `place` says — it held the organisation's own id for
  `organisation`, which the name never said.
- **`RegistrationVerificationOut.organisation_id` became
  `org_unit_id`** — renamed, not reinterpreted, so it takes a decision
  file.
- **`/patients/{id}/shared-organisations` still answers organisation
  ids.** Nothing reads it, and changing what its `id` means is 12c-iii's
  to do along with the table.
- **A place that is not an organisation is now refused, not "not
  found".** Setting a bank live at one used to 404 because the
  translation failed; it is a 403 now, the same answer as naming
  somebody else's trust, which is what it is.

### Discovered while building: the media prefix was blocking the table's removal

Everything else the organisations table answered is a property of a
place — its name, its type, that it is a root. One thing was not: media
lives at `{prefix}/{module}/{asset}` in a bucket, the signed cookie
covers exactly that path, and the prefix is the organisation's own id.

That number cannot simply become the place id. Every object already in
the bucket is under the old one, and one module at one place has to have
a single prefix — a second number would need a second cookie, and
nothing issues one. So "drop the table" was, without noticing, "move
every video and reissue every cookie".

#### 12c-iii-a — a place remembers the prefix its media is filed under

- **`org_unit.media_prefix_id` records the number**, backfilled from
  `organisations.id`. Nothing in the bucket moves, and the table becomes
  droppable.
- **Null means "my own id"**, so a place created afterwards needs no
  value, and the column is left null where the two numbers already agree
  — which is the common case on a small installation. A stored number
  repeating the id is one more thing that can drift from it.
- **Read through `media_prefix_of`**, never directly, so the fallback is
  in one place. The media-link listener reads it too, which is what
  makes a new upload land where the cookie will look.
- **A place that does not exist has no prefix**, rather than a number.
  Otherwise a caller could sign a cookie for a path nothing is filed
  under.

#### 12c-iii-b — the place surfaces stop translating organisation ids

Split out so the drop itself is small. Nothing here removes the table;
it removes every remaining reason to consult it.

- **What makes a place an organisation is its *type*.** The kinds that
  need no parent are exactly the kinds a tree starts with, and
  `organisation_place_ids()` is that test in one place. Not "has no
  parent", which a detached ward also satisfies — the fixtures make one
  on purpose, and reading it as an organisation would give its members
  the run of somewhere nobody is accountable for.
- **`cbac/scoped.py`'s two keyword arguments became one.** They were
  kept apart because an organisation was a row in another table; an
  organisation is a place, so `organisation_id=` and `site_id=` collapse
  into `place_id=` and there is no branch left for a caller to get
  wrong. The 10c notes said this was where they would go.
- **A post with no place now fails closed** rather than raising. The
  column is nullable, so the state is representable, and a post nobody
  can fill is safer than one anybody can. The old code reached the
  resolver's "name exactly one place" error.
- **Registration checks the site sits under the place it was given**,
  rather than under the organisation that place stands for. Same
  question, one fewer id space.
- **Three tree helpers went**: `root_ids_of_organisations`,
  `site_ids_of_organisations` and `organisation_ids_of_sites`. The
  callers either had the place already or wanted `descendant_ids`.

### Discovered while building: the user listing joined two id spaces

`GET /users` carries each person's organisations by name, for the admin
table. When the membership reads moved to place ids in 12c-ii-d, the
join under those names was left comparing an **organisation** id against
a **place** id.

It matches on a small installation, because an organisation and its own
row in the tree are created together and come out with the same number,
and stops matching the moment a ward is created between two
organisations. From then on an admin sees a user with no organisations
at all, or with somebody else's.

Nothing tested the names, which is how it got through the unit that
introduced it and the two after.

#### 12c-iii-c — the user listing names the right place

- **The join reads `OrgUnit` now**, which is what the membership row
  holds.
- **Three tests**, checked to fail against the broken join: a member's
  organisation is named, somebody in none gets an empty list — which
  the broken join also produced, so it is the half that pins the
  failure — and a ward membership shows as a site rather than an
  organisation.

#### 12c-iii-d — drop the `organisations` table

The last step. An organisation is a place at the top of a tree, and
there is one table of places.

- **The model and its three listeners go.** Two of them existed to
  create the paired row and keep its name and type in step; with one row
  there is nothing to keep in step. The third took everything hanging
  off the place away when the organisation was deleted, and moves onto
  `OrgUnit` as a `before_delete` — it already did its work through the
  place, so it is asked of the row that actually holds the rest.
- **`module_media_link.organisation_id` keeps its value and loses its
  foreign key.** It is an address, and an address is not a reference:
  the number stays valid whether or not anything else still knows it.
- **Three API changes, renamed rather than reinterpreted.**
  `OrganisationListItem.id` and `SharedOrganisationSummary.id` become
  `org_unit_id`; `exclude_org` goes, since it counted in ids that no
  longer exist. Neither response field is read by any screen. Three
  decision files.
- **The fixture rewrite was scripted, and the exceptions were read.**
  `Organisation(...)` becomes `OrgUnit(...)` with the type mapped the
  way `_kind_of` mapped it — a root type kept, anything else becoming
  `organisation`, a missing one becoming `hospital_team` — and
  `X.org_unit_id` becomes `X.id` for the names that hold an
  organisation, never for `c.org_unit_id`, `row.org_unit_id` or a
  model's own column.
- **Applied blindly that rewrite is not meaning-preserving**, which is
  why it was tried once and backed out. The tests whose subject is the
  two id spaces assert that two numbers differ, and the script turns
  those into `x != x` — some fail loudly, and some pass while testing
  nothing. Those were handled by hand:
  - `TestTheTwoIdSequencesStayApart` and the matching test in
    `test_teaching_rows_name_their_place` are **deleted**, with the
    reason recorded where they stood. There is one sequence, so there is
    nothing left to guard.
  - `TestTheTranslation` goes with `place_of_organisation` and
    `organisation_of_place`: nothing left to translate.
  - `TestExcludingByOrganisation` goes with `exclude_org`.
  - `test_the_media_prefix_survives_the_table` keeps its subject by
    recording a prefix that is deliberately nothing like the place's own
    id, rather than leaning on the two id spaces to supply the
    difference. That is the better test either way.
  - `TestAnOrganisationCreatedAsAPlace` and
    `TestEveryOrganisationIsInTheTree` asked whether the paired row was
    made and kept in step. They now ask what those rows existed to
    answer: a root type with no parent is an organisation, a detached
    ward is not.
  - `Organisation.features` was a read-only relationship nothing but one
    test read. It went with the model, and the test reads the rows.
- **The conftest spacer stays, renamed.** It was there to keep the two
  id sequences apart; that is moot now, but a ward with no parent is
  still the only "place that is not an organisation" the fixtures have,
  and several tests point at it. `DETACHED_PLACE_NAME` says what it is.
- **`app/organisations.py` survives**, despite the name. It is the
  access-helpers module — membership and reach — not the API surface
  step 10 meant, which was retired in 12b-vii.

10. [x] **Rename the table and model** to `org_unit` and `OrgUnit`, renaming the
    membership, features, patient membership, conversation and link tables to
    match, and delete the old organisations module.

11. [x] **Add the new API surface** alongside the old one, migrate the frontend
    onto it, and rename the frontend type. Close the thin-pages gap in the
    same pass.

12. [x] **Retire both old API surfaces** once nothing reads them, then refuse to
    delete a parent that still has children and enforce each type's
    `requires_parent` flag.
    Last, so the earlier steps are not blocked by it.

13. [ ] **Say `org_unit` where the code says `place`.** The table, the model
    and the API path already read `org_unit`; only the word used to talk
    about a row says `place`, which reads as geography for something that
    is governance. Done at the end, when the stack has settled, because it
    touches a hundred identifiers and would collide with everything above
    it.

#### 12d-i — `org_unit_ids` beside `place_ids`, and the internals renamed

`OrgUnit` is a governance unit, not a location: what a row is comes from
its type and never from its position, accountability is found by walking
to the root, and a relationship that is not ownership is a typed link. The
vocabulary has not kept up. The table is `org_unit`, the path is
`/api/org-units`, and the model class is `OrgUnit` — but a row is called a
place, so the users API answers in `place_ids`.

That reads as *where somebody is*. It means *which governance units they
belong to*, and some of those are `virtual` with no location at all. It is
the same class of error the fold exists to remove: a number whose meaning
depends on which table the reader had in mind.

- **The API expands first.** `org_unit_ids` is added beside `place_ids`,
  both answering the same list, and a write may use one or the other but
  never both — the rule `place_ids` already applies to the two fields it
  replaced. Additive, so `oasdiff` reports no breaking change.
- **The internals rename outright**, because nothing outside the
  repository reads them and a local name cannot be half-renamed. About a
  hundred identifiers: `place_id`, `place_ids`, `add_place_member`,
  `places_administered_by`, and the rest, across `backend/app`,
  `backend/tests` and `frontend/src`.
- **`OrgUnit`'s docstring is corrected.** It still opens "Physical or
  virtual location within the healthcare system" and still calls a row a
  Site throughout its attributes, which is the contradiction that started
  this.

##### Split into five, because one unit is four hundred and fifty changes

The plan counted identifiers; the code has call sites. `place_id` and
`place_ids` alone appear over two hundred times, and the whole rename is
453 occurrences across `backend/app`, `backend/tests` and `frontend/src`.
That is far past what a reviewer can hold in their head, so it lands as
five units along the seams the names themselves make:

- **12d-i-a** the three membership writers, `add_place_member` and the two
  removers, 159 occurrences.
- **12d-i-b** the reader helpers: `get_member_place_ids`,
  `get_reachable_place_ids`, `get_place_member_ids`, `get_place_staff_ids`,
  `organisation_place_ids` and `organisation_places_of`.
- **12d-i-c** `organisation_place_member`, the subquery alias. It is a
  Python name and not a table, so no migration follows it.
- **12d-i-d** the locals and parameters: `place_id`, `place_ids`,
  `user_place_ids`, `placeIds`.
- **12d-i-e** the API expand, which is the only part a caller outside this
  repository can see, and the only part carrying decision files.

`exclude_place` is a query parameter rather than an internal name, so it
belongs with the API step and not with the locals.

#### 12d-i-f — the frontend sends and reads `org_unit_ids`

The step between the expand and the contract, which the plan first
missed. `UserInfoUpdatePage` both sends `place_ids` and reads it back, so
retiring the field server-side would break the page however long the wait
between deploys. The page moves to `org_unit_ids` while both names still
work, which is the "switch reads" deploy the backend rules describe.

It reads `org_unit_ids` with `place_ids` as a fallback, so the page is
correct against a server from either side of the expand. The fallback goes
with `place_ids` itself in 12d-ii.

#### 12d-ii — retire `place_ids`

The contract half, a release after 12d-i. `place_ids` goes from the
schema and the write path, leaving `org_unit_ids` as the only answer.
Breaking, so it carries decision files and the `api-breaking-change-review`
gate.

**Left alone deliberately.** The `type` values still read as geography —
`hospital`, `building`, `ward`, `room`. Whether a governance tree should
name its levels that way is a question about the model rather than about
naming, and changing them is a data migration. It is not part of this
step.

#### 12d-iii — say `org_unit` everywhere `place` still stands in for it

12d-i renamed the API surface and the helpers it touched. It did not
reach the rest, so the word survives inside the code: roughly 770 uses
in `backend/` and 240 in `frontend/src`, in local variables, parameters,
helper names, docstrings and comments. A reader now meets `place` and
`org_unit` describing one thing, with nothing saying which is current.

Rename every one of those where the thing meant is an `org_unit` or its
id. Where `place` means an ordinary English place — a comment about
somewhere a person is, a string a clinician reads — leave it, and the
judgement of which is which is the work.

**No migration follows.** The tables and columns were renamed in
12c-iii-d and 12d-i, so nothing in the database still carries the name.

**Two fields are wire-visible** and go first, behind their own
decision files and the `api-breaking-change-review` gate:
`AssessorInviteAcceptOut.place_id` and `AssessorRevokeOut.place_id` in
`schemas/passport.py`, with the matching fields in
`frontend/src/lib/passport/types.ts`. They were held back from 12d-i-d
for exactly this reason, and they retire the same way `place_ids` did:
expand, a release, then contract.

**Split it by seam, not by file.** 12d-i split one unit of 450
occurrences into five because one reviewer cannot hold more than that at
once, and this is twice the size again. The seams that worked there were
the writers, the readers, the subquery, the locals, then the API.

The count is lower than it first looked. A plain search for "place" also
matches `replace`, `placeholder`, `placement` and `placed`, which are
nothing to do with the tree. The real figure is roughly 840 in `backend/`
and 240 in `frontend/src`, and most of it is prose rather than code.

The seams here, in order:

- **12d-iii-a** the nine helper functions, done.
- **12d-iii-b** the locals and parameters: `user_place_ids`,
  `conv_place_ids`, `organisation_place_id`, `member_places` and the
  rest. Internal, so no gate.
- **12d-iii-c** the wire surface, which carries decision files and the
  `api-breaking-change-review` gate: `exclude_place`, a query parameter
  the add-staff screen sends; `place_id` on the two passport response
  schemas; and the two teaching routes whose paths hold `/places/`.
- **12d-iii-d** the docstrings and comments, which is the bulk of it and
  the part needing judgement rather than a regex.

**Three names stay as they are.** `uq_teaching_org_settings_place`,
`uq_site_common_competency_place` and
`ck_practising_competency_place_required` are database constraints named
in migrations that have already merged. A merged migration's code is
frozen, so renaming one means a new migration rather than an edit, and
that is a change to the database rather than to a name in the code.

**The `type` values stay out of it**, for the reason above: that is a
question about the model and a data migration, not a rename.

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
