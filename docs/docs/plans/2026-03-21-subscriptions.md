# Public site email subscriptions

Add a mailing list signup form to the public landing pages (homepage and contact page), backed by a Google Cloud Function (2nd gen) that stores submissions in Firestore. The form is a reusable `EmailSignup` component with Storybook stories and tests. No changes to the existing FastAPI backend or auth database.

## Architecture

```text
Public pages (GCS static site)            Cloud Function (europe-west2)
  quill-medical.com                           │
     │                                        │
     │  POST /subscribe                       │
     │  { "email": "...", "source_page": "homepage" }
     │────────────────────────────────────────▶│
     │                                        │
     │  200 / 400 / 409                       ▼
     │◀────────────────────────────────── Firestore
                                          (mailing_list collection)
```

- **Frontend**: New `EmailSignup` component (Mantine `TextInput` + `PublicButton`), placed on homepage and contact page
- **Backend**: Cloud Function (Python 3.12, HTTP-triggered) — validates email, writes to Firestore, returns JSON response
- **Infrastructure**: New Terraform module `cloud-function` for provisioning; Firestore enabled per project
- **Decoupled from the clinical app** — the landing page does not depend on the FastAPI backend or Cloud Run services being available

## Estimated cost

| Service                      | Free tier                                    | Expected usage                  | Monthly cost |
| ---------------------------- | -------------------------------------------- | ------------------------------- | ------------ |
| Cloud Functions (2nd gen)    | 2M invocations, 400K GB-s                    | Tens–hundreds of signups/month  | £0           |
| Firestore                    | 1 GiB storage, 20K writes/day, 50K reads/day | One write + one read per signup | £0           |
| GCS (function source bucket) | 5 GB storage                                 | ~10 KB zipped source            | £0           |
| **Total**                    |                                              |                                 | **£0**       |

The free tiers are generous enough that this will cost nothing until the form receives millions of monthly submissions.

## Decisions

- **Firestore** over Cloud SQL — no schema migration, no relational needs, generous free tier (1 GiB storage, 50K reads/day), and the mailing list is a simple key-value collection
- **Cloud Function** over FastAPI endpoint — decouples the landing page from clinical app infrastructure; the signup form works even if the app is down or being deployed
- **No authentication** on the function — it is a public signup form; spam prevention via Cloud Armor rate limiting (already provisioned on the load balancer) and a honeypot field
- **No double opt-in** in v1 — can be added later with an email service integration (e.g. SendGrid, Mailchimp)
- **Component lives in `frontend/src/components/`** (not `public_pages/`) — follows project convention that reusable UI lives in the main `src/` tree and public pages consume it
- **Honeypot field** for basic bot protection — a visually hidden input that bots fill in; submissions with a non-empty honeypot value are silently discarded (no error returned, so bots cannot adapt)

## Phase 1: Cloud Function

### Step 1.1: Create function source

Create `functions/mailing-list/` at the repo root:

```text
functions/
└── mailing-list/
    ├── main.py
    └── requirements.txt
```

**`main.py`** — HTTP Cloud Function:

- Accepts `POST` with JSON body `{ "email": "user@example.com", "source_page": "homepage" }`
- Handles `OPTIONS` preflight for cross-origin resource sharing (CORS)
- Validates:
  - Email format (regex, ≤254 characters, RFC 5321 length limit)
  - `source_page` is a known value (`homepage`, `contact`)
  - Honeypot field `company_name` is empty (if present and non-empty, return 200 silently — do not reveal detection)
- CORS `Access-Control-Allow-Origin` header set to allowed origins:
  - Production: `https://quill-medical.com`, `https://www.quill-medical.com`
  - Staging: `https://quill-medical.com` (landing page served from staging load balancer)
  - Dev: `http://localhost:5174`
  - Configured via `ALLOWED_ORIGINS` environment variable (comma-separated)
- Stores document in Firestore collection `mailing_list`:

  ```json
  {
    "email": "user@example.com",
    "subscribed_at": "2026-03-21T10:30:00Z",
    "source_page": "homepage"
  }
  ```

- Document ID: hash of the email address (deterministic, prevents duplicates without querying first)
- Returns:
  - `200` — success (or honeypot triggered, silently)
  - `400` — invalid email or missing fields
  - `409` — email already subscribed
  - `405` — method not allowed (non-POST, non-OPTIONS)

**`requirements.txt`**:

```text
functions-framework==3.*
google-cloud-firestore==2.*
```

### Step 1.2: Terraform module for Cloud Function

Create `infra/modules/cloud-function/`:

```text
infra/modules/cloud-function/
├── main.tf
├── variables.tf
└── outputs.tf
```

**`main.tf`**:

- `google_storage_bucket` — source bucket for function zip (e.g. `${var.project_id}-function-source`)
- `google_storage_bucket_object` — zipped function source uploaded to the bucket
- `google_cloudfunctions2_function` — 2nd gen Cloud Function:
  - Name: `mailing-list-${var.environment}`
  - Region: `europe-west2` (matches existing infrastructure)
  - Runtime: `python312`
  - Entry point: `subscribe`
  - Memory: 256 MiB, timeout: 30 seconds
  - Max instances: 10 (prevents runaway scaling)
  - Environment variables: `ALLOWED_ORIGINS`, `GCP_PROJECT`
- `google_cloud_run_v2_service_iam_member` — allow unauthenticated invocation (`roles/run.invoker` for `allUsers` on the underlying Cloud Run service)
- `google_firestore_database` — enable Firestore in Native mode (if not already enabled; idempotent)

**`variables.tf`**:

| Variable          | Type           | Description                                 |
| ----------------- | -------------- | ------------------------------------------- |
| `project_id`      | `string`       | GCP project ID                              |
| `region`          | `string`       | Deployment region (default: `europe-west2`) |
| `environment`     | `string`       | Environment name (`staging`, `prod`)        |
| `allowed_origins` | `list(string)` | CORS allowed origins                        |
| `source_dir`      | `string`       | Path to function source directory           |

**`outputs.tf`**:

| Output          | Description                              |
| --------------- | ---------------------------------------- |
| `function_url`  | HTTPS URL of the deployed Cloud Function |
| `function_name` | Name of the Cloud Function resource      |

### Step 1.3: Wire into root Terraform

Update `infra/main.tf`:

```hcl
module "mailing_list_function" {
  source = "./modules/cloud-function"

  project_id      = var.project_id
  region          = var.region
  environment     = var.environment
  allowed_origins = var.mailing_list_allowed_origins
  source_dir      = "${path.root}/../functions/mailing-list"
}
```

Update `infra/variables.tf`:

```hcl
variable "mailing_list_allowed_origins" {
  description = "CORS allowed origins for the mailing list Cloud Function"
  type        = list(string)
  default     = []
}
```

Update environment tfvars:

```hcl
# staging
mailing_list_allowed_origins = [
  "https://quill-medical.com",
  "https://www.quill-medical.com",
]

# prod
mailing_list_allowed_origins = [
  "https://quill-medical.com",
  "https://www.quill-medical.com",
]
```

### Step 1.4: CI/CD

The Cloud Function is Terraform-managed, so it deploys automatically through the existing `terraform.yml` workflow when changes are merged to `main` (staging) or `clinical-live` (production). No additional workflow needed.

Add a path trigger to the Terraform workflow so it also runs when function source changes:

```yaml
paths:
  - "infra/**"
  - "functions/**" # ← new
```

## Phase 2: Frontend — `EmailSignup` component

### Step 2.1: Create the component

Create `frontend/src/components/email-signup/`:

```text
frontend/src/components/email-signup/
├── EmailSignup.tsx
├── EmailSignup.module.css
├── EmailSignup.stories.tsx
└── EmailSignup.test.tsx
```

**`EmailSignup.tsx`**:

- Props:

  | Prop          | Type     | Description                                          |
  | ------------- | -------- | ---------------------------------------------------- |
  | `functionUrl` | `string` | Cloud Function HTTPS URL                             |
  | `sourcePage`  | `string` | Identifier for analytics (`"homepage"`, `"contact"`) |

- Layout: Mantine `TextInput` (email type, placeholder "Your email address") + `PublicButton` ("Join our mailing list") — inline `Group` on desktop, stacked `Stack` on mobile (breakpoint: `theme.breakpoints.sm`)
- Hidden honeypot field: `<input name="company_name" />` with `display: none` via CSS module (not `type="hidden"` — bots may skip those)
- States:
  - **Idle**: form visible, button enabled
  - **Submitting**: button shows loading indicator, input disabled
  - **Success**: form replaced with "Thank you! We will be in touch." message (using `PublicText`)
  - **Error (validation)**: inline error on the `TextInput` ("Please enter a valid email address")
  - **Error (network/409)**: error text below the form ("Something went wrong. Please try again." / "This email is already subscribed.")
- Client-side email validation before submission (basic regex — server validates more strictly)
- Submission: `fetch()` POST to `functionUrl` with `{ email, source_page, company_name }` — not using `api.ts` (this is a public page, no auth cookies)
- Gold accent styling consistent with `PublicButton` (`#C8963E`)

**`EmailSignup.module.css`**:

- `.honeypot` — `position: absolute; left: -9999px; opacity: 0;` (accessible hiding that bots still interact with)
- `.successMessage` — fade-in transition
- Input styling overrides for dark backgrounds (light text, subtle border)

**`EmailSignup.stories.tsx`**:

- Story: `Default` — idle state on `DarkBackground`
- Story: `OnHeroBackground` — idle state on `HeroBackground`
- Story: `Success` — shows thank-you message
- Story: `WithError` — shows validation error

**`EmailSignup.test.tsx`**:

- Renders email input and submit button
- Client-side validation rejects empty input
- Client-side validation rejects malformed email (e.g. `notanemail`)
- Successful submission shows thank-you message (mock `fetch` returning 200)
- Duplicate submission shows already-subscribed message (mock `fetch` returning 409)
- Network error shows generic error message (mock `fetch` rejecting)
- Loading state disables the submit button
- Honeypot field is present but visually hidden

### Step 2.2: Add to homepage

Update `frontend/public_pages/src/pages/index.tsx`:

- Add a new `LightBackground` section **after** the feature card grid (before the footer)
- Content:

  ```text
  ┌──────────────────────────────────────────────┐
  │              Stay in the loop                 │
  │                                               │
  │  We are building Quill Medical in the open.   │
  │  Leave your email to hear about early access  │
  │  and product updates.                         │
  │                                               │
  │  [ your@email.com          ] [ Join ]         │
  └──────────────────────────────────────────────┘
  ```

- Uses `PublicTitle`, `PublicText`, and `EmailSignup` components
- Pass `sourcePage="homepage"`

### Step 2.3: Add to contact page

Update `frontend/public_pages/src/pages/contact.tsx`:

- Replace the "A contact form is coming soon" placeholder in the `DarkBackground` section
- Add `EmailSignup` component with heading "Hear from us"
- Keep the "We aim to respond to all enquiries within two working days" text below
- Pass `sourcePage="contact"`

## Phase 3: Configuration

### Step 3.1: Function URL configuration

The Cloud Function URL needs to be available at build time for the static public pages. Since the URL is stable once deployed, hardcode it per environment rather than using Vite env vars.

Create `frontend/public_pages/src/config.ts`:

```typescript
const config = {
  mailingListUrl: import.meta.env.DEV
    ? "http://localhost:8085" // functions-framework local dev
    : "https://europe-west2-quill-medical-staging.cloudfunctions.net/mailing-list-staging",
} as const;

export default config;
```

Update for production in the public site build workflow (or use `VITE_MAILING_LIST_URL` env var injected at build time in CI).

### Step 3.2: Local development

For local testing without deploying a Cloud Function:

```bash
# In functions/mailing-list/
pip install functions-framework google-cloud-firestore
ALLOWED_ORIGINS="http://localhost:5174" \
  functions-framework --target=subscribe --port=8085 --debug
```

This requires a Firestore emulator or a GCP project with Firestore enabled. Alternatively, mock the function in Storybook stories (the component tests already mock `fetch`).

## File summary

### New files

| File                                                           | Purpose                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `functions/mailing-list/main.py`                               | Cloud Function handler (email validation, Firestore write, CORS)      |
| `functions/mailing-list/requirements.txt`                      | Python dependencies (`functions-framework`, `google-cloud-firestore`) |
| `infra/modules/cloud-function/main.tf`                         | Terraform: Cloud Function, GCS source bucket, Firestore database, IAM |
| `infra/modules/cloud-function/variables.tf`                    | Terraform module inputs                                               |
| `infra/modules/cloud-function/outputs.tf`                      | Terraform module outputs (function URL)                               |
| `frontend/src/components/email-signup/EmailSignup.tsx`         | Reusable signup form component                                        |
| `frontend/src/components/email-signup/EmailSignup.module.css`  | Component styling (honeypot hiding, dark-theme inputs)                |
| `frontend/src/components/email-signup/EmailSignup.stories.tsx` | Storybook stories (Default, OnHeroBackground, Success, WithError)     |
| `frontend/src/components/email-signup/EmailSignup.test.tsx`    | Vitest tests (rendering, validation, submission, error states)        |
| `frontend/public_pages/src/config.ts`                          | Environment-specific configuration (function URLs)                    |

### Modified files

| File                                          | Change                                                    |
| --------------------------------------------- | --------------------------------------------------------- |
| `frontend/public_pages/src/pages/index.tsx`   | Add "Stay in the loop" CTA section with `EmailSignup`     |
| `frontend/public_pages/src/pages/contact.tsx` | Replace "form coming soon" placeholder with `EmailSignup` |
| `infra/main.tf`                               | Wire in `cloud-function` module                           |
| `infra/variables.tf`                          | Add `mailing_list_allowed_origins` variable               |
| `infra/environments/staging/terraform.tfvars` | Add staging allowed origins                               |
| `infra/environments/prod/terraform.tfvars`    | Add production allowed origins                            |
| `.github/workflows/terraform.yml`             | Add `functions/**` to path triggers                       |

## Verification

1. **Cloud Function** — deploy to staging, test with curl:

   ```bash
   # Valid email
   curl -X POST \
     -H "Content-Type: application/json" \
     -H "Origin: https://quill-medical.com" \
     -d '{"email": "test@example.com", "source_page": "homepage"}' \
     https://europe-west2-quill-medical-staging.cloudfunctions.net/mailing-list-staging
   # → 200

   # Duplicate
   # → 409

   # Invalid email
   curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"email": "not-an-email", "source_page": "homepage"}' \
     https://...
   # → 400

   # Honeypot filled
   curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"email": "bot@spam.com", "source_page": "homepage", "company_name": "SpamCo"}' \
     https://...
   # → 200 (silent discard)
   ```

2. **CORS** — test from browser console on `quill-medical.com`: `fetch()` should succeed without CORS errors
3. **Firestore** — verify document created in GCP Console → Firestore → `mailing_list` collection
4. **Frontend tests** — `just unit-tests-frontend` passes all `EmailSignup` tests
5. **Storybook** — `just storybook` renders all stories correctly
6. **Homepage** — `just public-pages` shows CTA section with working form
7. **Contact page** — contact page shows form replacing "coming soon" text
8. **Mobile** — verify responsive layout (form stacks vertically on small screens)
9. **Terraform** — `terraform plan` shows new resources without destroying existing ones

## Future considerations

- **Double opt-in** — send a confirmation email before adding to the list (requires an email sending service such as SendGrid or AWS SES)
- **Export to email platform** — when ready to send newsletters, export Firestore data to Mailchimp/SendGrid via a simple script or `gcloud firestore export`
- **reCAPTCHA** — if the honeypot proves insufficient against sophisticated bots, add Google reCAPTCHA v3 (invisible, score-based)
- **Unsubscribe** — add an unsubscribe link in future emails; update the Firestore document with an `unsubscribed_at` timestamp rather than deleting it
- **Analytics** — track conversion rates by `source_page` to measure which pages drive the most signups
- **GDPR compliance** — add a brief consent notice below the form ("We will use your email to send product updates. You can unsubscribe at any time.")
- **Firestore security rules** — if Firestore is used for other purposes in future, add security rules restricting client access to the `mailing_list` collection (currently the function uses a service account, not client SDK)
