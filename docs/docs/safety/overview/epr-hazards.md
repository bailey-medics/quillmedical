# EPR-Specific Hazards

This document catalogues hazard categories specific to an Electronic Patient Record system. It serves as a starting framework for Quill Medical's Hazard Log — not a substitute for formal hazard identification workshops.

These categories are informed by HSSIB investigations, NHS incident reports, published literature on EHR safety, and the DCB 0129 specification.

---

## 1. Patient Identification

| Hazard | Potential Clinical Impact | Example Causes |
|--------|--------------------------|----------------|
| Wrong patient record opened or displayed | Clinical decisions based on wrong patient's data — wrong treatment, missed allergies, wrong diagnosis | Similar names, failure to verify demographics, session state errors, cached data, browser back-button |
| Patient records merged incorrectly | Permanent data corruption — one patient receives another's medical history | Duplicate detection failures, manual merge errors |
| Patient not found / duplicate created | Fragmented records — clinician sees incomplete picture | Poor search UX, PDS integration failures, data quality issues |
| Patient identity not confirmed before action | Data entered or viewed for wrong patient | No identity banner, insufficient verification prompts |

**Quill Medical controls**: UUID-based internal identifiers (not NHS Number for primary key), FHIR PDS integration for demographics, patient banner with identity confirmation.

---

## 2. Data Display and Presentation

| Hazard | Potential Clinical Impact | Example Causes |
|--------|--------------------------|----------------|
| Clinical data displayed against wrong patient | Treatment decisions on wrong data | Session management bugs, race conditions, caching, concurrent tab usage |
| Data displayed in wrong order | Clinician acts on outdated information | Sort order bugs, timezone issues, inconsistent date formatting |
| Clinically significant data not visible | Missed critical information (allergy, key diagnosis, critical result) | Responsive layout issues, information overload, poor visual hierarchy, scroll/pagination hiding data |
| Data displayed without context | Clinical decisions based on stale or ambiguous data | Lab result without date/time, observation without units, truncated values |
| Allergy or alert not prominently displayed | Medication prescribed to allergic patient; known risk not communicated | Alert display failures, poor visual prominence, alert fatigue |

**Quill Medical controls**: Consistent patient banner on all clinical screens, responsive design testing, clear date/time display conventions, allergy/alert prominence in UI hierarchy.

---

## 3. Data Entry and Recording

| Hazard | Potential Clinical Impact | Example Causes |
|--------|--------------------------|----------------|
| Data entered against wrong patient | Record contamination — may affect ongoing care of both patients | No identity confirmation on entry screens, auto-complete errors, tab-switching |
| Free-text entry not coded or structured | Downstream systems cannot use the data (e.g. free-text allergy does not trigger drug-allergy checks) | Insufficient terminology binding, UX that doesn't encourage coded entry |
| Data loss on save | Clinical information lost — may affect ongoing care | Network failures, session timeouts, browser crashes, concurrent edit conflicts |
| Incorrect clinical coding | Wrong diagnosis/problem recorded, affects decision-making | Poor SNOMED CT search, ambiguous code descriptions, clinician unfamiliarity with coding |
| Copy-paste propagation of errors | Incorrect information carried forward across encounters | Template/copy-paste functionality without review prompts |

**Quill Medical controls**: OpenEHR archetypes enforce structured data capture, SNOMED CT terminology binding, save confirmation patterns, soft-delete with audit trail.

---

## 4. System Availability and Performance

| Hazard | Potential Clinical Impact | Example Causes |
|--------|--------------------------|----------------|
| System completely unavailable | Clinicians cannot access patient records — delays to care, uninformed clinical decisions | Server failure, network outage, database corruption, deployment error |
| Slow system response | Clinicians skip important checks, develop unsafe workarounds, reduced thoroughness | Database performance, API bottlenecks, large dataset rendering |
| Data not synchronised | Clinician sees stale data; decisions based on outdated information | Eventual consistency, replication lag, offline/PWA sync failures |
| Partial system failure | Some functions work, others silently fail — clinician may not realise data is incomplete | Microservice failures, API timeouts, degraded third-party services |

**Quill Medical considerations**: As a PWA, specific attention is needed for offline/degraded network scenarios. What data is cached locally? What is the risk of acting on stale cached data? How is the user informed of sync status?

---

## 5. Access Control and Confidentiality

| Hazard | Potential Clinical Impact | Example Causes |
|--------|--------------------------|----------------|
| Unauthorised access to patient data | Breach of confidentiality, potential for data misuse | Inadequate RBAC, session hijacking, shared credentials, session not expiring |
| User sees data outside their role scope | Inappropriate clinical decisions; breach of confidentiality | RBAC misconfiguration, role inheritance bugs, permission escalation |
| Audit trail incomplete or missing | Cannot trace who accessed or modified data — undermines clinical governance and incident investigation | Logging failures, soft-delete not capturing actor/timestamp |
| Session persists after user leaves | Subsequent user accesses previous user's patient context | Inadequate session timeout, shared device without logout enforcement |

**Quill Medical controls**: Six-role RBAC model (System Admin, Clinical Admin, Clinician, Clinical Support Staff, Patient, Patient Advocate), soft-delete with full audit trails, UUID identifiers for security.

---

## 6. Integration and Interoperability

| Hazard | Potential Clinical Impact | Example Causes |
|--------|--------------------------|----------------|
| FHIR message fails silently | Data believed to be sent/received but is not — affects referrals, results, medications | Integration errors, schema mismatches, network failures without user alerts |
| Data transformation errors | Clinical meaning altered during exchange | FHIR mapping errors, code system mismatches, unit conversion errors |
| Third-party service unavailable | Dependent functionality fails (PDS lookup, terminology service, identity provider) | External service outage, API rate limiting, certificate expiry |
| Inconsistent data across systems | Different systems show different information for the same patient | Sync timing, mapping discrepancies, partial update failures |

**Quill Medical controls**: FHIR for demographics and messaging, OpenEHR for clinical data, clear integration error handling and user notification.

---

## 7. Configuration and Deployment

| Hazard | Potential Clinical Impact | Example Causes |
|--------|--------------------------|----------------|
| Incorrect local configuration | System behaves differently from what was safety-assessed | Admin misconfiguration, inadequate configuration validation, missing constraints |
| Software update introduces regression | Previously safe functionality broken | Insufficient regression testing, inadequate release management |
| Data migration errors | Historical data lost or corrupted during migration from legacy systems | ETL errors, schema differences, character encoding issues, mapping failures |
| Configuration change not safety-assessed | New risk introduced without going through hazard assessment | Change made outside of controlled process, emergency fix without review |

---

## 8. Clinical Workflow Hazards

| Hazard | Potential Clinical Impact | Example Causes |
|--------|--------------------------|----------------|
| System workflow mismatches clinical workflow | Clinicians develop workarounds that bypass safety controls | Poor UX design, failure to involve end-users in design, rigid workflow enforcement |
| Alert fatigue | Clinicians override or ignore clinically important alerts due to excessive alerting | Too many low-value alerts, poor alert prioritisation, no alert escalation mechanism |
| Information overload | Clinician misses critical information buried in excessive data | Dense UI, unnecessary data display, poor information hierarchy |
| Task not completed due to interruption | Clinical action started but not finished — patient at risk | No task tracking, no "incomplete action" warnings, workflow not resumable |

---

## Notes

This catalogue is a starting point. Each hazard identified here should be formally assessed in a SWIFT workshop, with causes, existing controls, severity, likelihood, mitigations, and residual risk documented in the Hazard Log.

New hazard categories may emerge as Quill Medical's feature set grows — particularly around clinical decision support, prescribing, results management, and clinical correspondence.
