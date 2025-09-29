# gitEHR specs

I am just listing here what I personally feel gitEHR needs:

- git for each file change
- only a main branch, no others allowed
- Signed commits (all??)
- Encryption (but who holds the keys??)
- Commit lint to stop bad file and folder names (eg missing dates, wrong date formats, etc)
- How do we limit access control to some, not to others, cross over, and patient can see everything? Is this encryption? IS it not?
- Any Git-based system has to build friendly wrappers for legal and clinical audiences
- Do not allow changing or deleting of previous commits, only adding new commits for changes that are needed.

## Git needs the below on top of it to make it medicine ready:

- a clinical model (openEHR, FHIR, or your own schema),
- security/encryption/consent controls,
- and a clinician-friendly interface that hides Git but benefits from its strengths.
