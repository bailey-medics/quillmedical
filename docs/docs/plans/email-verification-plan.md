# Email verification plan

## Context

All registration paths (teaching + clinical) require email verification before
the user can access the application. This prevents fake accounts and ensures
contact details are valid for clinical governance.

## Flow

1. User registers via any registration page
2. Backend creates user with `email_verified=False`, generates signed token,
   sends verification email
3. User is redirected to a "check your email" page (cannot log in yet)
4. User clicks link in email → `GET /verify-email?token=...`
5. Frontend calls `POST /auth/verify-email` with the token
6. Backend verifies signature + TTL, sets `email_verified=True`
7. User can now log in

If the user tries to log in before verifying:

- Login returns `403` with `{"detail": "Email not verified", "code": "email_not_verified"}`
- Frontend catches this and redirects to the pending page with a resend option

## Token design

- **Library**: `itsdangerous.URLSafeTimedSerializer` (same as forgot-password)
- **Salt**: `"email-verify"` (distinct from `"password-reset"`)
- **Payload**: user's email address
- **TTL**: 60 minutes (`EMAIL_VERIFY_TTL_MIN` setting)
- **Link format**: `{FRONTEND_URL}/verify-email?token={token}`

## Rate limiting

| Endpoint                         | Limit          | Notes                      |
| -------------------------------- | -------------- | -------------------------- |
| `POST /auth/register`            | 3/minute (IP)  | Unchanged                  |
| `POST /auth/verify-email`        | 10/minute (IP) | Token verification         |
| `POST /auth/resend-verification` | 1/minute (IP)  | Per-IP via slowapi         |
| Per-recipient (email_send.py)    | 10/hour        | Built-in sender rate limit |
| Frontend resend button           | 60s cooldown   | Client-side timer          |

## Backend changes

### Model (`backend/app/models.py`)

Add to `User`:

```python
email_verified: Mapped[bool] = mapped_column(default=False)
```

### Migration

- Add `email_verified` column, default `False`
- Data migration: set `True` for all existing users

### Security (`backend/app/security.py`)

```python
_email_verify = URLSafeTimedSerializer(SECRET, salt="email-verify")

def create_email_verify_token(email: str) -> str: ...
def verify_email_verify_token(token: str) -> str | None: ...
```

### Config (`backend/app/config.py`)

```python
EMAIL_VERIFY_TTL_MIN: int = 60
```

### Endpoints (`backend/app/main.py`)

#### Modify `POST /auth/register`

After user creation:

1. Generate verification token
2. Send verification email
3. User stays `email_verified=False`

#### New `POST /auth/verify-email`

- Rate limit: 10/minute
- Body: `{token: str}`
- Verifies token → sets `email_verified=True`
- Returns 400 if invalid/expired

#### New `POST /auth/resend-verification`

- Rate limit: 1/minute
- Body: `{email: str}`
- If user exists and unverified → sends new token email
- Always returns `{"detail": "ok"}` (anti-enumeration)

#### Modify `POST /auth/login`

- After password check, before issuing JWT:
- If `user.email_verified is False` → raise 403 with code `email_not_verified`

## Frontend changes

### New pages

- `/verify-email` — reads `?token=` from URL, calls verify endpoint, shows
  success (link to login) or error (resend option)
- `/verify-email-pending` — "check your email" message, shows registered email,
  resend button with 60s cooldown timer

### Route changes (`main.tsx`)

Both new routes wrapped in `<GuestOnly>`.

### Registration pages

After successful `POST /auth/register`, navigate to `/verify-email-pending`
with `{ email }` in state (instead of auto-login).

### Login page

Catch `email_not_verified` error code → navigate to `/verify-email-pending`
with the email in state so the user can resend.

## Tests

### Backend

- Registration creates user with `email_verified=False`
- Login with unverified email returns 403 + correct code
- `POST /auth/verify-email` with valid token → sets verified
- `POST /auth/verify-email` with expired token → 400
- `POST /auth/verify-email` with invalid token → 400
- `POST /auth/resend-verification` sends for unverified user
- `POST /auth/resend-verification` no-ops for verified/unknown (still 200)

### Frontend

- VerifyEmailPage: success + error states
- VerifyEmailPendingPage: renders message + resend button + cooldown

## Decisions

| Decision                   | Choice                 | Rationale                                 |
| -------------------------- | ---------------------- | ----------------------------------------- |
| Block point                | At login               | Unverified users never get JWT tokens     |
| Token TTL                  | 60 minutes             | Generous — users may not check email fast |
| Existing users             | Migrated as verified   | Don't break existing accounts             |
| Anti-enumeration on resend | Always return 200      | Don't reveal whether email exists         |
| Resend cooldown            | 60s (frontend) + 1/min | Prevents spam without frustrating users   |
