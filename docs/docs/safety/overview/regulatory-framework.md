# Regulatory Framework

## DCB 0129 and DCB 0160

The UK's approach to clinical safety of health IT systems is built around two complementary information standards, both mandated under **Section 250 of the Health and Social Care Act 2012**.

### DCB 0129 — Manufacture

*Clinical Risk Management: its Application in the Manufacture of Health IT Systems.*

This standard applies to Quill Medical Ltd as the developer/manufacturer. It requires evidence that the product has undergone a clinical safety assessment and that a Clinical Risk Management System is in place.

If Quill Medical cannot demonstrate DCB 0129 compliance, it cannot be placed on the NHS market. Deploying organisations will request and review DCB 0129 documentation before proceeding with their own DCB 0160 assessment.

The specification (v4.2) outlines over 50 requirements. The core obligations are:

- Appoint a named Clinical Safety Officer (CSO)
- Establish and maintain a Clinical Risk Management System
- Produce and maintain three key documents: Clinical Risk Management Plan, Hazard Log, and Clinical Safety Case Report
- Conduct clinical risk management activities throughout the entire product lifecycle
- Analyse any third-party products incorporated into the system
- Maintain a clinical safety incident log
- Use defined risk acceptability criteria for hazard evaluation

### DCB 0160 — Deployment and Use

*Clinical Risk Management: its Application in the Deployment and Use of Health IT Systems.*

This is the mirror standard that applies to **each NHS organisation that deploys** Quill Medical. Each deploying Trust must conduct their own clinical risk assessment for their local context — covering local configuration, integration with existing systems, training, business continuity, etc.

The deploying organisation's CSO will typically request a meeting with the manufacturer's CSO and will review the manufacturer's DCB 0129 documentation as a starting point for their DCB 0160 assessment.

Quill Medical should provide a **DCB 0160 template** or addendum to assist deploying organisations with their own compliance.

### Standards Review

NHS England has commenced a review of both standards (working towards Version 2) to ensure they remain practical and aligned with modern technology including AI, international standards like ISO 14971, and the evolving CSO role. Monitor for publication updates.

---

## Digital Technology Assessment Criteria (DTAC)

The DTAC is the national baseline criteria for digital health technologies entering and already used in the NHS and social care. Introduced in 2021, it brings together requirements across five domains:

| Domain | Key Requirements |
|--------|-----------------|
| **Clinical Safety** | DCB 0129 compliance, named CSO, MHRA registration (if applicable) |
| **Data Protection** | UK GDPR compliance, DPIA, ICO registration, named DPO, Caldicott Principles, NHS DSPT |
| **Technical Security** | Cyber Essentials certification, penetration testing within 12 months, ISO 27001 (recommended) |
| **Interoperability** | Open standards (FHIR, SNOMED CT), NHS Common User Interface patterns |
| **Usability & Accessibility** | NHS Service Standard, WCAG compliance |

NHS organisations should assess any new digital health technology against the DTAC as part of procurement. The clinical safety section must be assessed by a qualified CSO.

Quill Medical's existing architecture (FHIR for demographics/messaging, OpenEHR for clinical data, React/TypeScript PWA) aligns well with the interoperability and technical foundations. The clinical safety documentation is a distinct workstream that runs alongside development.

---

## Related Standards

### ISO 14971

*Medical Devices: Application of Risk Management to Medical Devices.*

DCB 0129 was originally derived from an earlier version of ISO 14971. If Quill Medical were classified as a medical device, compliance with ISO 14971 would also be required. A pure EPR that stores and displays clinical data is typically **not** classified as a medical device, but if clinical decision support features are added, the boundary may shift. Version 2 of DCB 0129 is expected to align more closely with ISO 14971.

### NHS Data Security and Protection Toolkit (DSPT)

Required alongside DTAC for data protection compliance. Demonstrates that the organisation handles data correctly and safeguards information.

### Cyber Essentials / Cyber Essentials Plus

Required for technical security compliance under DTAC.

### UK Medical Devices Regulations 2002 / MHRA

Only applicable if Quill Medical is classified as a medical device or Software as a Medical Device (SaMD). A pure EPR is typically out of scope, but this should be formally assessed and documented. If the product starts incorporating clinical decision support (e.g. suggesting diagnoses, recommending treatments, calculating clinical scores with recommendations), MHRA classification should be revisited.

### UK Data (Use and Access) Bill

Forthcoming legislation that seeks to modernise data governance. DCB 0129/0160 sit alongside other information standards that align with this Bill, emphasising privacy, transparency, and innovation.
