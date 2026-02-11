# Hazard

**Hazard id:** Hazard-0022

**Hazard name:** Insecure random number generation

**Description:** Avatar gradient index and potentially other features use Python `random.randint()` instead of cryptographically secure `secrets` module, making values predictable for attackers.

**Causes:**

- Python random module is PRNG not CSPRNG
- Seed may be predictable
- Pattern of using insecure random throughout codebase

**Effect:**
Attacker can predict avatar gradients for new patients. More critically, if pattern repeated for security-sensitive features (session tokens, password reset tokens, TOTP secrets), severe security vulnerability exists.

**Hazard:**
If insecure random pattern extended to security tokens: attacker can predict session tokens, password reset tokens, or TOTP secrets, gaining unauthorized access to any account.

**Hazard controls:**

### Design controls (manufacturer)

- Replace all uses of `random.randint()` with `secrets.randbelow()` from Python secrets module (cryptographically secure). Audit entire codebase for random module usage: `grep -r "import random" --include="*.py"`.
- Create secure random utility functions in backend/app/utils/secure_random.py: `generate_random_index(max_value)`, `generate_token(length=32)`, `generate_password_reset_token()`. Enforce usage via code review.
- Add linting rule (ruff/pylint) flagging imports of random module in security-sensitive code. Configure to error on `import random` except in test files.
- For avatar gradients specifically: use deterministic hash of patient FHIR ID instead of random generation. Ensures same patient always gets same color without security concerns.
- Conduct security code review scanning for: password generation, token generation, session ID generation, TOTP secret generation, API key generation. Verify all use secrets module not random.

### Testing controls (manufacturer)

- Unit test: Generate 1000 avatar gradient indices using new secure method, verify distribution appears random (chi-square test for uniform distribution).
- Security test: Attempt to predict next gradient index by observing previous 100 gradient values. Assert prediction success rate =1/30 (random chance), not >1/30 (predictability exploit).
- Code audit test: Automated scan for `import random` in non-test Python files. Assert none found in production code paths.
- Integration test: Generate TOTP secret using secure method, verify secret has 160 bits of entropy (base32 encoded 32 characters). Attempt brute force, assert computationally infeasible.

### Training controls (deployment)

- Train developers on difference between random (PRNG for games/simulations) and secrets (CSPRNG for security). Document: "Never use random module for passwords, tokens, or secrets."
- Include in secure coding training: Cryptographically secure randomness required for anything an attacker might want to predict.

### Business process controls (deployment)

- IT security policy: All security-sensitive random values (passwords, tokens, secrets, session IDs) must use cryptographically secure random number generator.
- Code review checklist: Verify no use of random module for security purposes. Check for secrets module usage in all token/password generation code.
- Penetration testing: Annual security audit must test predictability of tokens, session IDs, password reset links. Verify cryptographic strength.

**Harm:**
Data breach with unauthorized access to all patient records. Attacker could view or modify clinical data causing patient harm through incorrect treatment based on falsified records.

**Code associated with hazard:**

- `backend/app/utils/colors.py`
