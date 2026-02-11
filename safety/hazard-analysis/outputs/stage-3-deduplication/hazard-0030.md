# Hazard

**Hazard id:** Hazard-0030

**Hazard name:** Missing audit trail for user/role changes

**Description:** User and Role tables have no audit columns (created_at, updated_at, created_by, updated_by), preventing investigation of security incidents and compliance verification.

**Causes:**

- SQLAlchemy models don't define timestamp columns
- No mixin for audit trail implementation
- No foreign key to track who made changes to user accounts or role assignments

**Effect:**
Cannot determine when user account was created, by whom, when roles were changed, or who modified access controls.

**Hazard:**
Security incident investigation hindered, cannot prove compliance with access control policies during audit, cannot detect unauthorized role escalation or account creation.

**Harm:**
Regulatory penalty from inability to demonstrate proper access controls during CQC/NHSD audit. Cannot identify who granted unauthorized access leading to data breach. Patient harm if attacker gains elevated access and modifies clinical records.

**Code associated with hazard:**

- `backend/app/models.py`
