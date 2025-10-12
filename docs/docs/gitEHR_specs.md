# gitEHR specs

## Git needs the below on top of it to make it medicine ready

- A clinical model (openEHR, FHIR, or your own schema),
- Security/encryption/consent controls,
- And a clinician-friendly interface that hides Git but benefits from its strengths.

## I think me need to define a high level spec for GitEHR-openEHR. This might include:

- only one branch (main) - as we only want a single source of truth
- How ever we parse the patient record in gitEHR, it should be naturally be readable by openEHR's server eg AQL
- Any changes to content is stored in git, rather than new files
- Needs a GitEHR linter to stop bad file and folder name commits
- No previous commits can be deleted or changed. Any updates to files must be through new commits.

## Questions left to answer

- How do we remove information entered in error, eg like for the wrong patient? Perhaps crypto over the wrong information, so patient cannot see this, but DPO (or similar) can see it.
- Do we sign commit for every commit / file change?
- How do we encrypt the data? How do we allow only some people to see some data, but not others?
- How do we allow the patient to see everything?
- How do we manage access control to some, not to others, cross over, and patient can see everything? Is this encryption? IS it not?
- Who holds the encryption keys?
- How do we manage large files (eg images, scans, etc)? Git LFS?
- How do we manage performance with large repos (eg 1000s of patients, each with 1000s of commits)?
- How do we manage backups and disaster recovery?
- Any Git-based system has to build friendly wrappers for legal and clinical audiences. What does this look like?
- Do we need file based or database indexing to make things fast?
- Indexing? Tail commits?

## Need to likely build

- The GitEHR CLI
- The GitEHR Linter
- GitEHR GUI
- The GitEHR Dockerised openEHR server

## File structure

```text
.gitehr/
  templates/
    Quill.ClinicLetter.v1.opt
    Quill.Message.v1.opt
patients/nhs:9876543210/
  letters/
    L7F23B1.composition.json
    L7F23B1.md              (optional)
  messages/
    threads/T6Q9YHG/
      2025-09-29T18-20-00Z_msg_912aa0.composition.json
      events/
        2025-09-29T19-05-22Z_delivered_msg_912aa0.json
  blobs/sha256/…
indexes/ (derived)
docs/aql-contracts.md
```

## openEHR architecture overview

```text
Frontend UI (forms & viewers)
↓
(Form is generated from a TEMPLATE; user fills it)
REST API (business endpoints)
↓
API server logic
• Builds a COMPOSITION instance from the form data
• Validates the COMPOSITION against the TEMPLATE (which constrains ARCHETYPES)
• Adds audit/lifecycle state (draft/final/amended)
• Optionally runs AQL to fetch related data for the UI
↓
AQL queries
• AQL paths reference ARCHETYPE nodes (ids like openEHR-EHR-OBSERVATION.blood_pressure.v1)
• Queries can be scoped by TEMPLATE ids (e.g., Quill.ClinicLetter.v1)
↓
openEHR CDR (database)
• Stores VERSIONED COMPOSITIONs (immutable history)
• Knows the Reference Model; may cache/know about TEMPLATES for validation & querying
```

## GitEHR architecture overview

```text
Frontend UI
   ↓
REST API (business endpoints)
   ↓
API server logic
   • validates against Templates
   • creates/reads COMPOSITION JSONs
   • enforces access
   ↓
GitEHR (filesystem + Git repo with compositions)
   • stores Compositions as files
   • Git history = VERSION chain
   • Templates stored alongside

   OPTIONAL

      ↓ (mirror selected commits)
Internal openEHR CDR
   • used only for AQL queries, research, analytics
```

## Mental model

- openEHR CDR = a database that happens to version clinical documents.
- GitEHR = a Git repo that versions clinical documents.
- They serve the same conceptual slot, just with different trade-offs.
