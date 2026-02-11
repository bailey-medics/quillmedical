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

**Hazard types:**

- DataBreach

**Harm:**
Data breach with unauthorized access to all patient records. Attacker could view or modify clinical data causing patient harm through incorrect treatment based on falsified records.

**Code associated with hazard:**

- `backend/app/utils/colors.py`
