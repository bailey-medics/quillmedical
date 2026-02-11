# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Missing audit trail for user/role changes

---

## General utility label

[2]

---

## Likelihood scoring

TBC

---

## Severity scoring

TBC

---

## Description

User and Role tables have no audit columns (created_at, updated_at, created_by, updated_by), preventing investigation of security incidents and compliance verification.

---

## Causes

1. SQLAlchemy models don't define timestamp columns
2. No mixin for audit trail implementation
3. No foreign key to track who made changes to user accounts or role assignments

---

## Effect

Cannot determine when user account was created, by whom, when roles were changed, or who modified access controls.

---

## Hazard

Security incident investigation hindered, cannot prove compliance with access control policies during audit, cannot detect unauthorized role escalation or account creation.

---

## Hazard type

- UnauthorizedAccess

---

## Harm

Regulatory penalty from inability to demonstrate proper access controls during CQC/NHSD audit. Cannot identify who granted unauthorized access leading to data breach. Patient harm if attacker gains elevated access and modifies clinical records.

---

## Existing controls

None identified during initial analysis.

---

## Assignment

Clinical Safety Officer

---

## Labelling

TBC (awaiting scoring)

---

## Project

Clinical Risk Management

---

## Hazard controls

### Design controls (manufacturer)

- Create AuditMixin SQLAlchemy mixin class with columns: created_at (DateTime, default=func.now()), updated_at (DateTime, onupdate=func.now()), created_by_id (ForeignKey to users.id), updated_by_id (ForeignKey to users.id). Add **tablename** check to exclude audit tables from inheriting mixin (prevent infinite recursion).
- Apply AuditMixin to User, Role, UserRole models using multiple inheritance: class User(Base, AuditMixin). Populate created_by_id/updated_by_id in API endpoints using current_user from JWT token (get_current_user_from_jwt dependency).
- Implement separate audit_log table for immutable audit trail: columns include id, timestamp, user_id, action_type (enum: CREATE_USER, UPDATE_USER, DELETE_USER, ASSIGN_ROLE, REMOVE_ROLE, etc.), entity_type, entity_id, old_values (JSONB), new_values (JSONB), ip_address, user_agent. Use PostgreSQL insert-only table (no UPDATE or DELETE permissions). Add PostgreSQL trigger to prevent UPDATEs/DELETEs on audit_log table.
- Create audit logging decorator: @audit_action("CREATE_USER") that automatically captures before/after state of entities, extracts user context from request, writes to audit_log table. Apply to all user/role management endpoints.
- Implement audit log retention policy: keep all audit logs for minimum 7 years (NHS records retention requirement). Archive older logs to cold storage (S3 Glacier, Azure Archive Storage). Implement log export functionality for CQC/NHSD audits (export to CSV or JSON).

### Testing controls (manufacturer)

- Unit test: Create new user via admin endpoint. Query User table for created_at, created_by_id. Assert created_at is recent timestamp (within last minute), created_by_id matches admin user ID.
- Integration test: Admin user updates another user's role. Query audit_log table for ASSIGN_ROLE action. Assert log entry contains: timestamp, admin user ID, target user ID, old roles list, new roles list, IP address.
- Audit trail test: Perform sequence of operations: create user A, assign Clinician role, update user email, remove Clinician role. Query audit_log for user A. Assert 4 entries in chronological order with correct action types and state changes.
- Immutability test: Attempt to UPDATE or DELETE row from audit_log table directly (bypassing ORM). Assert PostgreSQL returns permission denied error (demonstrates immutability enforced at database level).
- Retention test: Insert audit_log entry with timestamp 8 years ago. Run archival script. Verify entry moved to cold storage, no longer in production database. Verify entry still retrievable from archive.

### Training controls (deployment)

- Train administrators on audit trail importance: all user/role changes logged permanently, logs used for security investigations, compliance audits, incident response.
- Document audit log review procedure for security team: weekly review of unusual patterns (after-hours role changes, bulk user creations, role escalations), investigation of suspicious activities.

### Business process controls (deployment)

- Audit log review policy: Security team reviews audit logs weekly for suspicious activities. Escalate unusual patterns (e.g., admin granting themselves new roles, bulk user deletions) to IT security manager.
- Access control policy changes require approval: role assignments to high-privilege roles (Administrator, Clinic Owner) require dual approval. Second administrator must review and approve in audit_log comment field.
- Compliance audit preparation: Maintain audit log export functionality for CQC/NHSD audits. Generate audit reports showing all access control changes in past 12 months. Include reports in annual compliance submission.
- Incident response: During security incident investigation, audit logs are first data source consulted. Preserve audit logs during investigation (no deletion, archival suspended). Export audit logs to external secure storage for forensic analysis.
- NoDocumentationOfClinicalInteraction
- DataBreach

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- backend/app/models.py
