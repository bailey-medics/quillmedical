# Development Integration

Embedding clinical safety into the software development lifecycle — not bolting it on before procurement.

---

## Principle

Clinical risk management activities must start at the earliest stage of development and continue throughout the entire product lifecycle. The goal is to make clinical safety a natural part of how Quill Medical is built, not a separate compliance exercise.

---

## Per-Feature Hazard Review

When planning a new feature or modifying an existing one, include a brief hazard identification step:

1. **Before development**: Ask "What are the clinical safety implications of this feature?" Consider the hazard categories in [EPR-Specific Hazards](./epr-hazards.md).
2. **During development**: If new hazards emerge or existing assumptions change, update the Hazard Log.
3. **Before merge/release**: Confirm that any identified hazards have been assessed and mitigations implemented or documented.

This does not need to be heavyweight. For a low-risk UI tweak, a brief mental check may suffice. For a new clinical data entry form, a more thorough assessment is warranted.

---

## Ticket-Level Safety Assessment

The CSO should review bug and feature tickets for clinical safety impact. In practice:

- Include a **clinical safety field** or label on tickets (e.g. `clinical-safety: none | low | medium | high | requires-assessment`)
- High-impact tickets should be flagged for formal hazard assessment before work begins
- Bug tickets involving clinical data display, data integrity, access control, or patient identification should always be assessed for safety implications
- Ticket priority should incorporate clinical safety impact alongside business priority

---

## Release-Gated Safety Sign-Off

Each deployment to a production environment must be approved by the CSO. This includes confirming:

- All clinical safety-relevant changes in the release have been assessed
- Testing controls are in place (including clinical test scenarios where appropriate)
- The Hazard Log has been updated to reflect any new or modified hazards
- No Unacceptable risks remain open

This sign-off can be lightweight for minor releases (a checklist confirmation) and more thorough for major releases (formal CSCR update).

---

## Periodic Full Hazard Review

At least annually, conduct a formal multidisciplinary hazard workshop to:

- Identify new hazards that may have emerged since the last review
- Re-evaluate existing hazards in light of product changes, user feedback, and incidents
- Review the effectiveness of existing controls and mitigations
- Update the Hazard Log and CSCR

---

## Safety-Relevant Design Decisions

Document design decisions that are safety-relevant. These feed into the Clinical Safety Case and provide evidence of safety-by-design thinking. Examples:

- "UUIDs chosen as internal patient identifiers instead of sequential IDs to prevent enumeration and reduce misidentification risk"
- "Soft-delete implemented with full audit trail to prevent accidental data loss while maintaining data integrity"
- "Patient banner displayed on all clinical screens with NHS Number, name, DOB, and gender to support identity verification"
- "Role-based access control with six defined roles to enforce principle of least privilege"

---

## Post-Deployment Monitoring

Once Quill Medical is live in any clinical environment:

### Incident Management

- Maintain a **clinical safety incident log** — any safety events reported by users must be captured, graded, and managed
- Grade incidents using the same severity/likelihood matrix as the Hazard Log
- Update the Hazard Log to reflect new incidents (new hazards or re-scored existing hazards)
- Where an incident is deemed significant, notify deploying organisations — they may need to implement local controls

### User Feedback

- Provide a clear channel for clinicians to report safety concerns (distinct from general bug reports)
- Review all user feedback for potential safety signals

### Review Cycles

- The Hazard Log and CSCR must be reviewed at least annually
- Any significant change (feature, configuration, integration, or scope expansion) triggers a review

### Change Management

- Software updates, configuration changes, and scope expansions must go through the clinical risk management process
- Where an update increases residual risk to Undesirable or above, additional authorisation from Top Management is required before deployment

---

## Testing and Clinical Safety

Clinical test scenarios should be developed alongside functional tests. These are scenarios that reflect realistic patient conditions and clinical workflows, designed to detect safety hazards in the system. Examples:

- A patient with a documented penicillin allergy — is this visible when a prescription workflow begins?
- Two patients with similar names — can the clinician reliably distinguish between them?
- A clinician opens a patient record, is interrupted, returns — is the correct patient still in context?
- Network connectivity drops during data entry — what happens to unsaved data?
- A clinician accesses the system on a shared device — does the previous session's patient context persist?

These test scenarios should be maintained alongside the Hazard Log and updated as new hazards are identified.
