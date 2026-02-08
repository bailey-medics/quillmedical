# Hazard

**Hazard id:** Hazard-0026

**Hazard name:** Password hashing without pepper

**Description:** Password hash_password uses Argon2 with default parameters but no pepper (server-side secret mixed into hash), making passwords vulnerable to cracking if attacker obtains database dump.

**Causes:**

- hash_password uses argon2.hash() with no additional server-side secret
- No PEPPER environment variable mixed into hash before storage
- Standard Argon2 can be cracked with sufficient computing power if attacker has database dump

**Effect:**
Attacker with database access (SQL injection, backup theft, insider threat) can crack weak passwords using rainbow tables or GPU-accelerated cracking.

**Hazard:**
Unauthorized access to clinician accounts after successful password cracking.

**Hazard controls:**

### Design controls (manufacturer)

- Add pepper to password hashing: define PEPPER secret in environment variables (64+ random characters). Concatenate pepper with password before Argon2 hashing: `argon2.hash(password + PEPPER)`. Store pepper separately from database (in secrets vault).
- Increase Argon2 parameters for stronger hashing: set time_cost=4 (default 2), memory_cost=512MB (default 256MB), parallelism=8 (default 2). Balances security vs login performance.
- Implement password strength requirements: minimum 12 characters, uppercase, lowercase, numbers, symbols. Use zxcvbn library to estimate crack time, reject passwords weaker than "1 year to crack."
- Add hardware security module (HSM) integration for pepper storage: store pepper in Azure Key Vault or AWS Secrets Manager, retrieve at application startup. Never store pepper in database or code repository.
- Implement password breach detection: check submitted passwords against Have I Been Pwned API during registration/password change. Reject any password appearing in known breach databases.

### Testing controls (manufacturer)

- Unit test: Hash password "Test123!" with pepper, verify hash output different than same password without pepper. Assert pepper correctly mixed into hash computation.
- Unit test: Attempt to create account with weak password "password123". Assert rejected with message about password strength requirements.
- Integration test: Hash password "SecureP@ssw0rd!" with Argon2 configured parameters. Use benchmark tool to verify hash computation takes >100ms on standard hardware (makes brute force expensive).
- Security test: Simulate database dump scenario - extract password hashes, attempt offline cracking with hashcat/john using common password lists. Assert strong passwords remain uncracked after 24-hour GPU attack.

### Training controls (deployment)

- Train staff on strong password requirements: use password manager (1Password, LastPass, Bitwarden) to generate and store complex passwords. Never reuse passwords across systems.
- Document password policy in user manual: "Passwords must be 12+ characters with mix of character types. Use phrases/acronyms you can remember. Change every 90 days."
- Include in security awareness training: Password cracking techniques, importance of strong unique passwords, risks of password reuse.

### Business process controls (deployment)

- NHS Trust IT security policy: Clinical system passwords must meet NHS Digital password guidance (12+ characters, complexity, 90-day expiry, no reuse of previous 5 passwords).
- Incident response: If database breach suspected, immediately force password reset for all users. Send breach notification emails with password reset instructions.
- Audit requirement: Quarterly password strength audit using password cracking tools on test copy of database. Report weak password percentage to clinical governance committee.
- Policy: System administrators have higher password requirements (16+ characters, hardware token 2FA mandatory) due to elevated access privileges.

**Harm:**
Data breach with unauthorized viewing/editing of patient records. Attacker could modify clinical data causing patient harm through falsified records leading to incorrect treatment.

**Code associated with hazard:**

- `backend/app/security.py:40-48`
