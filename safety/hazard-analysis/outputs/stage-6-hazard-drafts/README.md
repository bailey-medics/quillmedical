# Stage 6: Hazard Log Drafts (DCB 0129/0160 Compliant)

**Generated:** 8 February 2026
**Pipeline Stage:** 6 of 6 (FINAL STAGE)
**Status:** ✅ COMPLETE

---

## Overview

This directory contains 47 structured hazard log drafts in DCB 0129/0160 compliant format, ready for Clinical Safety Officer review. These drafts represent the final output of the automated hazard analysis pipeline.

---

## Contents

- **47 Hazard Log Files:** `Hazard-0001.md` through `Hazard-0047.md`
- **Format:** Structured markdown with standardised field separators (`---`)
- **Compliance:** DCB 0129 (Clinical Risk Management) and DCB 0160 (Clinical Safety Case)

---

## Hazard Log Format

Each hazard log contains the following standardised sections:

### Core Identification

- **Hazard name:** Short descriptive title
- **General utility label:** `[2]` (New hazard for triage)
- **Likelihood scoring:** TBC (awaiting Clinical Safety Officer assessment)
- **Severity scoring:** TBC (awaiting Clinical Safety Officer assessment)

### Hazard Description

- **Description:** Concise 1-3 sentence summary
- **Causes:** Numbered list of root causes
- **Effect:** Change in intended care pathway
- **Hazard:** Potential for harm (even if unrealised)
- **Hazard type:** Bullet list (e.g., WrongPatient, UnauthorizedAccess)
- **Harm:** Actual patient harm if hazard realised

### Controls & Mitigation

- **Existing controls:** "None identified during initial analysis."
- **Hazard controls:**
  - Design controls (manufacturer)
  - Testing controls (manufacturer)
  - Training controls (deployment)
  - Business process controls (deployment)

### Risk Assessment

- **Residual hazard risk assessment:** TBC — awaiting initial controls implementation.

### Administrative

- **Assignment:** Clinical Safety Officer
- **Labelling:** TBC (awaiting scoring)
- **Project:** Clinical Risk Management
- **Hazard status:** Draft from LLM
- **Code associated with hazard:** File paths and line numbers

---

## Clinical Safety Officer Actions Required

For each hazard, the Clinical Safety Officer must:

1. **Review and validate** hazard description, causes, effects, and harm
2. **Score likelihood** (1-5 scale: Very low to Very high)
3. **Score severity** (1-5 scale: Minor to Catastrophic)
4. **Calculate risk** (automatic from likelihood × severity matrix)
5. **Review proposed controls** and determine which to implement
6. **Assign** hazard to appropriate team member/manufacturer
7. **Update status** from "Draft from LLM" to "Open" when validated
8. **Add labelling** based on risk scoring

---

## Hazard Categories

The 47 hazards span multiple categories:

### Patient Identification (13 hazards)

- Wrong patient identity displayed
- Missing demographics
- Age calculation errors
- NHS number validation
- Avatar gradient confusion
- Stale patient data
- Duplicate patient records
- Patient list race conditions
- Letter/patient mismatches
- Optional field handling
- FHIR gender validation
- Avatar gradient FHIR extensions
- Orphaned EHRbase letters

### Authentication & Security (15 hazards)

- JWT token expiry during clinical sessions
- Missing rate limiting
- CSRF protection gaps
- Weak random number generation
- Authentication race conditions
- TOTP validation issues
- Logout failures
- Password hashing without pepper
- JWT/CSRF secret reuse
- TOTP secrets not encrypted
- Default active user accounts
- Missing audit trails
- No email verification
- Login response information disclosure
- Secrets logging

### Data Integrity (8 hazards)

- Duplicate FHIR patient creation
- Invalid FHIR gender values
- EHRbase EHR creation race conditions
- Invalid letter content
- Service worker cache staleness
- Push notification associations
- Date format locale assumptions
- Database connection exhaustion

### Infrastructure & Operations (11 hazards)

- FHIR server health check false negatives
- Weak configuration secrets
- Caddy reverse proxy rate limiting
- EHRbase API exposure
- Overly permissive CORS
- Docker resource limits
- Backend/FHIR startup ordering
- Database migration backup validation
- Push notification endpoint authentication
- API path validation
- API client token refresh loops

---

## Next Steps

1. **Clinical Safety Officer Review:** Schedule review meeting for all 47 hazards
2. **Prioritisation:** Identify high-risk hazards requiring immediate mitigation
3. **Assignment:** Distribute hazards to development team and deployment teams
4. **Implementation Tracking:** Create GitHub issues or Jira tickets for each hazard control
5. **Residual Risk Assessment:** After controls implemented, re-assess likelihood and severity
6. **Hazard Log Publication:** Transfer validated hazards to official Clinical Risk Management File

---

## Pipeline Execution Summary

**Stage 1:** Code file discovery and patient safety analysis → 47 potential hazards identified

**Stage 2:** Hazard extraction and structuring → 47 structured hazards

**Stage 3:** Cause analysis and root cause identification → Causes documented

**Stage 4:** Harm assessment and clinical impact → Harm scenarios defined

**Stage 5:** Mitigation strategy generation → 4 control types per hazard

**Stage 6:** DCB 0129/0160 hazard log draft creation → **47 compliant drafts** ✅

---

## Compliance Notes

These hazard logs are structured to support:

- **DCB 0129:** Clinical Risk Management system requirements
- **DCB 0160:** Clinical Safety Case Report requirements
- **NHS Digital DTAC:** Digital Technology Assessment Criteria
- **CQC Registration:** Safe and effective care domain evidence

All hazards require Clinical Safety Officer sign-off before system deployment.

---

## File Naming Convention

- **Format:** `Hazard-NNNN.md` (4-digit zero-padded)
- **Range:** Hazard-0001 through Hazard-0047
- **Immutable IDs:** Hazard numbers assigned permanently, not reused if hazard closed

---

## Maintenance

- **New Hazards:** Add as Hazard-0048, Hazard-0049, etc.
- **Closed Hazards:** Update status to "Closed" but retain file for audit trail
- **Merged Hazards:** Mark duplicates as "Transferred" with reference to master hazard
- **Version Control:** All changes to hazard logs must be committed to Git with explanation

---

## Contact

**Clinical Safety Officer:** TBC
**Clinical Risk Management File Location:** TBC
**System Deployment Review Date:** TBC

---

_Generated by automated hazard analysis pipeline. All hazards require human Clinical Safety Officer review and validation before use in clinical risk management._
