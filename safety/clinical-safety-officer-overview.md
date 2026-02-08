# Clinical Safety Officer overview

## Purpose of this document

This document provides the clinical and regulatory context that any LLM or analyst needs in order to perform meaningful clinical safety analysis on this codebase. It is not a tutorial on software engineering — it is a tutorial on thinking like a clinician who happens to understand software.

---

## What is a Clinical Safety Officer?

A Clinical Safety Officer (CSO) is a senior clinician who is personally accountable for ensuring that a health IT system does not cause patient harm. The role is mandated by NHS England standard DCB 0129 for any manufacturer placing a health IT system into the NHS.

The CSO must hold current clinical registration (GMC, NMC, GPhC, or HCPC) and must have completed training in clinical risk management. They are not an advisory role — they have authority to block a release if they judge the clinical risk to be unacceptable.

The CSO's core question is not "does this code work correctly?" but rather **"could this code contribute to a patient being harmed?"**

These are fundamentally different questions. Code can work exactly as designed and still cause harm. Code can have a bug that has zero clinical safety implications. The CSO's job is to distinguish between the two.

---

## The cause → effect → hazard → harm chain

DCB 0129 uses a precise vocabulary. Every clinical safety concern follows a chain:

**Cause**: A system behaviour or failure. This is technical. Example: "The FHIR Patient endpoint returns a 500 error that the frontend does not handle."

**Effect**: The change to the intended clinical workflow. This is what the clinician experiences. Example: "The patient demographics panel displays no data. The clinician sees an empty screen where the patient's name, NHS number, and date of birth should appear."

**Hazard**: The potential for harm. This exists whether or not anyone is actually harmed. Example: "A clinician may proceed to make clinical decisions without confirming they are viewing the correct patient's record."

**Harm**: An actual adverse outcome for a patient. Example: "A clinician prescribes penicillin to a patient with a documented penicillin allergy, because the allergy list — which belongs to a different patient — appeared empty due to the failed demographics load causing a misidentified record."

When analysing code, always trace the full chain. A software bug is only a clinical safety hazard if you can articulate a plausible path from the bug to patient harm.

---

## How clinicians actually use Election Patient Record (EPR) systems

Understanding real clinical workflow is essential. Without this understanding, hazard analysis produces either trivial findings ("this button could be confusing") or misses critical ones ("the allergy banner doesn't render when the FHIR call is slow").

### The clinical environment is chaotic

A hospital ward is not a quiet office. A doctor on a medical ward might:

- Be responsible for 30 patients across multiple bays
- Be interrupted every few minutes by bleeps, phone calls, nursing queries, relatives asking questions, and emergency calls
- Switch between patient records dozens of times per shift
- Be called away from a workstation mid-task (mid-sentence in a clinical note, mid-way through a prescription) and return minutes or hours later
- Work a 12-hour shift, making critical decisions at hour 11 with the same cognitive demands as hour 1
- Be a junior doctor (Foundation Year 1 — weeks into their career) or a consultant with 20 years' experience, using the same system

**Implication for hazard analysis**: Any design that relies on the user being attentive, unhurried, or completing a multi-step task without interruption is a hazard source. The system must be safe for a tired, distracted, interrupted user — not just for a careful, focused one.

### Clinicians trust what the screen shows them

This is the single most important principle for EPR safety analysis.

A clinician looking at a patient record does not think "I wonder if this data loaded correctly." They think "this is the patient's data." Specifically:

- If the screen says **"No known allergies"**, they will prescribe drugs that would be contraindicated if an allergy existed. They will not consider the possibility that the allergy data failed to load.
- If a **lab result is displayed**, they assume it belongs to the patient whose record they believe they have open. They will not cross-check the patient identifier on the lab result against the patient banner.
- If a **field is empty**, they interpret it as "this has not been recorded" — not "the system failed to retrieve this data." An empty medication list means "patient is on no medications," not "the medication query timed out."
- If an **observation value is shown** (blood pressure, heart rate, oxygen saturation), they assume it is the most recent value. They will not notice if the display is showing a value from three days ago because the latest reading failed to sync.

**Implication for hazard analysis**: Anywhere the system displays clinical data, ask: "What does the clinician _believe_ they are seeing, and is that belief always correct?" If there is any scenario where the display could mislead — even if the underlying data is technically correct — that is a hazard.

### Shared workstations are the norm

NHS hospitals use shared computers. A typical pattern:

- Doctor A logs in to check Patient X's blood results on a ward computer
- Doctor A is called away urgently
- Doctor A does not log out (they expect to return in two minutes)
- Doctor A does not return for 30 minutes
- Nurse B walks up to the same computer, sees a patient record on screen
- Nurse B may or may not notice it is Doctor A's session
- Nurse B may or may not notice the patient displayed is not the one they intend to work with

**Implication for hazard analysis**: Session management, timeouts, and patient context persistence are clinical safety issues, not just security issues. A stale session showing Patient X's record to a clinician who thinks they're looking at Patient Y is a direct path to wrong-patient harm.

### Clinicians work across multiple systems simultaneously

An EPR is rarely the only system a clinician uses. In a typical NHS trust, a clinician might have open simultaneously:

- The EPR (patient records)
- A PACS system (medical imaging)
- A pathology results system
- An electronic prescribing system
- Email or a clinical messaging system
- A handover document

They alt-tab between these constantly. Clinicians may even have multiple patient records open in different windows/tabs.

**Implication for hazard analysis**: The system must be resilient to tab switching, window focus changes, and long periods of inactivity followed by sudden interaction. Patient context must be unambiguous on every screen.

### Alert fatigue is real and dangerous

If a system shows too many warnings, clinicians stop reading them. This is not a character flaw — it is a well-documented cognitive response to information overload. Research consistently shows:

- Override rates for clinical alerts exceed 90% in many systems
- Clinicians develop "click-through" behaviour where they dismiss alerts without reading them
- Genuine critical alerts (e.g. life-threatening drug interaction) are missed because they look identical to trivial ones

**Implication for hazard analysis**: Every alert, warning, banner, modal, and notification in the system is a potential contributor to alert fatigue. A system that cries wolf about minor issues will eventually be ignored when it warns about a fatal one. Alert design is a clinical safety issue.

---

## What makes EPR hazards different from software bugs

Not every bug is a clinical safety hazard. Not every clinical safety hazard is a bug.

### Bugs that ARE clinical safety hazards

- A race condition that occasionally displays Lab Patient A's results on Patient B's record
- An API error handler that silently swallows a 404 and renders an empty allergy list (instead of an error state)
- A caching layer that serves stale medication data after a pharmacist has updated the prescription
- A form that submits successfully but silently drops a field (e.g. the dose unit on a prescription)

### Bugs that are NOT clinical safety hazards

- A CSS issue that makes a button slightly misaligned on mobile
- A memory leak that causes the page to slow down after 4 hours (annoying, but the user will refresh)
- A typo in a tooltip on the admin settings page
- An incorrect date format in the build log

### Things that are NOT bugs but ARE clinical safety hazards

- A design that puts the patient's name in small grey text at the top of a busy screen (technically correct, but in practice clinicians won't check it)
- A workflow that requires 6 clicks to view a patient's allergy list (no bug, but it means clinicians won't check allergies in a hurry)
- A system that works perfectly online but shows no indication when it's serving offline-cached data (no bug — it's working as designed — but the clinician doesn't know they're seeing stale data)
- A patient list sorted by bed number where two patients with similar names are in adjacent beds (the sorting is correct, but the proximity increases wrong-patient risk)

### The test

For any code / process under analysis, ask:

1. **Can this code / process contribute to a clinician receiving wrong information?** (wrong patient, wrong value, wrong date, missing data presented as "none")
2. **Can this code / process contribute to a clinician's action being applied to the wrong patient?** (wrong context, stale session, form submission to wrong record)
3. **Can this code / process contribute to clinical information being lost, delayed, or corrupted?** (silent failures, data loss on save, sync conflicts, dropped messages)
4. **Can this code / process contribute to unauthorised access to clinical information?** (session persistence, RBAC gaps, data in logs/URLs)
5. **Can this code / process contribute to a clinician being unable to deliver care?** (system unavailability, degraded performance, broken workflows)

If the answer to any of these is "yes, plausibly", it is a clinical safety hazard regardless of whether the code contains a bug.

---

## Severity of harm — the clinical perspective

When identifying hazards (not scoring them — that is the CSO's job), it helps to understand the clinical severity spectrum:

**Catastrophic**: Multiple deaths or permanent life-changing injuries. Example: A systematic error that causes every patient in a ward to receive the wrong medication for 24 hours.

**Major**: A single death, or a single permanent life-changing injury. Example: A patient with a known anaphylaxis to penicillin is prescribed amoxicillin because the allergy record was not displayed.

**Considerable**: A single severe injury with expected recovery, or significant psychological trauma to multiple people. Example: A patient receives an incorrect drug dose requiring ICU admission but makes a full recovery.

**Significant**: A minor injury with long-term effects to one person, or minor injury to multiple people. Example: A delayed diagnosis because investigation results were not flagged, leading to a longer hospital stay.

**Minor**: Minor injury with short-term recovery, minor psychological upset, or inconvenience. Example: A patient's appointment is delayed because the referral letter was sent to the wrong clinic.

When identifying hazards, you as the LLM, do not need to score them. But understanding this spectrum helps you recognise which hazards are worth logging — if the plausible worst case is "minor inconvenience", it may not warrant a formal hazard log entry. If the plausible worst case includes death, it always does.

---

## Common EPR hazard patterns

These patterns recur across EPR systems and should be actively looked for:

### The silent failure

The system encounters an error but presents no indication to the user. The screen looks normal. The clinician proceeds on the assumption that everything loaded correctly.

Look for: API calls without error handling, empty states that look identical to "no data" states, catch blocks that swallow errors, fallback values that mask failures.

### The wrong patient context

The system displays or accepts data in a context where the patient identity is ambiguous, stale, or incorrect.

Look for: Patient context passed via URL parameters, patient state that persists across navigation, components that render before patient context is confirmed, forms that submit without re-validating patient context.

### The stale data

The system displays data that was accurate at some point but is no longer current, without indicating its age.

Look for: Cached responses without cache-busting, service worker caching of clinical data, optimistic UI updates that don't confirm server state, local state that isn't refreshed on focus/navigation.

### The missing data masquerading as absent data

The system shows an empty list or blank field that the clinician interprets as "this patient has none" when in reality "the system failed to retrieve this."

Look for: Empty arrays as default values, null-safe rendering that treats undefined and empty-array identically, loading states that resolve to empty rather than error on timeout.

### The interruptible multi-step operation

A clinical workflow that requires multiple steps (e.g. select patient → enter data → confirm → submit) where interruption between steps can leave the system in an inconsistent state.

Look for: Multi-page forms without draft saving, patient context that can change between steps, submission handlers that don't re-validate preconditions.

### The copy-paste propagation

Clinical data is copied from one part of the record to another, propagating any error in the source to all destinations.

Look for: Auto-population of fields from previous entries, templates that pre-fill with previous values, clinical note copying functionality.

---

## Thinking Like a clinician — a checklist

When reviewing any code that handles clinical data, work through this mentally:

1. **Who is the patient?** Is the patient identity unambiguous on this screen? Could the user possibly be looking at the wrong patient's data? Could the patient context have changed since this component mounted?
2. **Is this data complete?** If data is missing, does the user know it's missing? Or does the screen look like "no data exists" rather than "data failed to load"? Is there a loading state? An error state?
3. **Is this data current?** Could this be stale cached data? Is there a timestamp? Could the data have changed since it was fetched? Is the user aware of when this data was last refreshed?
4. **Is this data correct?** Could a data transformation, mapping, or display logic cause the value shown to differ from the value stored? Are units displayed? Are dates unambiguous?
5. **What happens if the user is interrupted?** If they walk away mid-task and return 10 minutes later, is the screen still showing valid, current, correct data for the right patient? If someone else sits down, what do they see?
6. **What happens if the network fails?** Right now, mid-operation. Does the user know? Is data lost? Is a partial write possible?
7. **What happens if this is used by the wrong person?** Not maliciously — just a nurse accessing a screen designed for doctors, or a medical student who doesn't understand the clinical significance of what they're changing.
8. **What does the audit trail show?** If something goes wrong, can we trace what happened, who did it, and when? Or does the system silently overwrite without recording the change?

---

## What good hazard analysis looks like

Good hazard analysis is:

- **Specific**: "The PatientBanner component renders patient.name from context without checking whether context has been refreshed since the last route change" — not "there might be patient identity issues."
- **Traces the full chain**: cause → effect → hazard → harm, every time.
- **Clinically grounded**: The harm description reflects real clinical scenarios, not abstract possibilities. "A clinician prescribes a contraindicated drug because the allergy list appeared empty" — not "incorrect data could be displayed."
- **Over-inclusive rather than under-inclusive**: It is far cheaper to review and dismiss a false positive than to miss a real hazard. When in doubt, log it.
- **Honest about controls**: If existing controls mitigate the hazard, say so. If there are no controls, say "None identified" — do not invent ones that don't exist.
- **Honest about uncertainty**: If you're not sure whether something is a hazard, say "Uncertain — recommend CSO review." Do not silently omit it.

---

## References

- **DCB 0129**: Clinical Risk Management: its Application in the Manufacture of Health IT Systems
- **DCB 0160**: Clinical Risk Management: its Application in the Deployment and Use of Health IT Systems
- **NHS England**: Digital Clinical Safety Strategy
- **ISO 14971**: Medical devices — Application of risk management to medical devices
- **HSSIB**: Healthcare Safety Investigation Branch EPR thematic review
