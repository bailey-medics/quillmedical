# Quill Specification

Quill is a modern, secure messaging and clinical letter service.
It enables patients to communicate with clinics, receive responses, and obtain signed letters, with fair and transparent billing.
All patient-related content is stored using healthcare standards: FHIR for demographics and OpenEHR for clinical documents.
This creates a durable, auditable, and tamper-evident record.
The system is designed to be extendable into a full electronic patient record in the future.

---

## Purpose

- Provide a secure channel between patients and clinics.
- Store all clinical content using FHIR and OpenEHR standards.
- Allow clinics to charge fairly for time spent responding.
- Produce professional letters with provenance.
- Create a clean “record spine” to support future EPR expansion.

---

## Roles

- **Patient (or relative)**
  Can start new message threads, pay for quotes, and view letters.

- **Administrator**
  Reviews new messages, routes them to clinicians, manages subscriptions, and sends approved letters.

- **Clinician**
  Estimates response effort in six-minute units, generates quotes, replies to patients, drafts and approves letters.

- **Clinic Owner**
  Configures pricing, subscription plans, and settings. Has full audit rights.

- **Billing Staff**
  Manages invoices, refunds, and subscriptions. Cannot access clinical content.

---

## Messaging Workflow

1. Patient sends a new message (a thread).
2. Administrator reviews and assigns to a clinician.
3. Clinician estimates time needed (in units of 6 minutes).
4. System creates a quote for the patient.
5. Patient pays (pay-as-you-go or subscription).
6. Clinician replies once payment confirmed.
7. Thread closes when resolved.

Thread states:
`NEW → ADMIN_REVIEW → ASSIGNED → ESTIMATED → QUOTED → WAITING_PAYMENT → PAID → ANSWERED → CLOSED`

---

## Letter Workflow

1. Clinician drafts a letter in Markdown.
2. Optional review by another staff member.
3. Clinician approves.
4. System renders to PDF, signs, and stores hash in Git.
5. Letter is sent to the patient (or another recipient).
6. Patient acknowledges receipt.

Letter states:
`DRAFT → REVIEW → APPROVED → SENT → ACKNOWLEDGED`

---

## Data Model (core objects)

- **Conversation**: id, patient id, status, opened time, excerpt, staff title.
- **Message**: conversation id, sender role, body, attachments, time.
- **Estimate**: clinician, units, created time.
- **Quote**: estimate reference, amount, currency, checkout url, expiry.
- **Payment event**: quote id, provider reference, amount, status, time.
- **Subscription**: plan, quota per week, start, renewal, cancel.
- **Letter**: subject, body (Markdown), author, status, pdf hash, created/updated.
- **Letter recipient**: type (patient, GP, insurer), method (portal, email, print), address.
- **Consent event**: patient, kind, captured time, evidence.
- **Signature**: letter reference, signer, method, certificate, time.
- **Audit event**: actor, action, object reference, hash, previous hash, time.

---

## Data Storage Architecture

Quill uses a multi-database architecture following healthcare standards:

### PostgreSQL (FastAPI)

- Authentication and authorization (users, roles, sessions)
- TOTP tokens for two-factor authentication
- Application state and configuration

### HAPI FHIR Server (PostgreSQL)

- Patient demographics (FHIR Patient resources)
- Structured patient data following FHIR R4 standard
- RESTful API for patient information

### EHRbase (PostgreSQL)

- Clinical documents and letters (OpenEHR Compositions)
- Structured clinical data following OpenEHR standard
- AQL (Archetype Query Language) for querying
- Templates define document structure

### Security

- All databases use PostgreSQL with encrypted connections
- All traffic uses Transport Layer Security
- Health data encrypted at rest
- Role-based access control enforced at database and application level
- All actions logged to append-only audit log

---

## Security Rules

- All traffic must use Transport Layer Security.
- Patient health information must be encrypted at rest.
- Keys are managed in a Key Management Service.
- No patient details in logs, notifications, or emails.
- Role-based access control enforced at every action.
- All actions written to append-only audit log in PostgreSQL.
- Exports must include all conversations, letters, and billing notes.
- Data follows FHIR and OpenEHR security best practices.

---

## Payments

- Default billing unit = six minutes of clinician time.
- Price per unit set by clinic.
- Quotes expire after 48 hours.
- Pay-as-you-go handled by Stripe Checkout.
- Subscriptions handled by Stripe Billing.
- Only lean payment events stored in database (no card data).

---

## Service Levels

- **Bronze**: response within 48 hours (clinic hours).
- **Silver**: response within 24 hours.
- **Gold**: response within 12 hours.
- **Pay-as-you-go**: defaults to Bronze timing.
- Breaches logged in audit and notified to clinic owner.

---

## Out of Scope (first release)

- No automatic triage or AI estimates (manual only).
- No external GP or insurer integrations.
- No scheduling or video/voice calls.
- No analytics dashboards (future phase).

---
