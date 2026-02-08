# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

TOTP secrets not encrypted at rest

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

TOTP secrets stored in database as plaintext VARCHAR(64) without column-level encryption, exposing all TOTP secrets if attacker obtains database dump.

---

## Causes

1. models.py defines totp_secret as VARCHAR(64) with no encryption
2. No column-level encryption enabled
3. Database dump exposes all TOTP secrets in plaintext

---

## Effect

Attacker with database access (SQL injection, backup theft, insider threat) obtains all TOTP secrets and can generate valid 2FA codes for any user.

---

## Hazard

Unauthorized access to clinician accounts even with 2FA enabled, completely bypassing two-factor authentication protection.

---

## Hazard type

- UnauthorizedAccess

---

## Harm

Data breach with unauthorized viewing/editing of all patient records. Attacker could modify clinical data causing patient harm through falsified records leading to incorrect treatment decisions.

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

- Implement column-level encryption for totp_secret using PostgreSQL pgcrypto extension. Encrypt with AES-256-GCM using symmetric encryption key from secrets manager. Update SQLAlchemy model with hybrid_property to encrypt on write, decrypt on read.
- Store encryption keys in Azure Key Vault (or HashiCorp Vault for on-premises). Retrieve encryption key at application startup, never hardcode. Implement key rotation: generate new key, re-encrypt all TOTP secrets with new key, retire old key.
- Add application-level encryption before database insert: in security.py, wrap pyotp secret generation with Fernet encryption (from cryptography library). Store encrypted blob in totp_secret column. Decrypt only during TOTP verification.
- Implement database backup encryption: configure PostgreSQL to encrypt backups at rest using pg_dump --format=custom with gpg encryption. Store backup encryption keys separately from database encryption keys.
- Add secret scrubbing to error logs: ensure TOTP secrets never appear in application logs, stack traces, or debug outputs. Use redaction library (e.g., python-redact) to automatically mask secrets in log messages.

### Testing controls (manufacturer)

- Unit test: Create user with TOTP enabled. Query database directly (bypassing ORM). Assert totp_secret column contains encrypted ciphertext (not plaintext 32-character base32 string). Decrypt value using encryption key, verify matches original secret.
- Integration test: Enable TOTP for test user. Restart application (forces encryption key reload from secrets manager). Verify TOTP verification still works (demonstrates decryption successful after key retrieval).
- Security test: Dump database to SQL file. Search dump for pattern [A-Z2-7]{32} (base32 TOTP secret format). Assert zero matches found (confirms encryption at rest).
- Backup test: Create encrypted backup using pg_dump with gpg encryption. Verify backup file is binary/encrypted (not plaintext SQL). Restore backup, verify TOTP secrets still functional after restore.

### Training controls (deployment)

- Train database administrators on TOTP secret encryption architecture: secrets encrypted at column level, keys stored in external vault, backup encryption separate from database encryption.
- Document key rotation procedure for operations team: step-by-step guide for rotating TOTP encryption key, re-encrypting all secrets, verifying no service disruption.

### Business process controls (deployment)

- IT security policy: All sensitive authentication secrets (passwords, TOTP secrets, API keys) must be encrypted at rest using AES-256 or stronger. Encryption keys stored in dedicated secrets manager.
- Key rotation schedule: TOTP encryption key rotated annually. Mark rotation dates in operations calendar. Test re-encryption process in staging before production rotation.
- Database backup security: Backups must be encrypted using separate encryption key from production database. Backup encryption key stored in offline secure storage. Test backup restore quarterly.
- Access control: Database dumps restricted to authorized DBAs only. Audit log tracks all database dump operations. Investigate any unauthorized dump access as potential breach.
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
- backend/app/security.py
