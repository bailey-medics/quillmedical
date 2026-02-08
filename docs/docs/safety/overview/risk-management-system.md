# Risk Management System

## Overview

The Clinical Risk Management System is the overarching framework of policies, processes, people, and documentation that ensures clinical risks are identified, assessed, mitigated, and monitored throughout the product lifecycle. It must be started at the **earliest stage of development** and maintained throughout — including design, build, deployment, operation, updates, and decommissioning.

## Core Deliverables

DCB 0129 requires three key documents, all of which must be approved by the CSO.

### Clinical Risk Management Plan (CRMP)

Established at the beginning of each Clinical Safety Case, the CRMP defines:

- **Intended use** of the product and the scope under assessment
- **Clinical context** in which the product will be used (care settings, user types, patient populations)
- **Procedures, policies, and resources** for clinical risk management
- **Risk acceptability criteria** — the severity/likelihood matrix and acceptability thresholds
- **Roles and responsibilities** of all personnel involved
- **Hazard identification methodology** to be used (e.g. SWIFT, HAZID, FFA)
- **Integration** with wider development and quality processes
- **Product lifecycle phases** covered by the plan

The CRMP must be updated if there are significant changes to the project's nature, scope, or intended use. The CSO must approve the CRMP and any updates.

### Hazard Log (CSHL)

The live, dynamic document that records all identified hazards, their causes, clinical impacts, mitigations, and residual risk ratings. This is the operational heart of the clinical safety process.

See [Hazard Log Guide](./hazard-log.md) for detailed structure and process.

A baseline snapshot of the Hazard Log must accompany each Clinical Safety Case Report.

### Clinical Safety Case Report (CSCR)

A structured argument, supported by evidence, that the system is safe for release. The CSCR:

- Summarises the hazard analysis findings
- References the Hazard Log
- Presents **safety claims** — assertions that:
  - All foreseeable clinical safety hazards are known
  - Hazards have been evaluated and documented by a multidisciplinary team
  - All identified risks are at an acceptable or tolerable level
  - Robust post-market surveillance mechanisms are in place
- Must be updated for each significant release or change
- Is the primary document shared with deploying NHS organisations

The CSCR should evolve alongside the product, providing continuously updated confidence in safety.

## Supporting Documentation

Beyond the three core documents, the Clinical Risk Management File should contain:

| Document | Purpose |
|----------|---------|
| **Clinical Risk Management File** | Master folder containing all clinical safety documentation and evidence |
| **Third-party risk assessments** | Analysis of clinical risks from incorporated third-party products (FHIR servers, identity providers, terminology services, etc.) |
| **Clinical safety incident log** | Record of all safety incidents reported post-deployment |
| **Training and competency records** | CSO qualifications, training certificates, and competency evidence |
| **Hazard workshop minutes** | Records of attendees, methodology, and findings from each workshop |
| **DCB 0160 template** | Template provided to deploying organisations to assist their own compliance |

## Lifecycle Coverage

The Clinical Risk Management System must cover all phases:

| Phase | Risk Management Activities |
|-------|---------------------------|
| **Design & Development** | Initial hazard identification, design controls, safety-by-design decisions |
| **Testing** | Verification that safety controls are effective, clinical test scenarios |
| **Deployment** | Release sign-off by CSO, deployment-specific risk assessment, training |
| **Operation** | Post-market surveillance, incident management, user feedback monitoring |
| **Maintenance & Updates** | Re-assessment of hazards for each change, regression risk analysis |
| **Decommissioning** | Data migration risks, continuity of care during transition |

Each new release or significant change requires review of the Hazard Log and may require an updated CSCR.
