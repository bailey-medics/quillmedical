# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Secrets potentially logged on startup

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

If config.py or main.py logs settings object during startup, sensitive secrets like JWT_SECRET may be exposed in application logs since Pydantic BaseSettings **repr** includes all fields.

---

## Causes

1. Pydantic BaseSettings **repr** includes all fields including SecretStr
2. Dev logging may print entire settings object for debugging
3. Application logs may be shipped to external logging service or stored on disk

---

## Effect

JWT_SECRET, database passwords, VAPID keys, or other secrets exposed in plaintext in application logs.

---

## Hazard

Attacker with log access (compromised logging service, log file access, insider threat) can obtain JWT_SECRET and forge authentication tokens for any user.

---

## Hazard type

- UnauthorizedAccess

---

## Harm

Complete authentication bypass allowing unauthorized access to all patient records. Attacker could modify clinical data causing patient harm through falsified records leading to incorrect treatment.

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

- Override Settings.**repr** method to redact secrets. Return dictionary with SecretStr fields masked: {"JWT*SECRET": "\*\*\_REDACTED***", "AUTH_DB_PASSWORD": "***REDACTED***"}. Use custom**repr\*\* that checks field type before including in output.
- Implement structured logging with secret redaction: use structlog library with RedactingProcessor. Configure processor with list of secret field names (JWT_SECRET, AUTH_DB_PASSWORD, VAPID_PRIVATE, etc.). Automatically redact these fields from all log messages.
- Add startup validation that prevents settings object logging: create custom log filter that blocks log messages containing Settings class name or secret field names. Raise error if attempted in development mode (warns developers during testing).
- Configure logging library (python logging) with custom Formatter that detects SecretStr values. Replace SecretStr values with "[REDACTED]" string before writing to log handlers. Apply formatter to all handlers (console, file, syslog).
- Implement log scrubbing for external log services: before shipping logs to external service (e.g., DataDog, Splunk), run logs through scrubbing function that searches for patterns matching secrets (base64 strings >32 chars, JWT tokens starting with "ey", etc.). Replace with "[REDACTED]" placeholder.

### Testing controls (manufacturer)

- Unit test: Call settings.**repr**(). Assert output contains "JWT*SECRET": "\*\*\_REDACTED*\*\*". Assert actual secret value not present in repr string.
- Integration test: Log settings object using logger.info(f"Settings: {settings}"). Read log output from file or memory handler. Assert log contains "JWT*SECRET": "\*\*\_REDACTED*\*\*", not actual secret value.
- Security test: Simulate log export to external service. Create test settings with known secret values. Export logs. Parse exported logs. Assert zero occurrences of actual secret values (search for known test secrets).
- Startup test: Add temporary log statement to main.py that prints settings. Run application. Check startup logs. Verify secrets redacted before application accepts traffic.

### Training controls (deployment)

- Train developers on secret logging risks: never log settings objects, never log environment variables, use logger.debug for sensitive context (never logger.info or logger.warning for secrets).
- Document secure logging practices: guideline for what can/cannot be logged, examples of safe vs. unsafe logging patterns, requirement to test log output before production deployment.

### Business process controls (deployment)

- Code review policy: All logging statements reviewed during code review. Reviewer checks: does log contain secrets, does log expose sensitive data, is log level appropriate. Reject pull requests with unsafe logging.
- Log retention policy: Application logs retained for 90 days maximum. Logs containing authentication events (logins, token generation) purged after 30 days. Minimize exposure window if secrets accidentally logged.
- Log access control: Application logs accessible only to authorized operations and security staff. Log access audited (who accessed logs, when, what queries run). Investigate unauthorized log access as potential breach.
- Incident response: If secrets found in logs, immediately rotate all affected secrets (JWT_SECRET, database passwords). Audit who had log access during exposure period. Assess potential unauthorized access resulting from secret disclosure.
- DataBreach

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- backend/app/config.py
