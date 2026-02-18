# Quill Medical - Implementation Roadmap

**Last Updated:** 4 February 2026
**Version:** 0.1.0
**Status:** Early Development - Foundation Complete, Core Features In Progress

---

## Executive Summary

Quill Medical is a secure clinical messaging and letter platform for patient-clinician communication. The foundational infrastructure is complete (authentication, multi-database architecture, FHIR/OpenEHR integration), but core business features (messaging workflow, billing, letter approval) are not yet implemented. Current priority is **Phase 1: Core Messaging System** with role-based workflow management.

**Current State:**

- ✅ **Infrastructure**: Authentication, databases, Docker Compose, CI/CD
- ✅ **Standards Integration**: FHIR R4 patient demographics, OpenEHR letter storage
- ⚠️ **Patient Management**: Read-only UI exists, no create/edit forms
- ⚠️ **Clinical Letters**: API endpoints exist, no UI or workflow
- ❌ **Messaging**: No implementation started
- ❌ **Billing**: No implementation started

**Next Milestone:** Complete Phase 1 (Messaging + User Roles) for MVP

---

## Completed Features ✅

### Infrastructure & DevOps

- [x] Docker Compose orchestration (7 services: backend, frontend, 3x PostgreSQL, FHIR, EHRbase, Caddy)
- [x] Caddy reverse proxy with automatic HTTPS
- [x] Hot reload for both frontend (Vite) and backend (FastAPI)
- [x] Alembic database migrations (7 migrations completed)
- [x] GitHub Actions CI/CD pipeline
- [x] Pre-commit hooks (formatting, linting, type checking)
- [x] MkDocs documentation site with API docs
- [x] OpenAPI schema generation and Swagger UI

### Authentication & Security

- [x] JWT-based authentication (access token 15min, refresh token 7d)
- [x] HTTP-only cookie storage for tokens
- [x] Automatic token refresh on 401 responses
- [x] CSRF token protection using `itsdangerous`
- [x] Argon2 password hashing
- [x] TOTP two-factor authentication (pyotp)
- [x] TOTP setup/verify/disable endpoints with QR code generation
- [x] Role-based access control (RBAC) decorator `require_roles`
- [x] User registration with validation (min 6 chars password)
- [x] Login/logout with cookie management

### Database Architecture

- [x] Multi-database setup (3 PostgreSQL instances)
- [x] Auth database (users, roles, user_role junction table)
- [x] HAPI FHIR Server for patient demographics (FHIR R4)
- [x] EHRbase for clinical documents (OpenEHR)
- [x] SQLAlchemy 2.0 ORM models
- [x] Database connection pooling and resource limits

### FHIR Integration

- [x] FHIR client implementation (`fhir_client.py`)
- [x] List all patients (GET /api/patients)
- [x] Read patient demographics (GET /api/patients/{id}/demographics)
- [x] Create FHIR patient (POST /api/patients)
- [x] Update patient demographics (PUT /api/patients/{id}/demographics)
- [x] NHS number extraction from FHIR identifiers
- [x] FHIR R4 Patient resource mapping

### OpenEHR Integration

- [x] EHRbase client implementation (`ehrbase_client.py`)
- [x] Create EHR for patient (auto-creates if missing)
- [x] Create letter composition (POST /api/patients/{id}/letters)
- [x] List letters for patient (GET /api/patients/{id}/letters)
- [x] Retrieve letter composition (GET /api/patients/{id}/letters/{uid})
- [x] AQL query for letter retrieval
- [x] Basic auth with EHRbase API

### Frontend Application

- [x] React 19 + TypeScript + Vite setup
- [x] Mantine UI 8.3 component library
- [x] React Router 7.9 with `/app/` base path
- [x] Auth context with automatic token refresh
- [x] Protected routes (`<RequireAuth>` wrapper)
- [x] Guest-only routes (`<GuestOnly>` wrapper)
- [x] Home page with patient list display
- [x] Login page with TOTP support
- [x] Registration page
- [x] Settings page with TOTP management
- [x] TOTP setup page with QR code display
- [x] About page
- [x] 404 page
- [x] Centralized API client with CSRF protection
- [x] Loading skeletons and error handling
- [x] Toast notifications for user feedback

### Push Notifications (Basic)

- [x] Web Push protocol implementation (RFC 8030)
- [x] Push subscription endpoint (POST /api/push/subscribe)
- [x] Test notification endpoint (POST /api/push/send-test)
- [x] VAPID key configuration
- [x] In-memory subscription storage
- [x] Automatic cleanup of invalid subscriptions

### Development Tools

- [x] Justfile with development commands
- [x] Poetry for Python dependency management
- [x] Yarn for frontend dependency management
- [x] pytest test suite (backend)
- [x] vitest test suite (frontend)
- [x] MyPy strict type checking
- [x] Ruff linting
- [x] ESLint + Prettier for frontend
- [x] Storybook setup (not extensively used)
- [x] TypeDoc API documentation generation

---

## In Progress ⚠️

### Patient Management UI

- [x] List patients with demographics
- [x] Display patient cards
- [x] Calculate age from birthdate
- [x] Extract NHS number
- [x] Avatar gradient colors (FHIR extension storage and display)
- [ ] **TODO**: Further refine avatar gradient color algorithm for maximum clinical distinctiveness
  - Current: 10 base hues with 90-150° separation, 60-95% saturation, 45-70% lightness
  - Consider: User testing with clinicians to validate color distinguishability in peripheral vision
  - Consider: Colour-blind-safe palette validation (deuteranopia, protanopia, tritanopia)
  - Consider: Contrast ratio testing for accessibility
- [ ] Create new patient form
- [ ] Edit patient demographics form
- [ ] Patient search/filtering
- [ ] Patient detail view
- [ ] ⚠️ **INCOMPLETE**: Frontend Patient type has fields (address, telephone, mobile, onQuill, nextOfKin) not mapped from FHIR
- [ ] **TODO**: Align Patient type with FHIR R4 structures (Address, ContactPoint, Patient.contact)

### Clinical Letters Storage

- [x] Letter creation API (POST /api/patients/{id}/letters)
- [x] Letter listing API (GET /api/patients/{id}/letters)
- [x] Letter retrieval API (GET /api/patients/{id}/letters/{uid})
- [x] Markdown body storage
- [x] Author metadata (name, email)
- [ ] Letter creation UI
- [ ] Letter viewing UI
- [ ] Letter editing
- [ ] ⚠️ **INCOMPLETE**: OpenEHR template `quill_letter.v1` not created - required for composition creation
- [ ] **TODO**: Create and upload template to EHRbase

### Push Notifications

- [x] Basic subscription management
- [x] Test notification sending
- [ ] ⚠️ **INCOMPLETE**: No authentication on push endpoints - anyone can subscribe/send
- [ ] **TODO**: Add JWT authentication to POST /api/push/subscribe
- [ ] **TODO**: Add JWT authentication + admin role to POST /api/push/send-test
- [ ] User-subscription association in database
- [ ] Selective notification targeting
- [ ] Notification preferences UI
- [ ] ❓ **CLARIFY**: Push storage strategy - PostgreSQL table or Redis?
- [ ] ⚠️ **INCOMPLETE**: Service Worker (`public/sw.js`) not extensively developed
- [ ] **TODO**: Implement push event handling in service worker
- [ ] **TODO**: Background notification display
- [ ] **TODO**: Notification click handling

### API Route Consolidation

- [x] Most routes under /api prefix
- [ ] ⚠️ **INCOMPLETE**: Two POST /api/patients endpoints (lines 579 and 698 in main.py) - only last one registered
- [ ] **TODO**: Combine duplicate POST /api/patients routes with optional verification functionality

---

## Phase 1: Core Messaging System (HIGHEST PRIORITY) 🚀

**Goal:** Enable patient-clinician conversations with proper workflow management

**Timeline:** Target for MVP completion

**Dependencies:** None - foundational feature

### User Roles & Permissions (URGENT - Needed Very Soon)

- [ ] Create Administrator role (database migration)
- [ ] Create Clinic Owner role (database migration)
- [ ] Create Billing Staff role (database migration)
- [ ] Implement role-specific UI components
- [ ] Create role assignment interface for admins
- [ ] Fine-grained permissions system (beyond all-or-nothing)
- [ ] Role-based menu/navigation visibility
- [ ] Administrator dashboard layout
- [ ] Clinic Owner dashboard layout
- [ ] Billing Staff dashboard layout
- [ ] ⚠️ **INCOMPLETE**: Only "Clinician" role currently exists and is used

### Database Models

- [ ] Create `conversations` table (Alembic migration)
  - [ ] patient_id (FK to FHIR patient)
  - [ ] subject/title
  - [ ] state (enum: NEW, ADMIN_REVIEW, ASSIGNED, IN_PROGRESS, AWAITING_PAYMENT, RESOLVED, CLOSED)
  - [ ] assigned_clinician_id (FK to users)
  - [ ] created_at, updated_at
  - [ ] priority level
- [ ] Create `messages` table (Alembic migration)
  - [ ] conversation_id (FK)
  - [ ] sender_id (FK to users, nullable for patient messages)
  - [ ] sender_type (PATIENT, CLINICIAN, ADMIN, SYSTEM)
  - [ ] content (text, markdown support)
  - [ ] created_at
  - [ ] read_at (nullable)
  - [ ] message_type (TEXT, QUOTE, ESTIMATE, NOTIFICATION)
- [ ] Create `conversation_state_history` table for audit trail
  - [ ] conversation_id (FK)
  - [ ] from_state, to_state
  - [ ] changed_by (FK to users)
  - [ ] changed_at
  - [ ] reason (text)
- [ ] Create `estimates` table
  - [ ] conversation_id (FK)
  - [ ] clinician_id (FK to users)
  - [ ] estimated_time_minutes (6-minute units)
  - [ ] estimated_cost
  - [ ] created_at
  - [ ] approved_at (nullable)
- [ ] Pydantic schemas for all models (`schemas/conversations.py`)
- [ ] SQLAlchemy relationships and eager loading

### Audit Logging (Enterprise-Level - Start in Phase 1)

- [ ] Create `audit_log` table (append-only)
  - [ ] id (sequential)
  - [ ] previous_hash (cryptographic hash of previous record)
  - [ ] timestamp
  - [ ] user_id (who performed action)
  - [ ] action_type (CREATE, UPDATE, DELETE, STATE_CHANGE, etc.)
  - [ ] entity_type (CONVERSATION, MESSAGE, LETTER, USER, etc.)
  - [ ] entity_id
  - [ ] before_state (JSONB)
  - [ ] after_state (JSONB)
  - [ ] current_hash (hash of this record including previous_hash)
- [ ] Audit logging middleware/decorator
- [ ] Hash chain validation function
- [ ] Audit log export endpoint (for compliance)
- [ ] Tamper detection mechanism
- [ ] **REQUIRED**: Enterprise-level clinical application standard - capture all PHI modifications

### Clinical Safety Documentation (DCB0129/DCB0160 - Start in Phase 1)

- [ ] Set up Clinical Risk Management File structure
- [ ] Create initial hazard log
  - [ ] Use LLM to assist with hazard identification
  - [ ] Document hazards in code where applicable
  - [ ] Link code comments to hazard log entries
- [ ] Define clinical safety roles and responsibilities
- [ ] Establish hazard severity and likelihood rating system
- [ ] Create hazard documentation template
- [ ] Set up process for ongoing hazard review
- [ ] **Action**: Research in-code hazard documentation approaches

### API Endpoints

- [ ] POST /api/conversations (create new conversation)
  - [ ] Request: patient_id, subject, initial_message
  - [ ] Response: conversation_id, state=NEW
  - [ ] Auto-create system message
- [ ] GET /api/conversations (list conversations with filtering)
  - [ ] Query params: state, patient_id, assigned_to, priority
  - [ ] Pagination support
  - [ ] Include latest message preview
  - [ ] Include unread count
- [ ] GET /api/conversations/{id} (thread details)
  - [ ] Include all metadata
  - [ ] Include state history
  - [ ] Include assigned clinician
- [ ] GET /api/conversations/{id}/messages (message history)
  - [ ] Pagination support
  - [ ] Mark messages as read
  - [ ] Include sender info
- [ ] POST /api/conversations/{id}/messages (send message)
  - [ ] Request: content, message_type
  - [ ] Response: message_id, created_at
  - [ ] Trigger push notification
  - [ ] Update conversation updated_at
- [ ] PATCH /api/conversations/{id}/state (admin triage, clinician assignment)
  - [ ] Request: new_state, assigned_clinician_id?, reason?
  - [ ] Response: updated conversation
  - [ ] Create state_history record
  - [ ] Require Administrator role for state changes
  - [ ] Send notification to assigned clinician
- [ ] POST /api/conversations/{id}/estimate (create time/cost estimate)
  - [ ] Request: estimated_time_minutes, estimated_cost, notes
  - [ ] Response: estimate_id
  - [ ] Require Clinician role
  - [ ] Send notification to patient
  - [ ] Change conversation state to AWAITING_APPROVAL
- [ ] POST /api/conversations/{id}/estimate/approve (patient approves estimate)
  - [ ] Response: updated conversation state
  - [ ] Trigger payment flow (if Phase 4 implemented)
- [ ] GET /api/conversations/assigned-to-me (clinician's assigned conversations)
  - [ ] Filtered by current user
  - [ ] Sorted by priority/updated_at

### Frontend Implementation

- [ ] Create Conversations page (`/app/conversations`)
  - [ ] Conversation list with filters (state, priority, patient)
  - [ ] Search conversations by patient name
  - [ ] Pagination controls
  - [ ] Create new conversation button
- [ ] Create Conversation Detail page (`/app/conversations/{id}`)
  - [ ] Message thread display
  - [ ] Real-time message updates (polling or WebSocket)
  - [ ] Message composition textarea with markdown preview
  - [ ] Send message button
  - [ ] File attachment button (Phase 3)
  - [ ] Conversation metadata sidebar
  - [ ] State change controls (admin only)
- [ ] Create Administrator Triage Dashboard
  - [ ] NEW conversations requiring triage
  - [ ] Clinician availability/workload display
  - [ ] Assign conversation to clinician
  - [ ] Priority setting
  - [ ] Bulk actions
- [ ] Create Clinician Assignment Interface
  - [ ] My assigned conversations
  - [ ] Create estimate form
  - [ ] Time tracking (6-minute increments)
  - [ ] Cost calculator
- [ ] Message composition component
  - [ ] Markdown editor with toolbar
  - [ ] Preview tab
  - [ ] Character count
  - [ ] Send button with loading state
- [ ] Conversation state badge component
  - [ ] Color-coded by state
  - [ ] Tooltip with state description
- [ ] Real-time updates
  - [ ] Polling every 10s for new messages
  - [ ] Push notification on new message
  - [ ] Unread badge on conversations list
- [ ] Navigation update
  - [ ] Add Conversations to main menu
  - [ ] Badge with unread count

### Infrastructure Updates

- [ ] Fix duplicate POST /api/patients routes (combine into single endpoint)
- [ ] Add JWT authentication to push notification endpoints
- [ ] Update frontend Patient type to align with FHIR R4
- [ ] Add CORS configuration for WebSocket (if implemented)
- [ ] **Design multi-tenant database schema**
  - [ ] Add `tenants` table (clinic_id, name, settings)
  - [ ] Add `tenant_id` foreign key to all tenant-specific tables
  - [ ] Row-level security policies for tenant isolation
  - [ ] Tenant context middleware for all API requests

---

## Phase 2: Letter Workflow 📝

**Goal:** Enable letter creation, approval, signing, and distribution

**Dependencies:** Phase 1 (roles and user management)

**Timeline:** After Phase 1 MVP

### OpenEHR Template

- [ ] Design `quill_letter.v1` OpenEHR template
  - [ ] Define archetypes for letter structure
  - [ ] Include metadata fields (author, recipient, date, status)
  - [ ] Include body content field
  - [ ] Include signature fields
- [ ] Upload template to EHRbase
- [ ] Test composition creation with template
- [ ] Document template in `/docs`

### Letter State Machine

- [ ] Create `letter_states` enum (DRAFT, REVIEW, APPROVED, SENT, ACKNOWLEDGED)
- [ ] Create `letters` table in PostgreSQL (separate from OpenEHR for workflow)
  - [ ] letter_id (UUID)
  - [ ] patient_id (FK to FHIR)
  - [ ] composition_uid (link to EHRbase)
  - [ ] state
  - [ ] title
  - [ ] created_by (FK to users)
  - [ ] created_at
  - [ ] reviewed_by, reviewed_at (nullable)
  - [ ] approved_by, approved_at (nullable)
  - [ ] sent_at (nullable)
  - [ ] acknowledged_at (nullable)
- [ ] Create `letter_state_history` table for audit
- [ ] Create `letter_approvals` table
  - [ ] letter_id (FK)
  - [ ] approver_id (FK to users)
  - [ ] decision (APPROVE, REJECT, REQUEST_CHANGES)
  - [ ] comments
  - [ ] created_at
- [ ] State transition validation logic
- [ ] State change notification system

### API Endpoints

- [ ] POST /api/letters (create draft letter)
  - [ ] Request: patient_id, title, body (markdown), recipients[]
  - [ ] Response: letter_id, state=DRAFT
  - [ ] Create OpenEHR composition
  - [ ] Require Clinician role
- [ ] GET /api/letters (list letters with filters)
  - [ ] Query params: state, patient_id, author_id
  - [ ] Pagination
- [ ] GET /api/letters/{id} (retrieve letter details)
  - [ ] Include state history
  - [ ] Include approval history
  - [ ] Include OpenEHR composition
- [ ] PUT /api/letters/{id} (update draft letter)
  - [ ] Only allowed in DRAFT state
  - [ ] Update OpenEHR composition
- [ ] POST /api/letters/{id}/submit-for-review (change state to REVIEW)
  - [ ] Require Clinician role
  - [ ] Notify reviewers
- [ ] POST /api/letters/{id}/approve (approve letter)
  - [ ] Require Clinic Owner or Administrator role
  - [ ] Create approval record
  - [ ] Change state to APPROVED
  - [ ] Notify author
- [ ] POST /api/letters/{id}/reject (reject letter)
  - [ ] Require Clinic Owner or Administrator role
  - [ ] Change state back to DRAFT
  - [ ] Include rejection reason
- [ ] POST /api/letters/{id}/generate-pdf (render PDF)
  - [ ] Only allowed in APPROVED state
  - [ ] Return PDF binary
  - [ ] Store PDF signature hash
- [ ] POST /api/letters/{id}/send (distribute letter)
  - [ ] Change state to SENT
  - [ ] Send via email/portal to recipients
  - [ ] Log distribution event

### PDF Generation

- [ ] Choose Python PDF library (reportlab, weasyprint, or wkhtmltopdf)
- [ ] Create letter template system
  - [ ] Header with clinic logo
  - [ ] Patient demographics
  - [ ] Letter body (markdown → HTML → PDF)
  - [ ] Footer with signature
  - [ ] Page numbers
- [ ] Markdown to HTML conversion (markdown library)
- [ ] HTML to PDF conversion
- [ ] PDF metadata embedding
- [ ] Digital signature integration
  - [ ] Git hash-based signing (as per SPEC.md)
  - [ ] Signature verification endpoint
  - [ ] Tamper-evident hashing

### Recipient Management

- [ ] Create `letter_recipients` table
  - [ ] letter_id (FK)
  - [ ] recipient_type (PATIENT, GP, INSURER, OTHER)
  - [ ] recipient_name
  - [ ] recipient_email (nullable)
  - [ ] recipient_address (text, nullable)
  - [ ] delivery_method (EMAIL, PRINT, PORTAL)
  - [ ] delivered_at (nullable)
  - [ ] acknowledged_at (nullable)
- [ ] Email delivery integration
  - [ ] SMTP configuration
  - [ ] Email templates
  - [ ] Attachment handling
  - [ ] Delivery tracking
- [ ] Print queue management
  - [ ] Generate print-ready PDF
  - [ ] Print job tracking
- [ ] Portal delivery (download link)

### Frontend Implementation

- [ ] Create Letters page (`/app/letters`)
  - [ ] Letter list with filters
  - [ ] State badges
  - [ ] Create letter button
- [ ] Create Letter Editor page (`/app/letters/new`)
  - [ ] Markdown editor with preview
  - [ ] Patient selector
  - [ ] Title input
  - [ ] Recipient management
  - [ ] Save draft button
  - [ ] Submit for review button
- [ ] Create Letter Review page (`/app/letters/{id}/review`)
  - [ ] Letter preview
  - [ ] Approval form
  - [ ] Rejection form with comments
  - [ ] State history timeline
- [ ] Create Letter Detail page (`/app/letters/{id}`)
  - [ ] Letter content display
  - [ ] PDF download button
  - [ ] Send letter button
  - [ ] State timeline
  - [ ] Approval history
- [ ] Letter approval workflow interface
  - [ ] Pending approvals list
  - [ ] Approve/reject actions
  - [ ] Comments section

---

## Phase 3: File Attachments 📎

**Goal:** Support document uploads and FHIR DocumentReference integration

**Dependencies:** Phase 1 (for attaching to messages)

**Timeline:** After Phase 1, can be parallel with Phase 2

### Storage Backend

- [ ] Choose storage solution (S3, Azure Blob, local filesystem)
- [ ] Configure storage credentials
- [ ] Create storage client wrapper
- [ ] Implement file upload handling
  - [ ] Multipart form data parsing
  - [ ] File size limits
  - [ ] File type restrictions
- [ ] Implement file download handling
  - [ ] Streaming responses
  - [ ] Range request support
- [ ] Virus scanning integration
  - [ ] ClamAV or cloud-based scanner
  - [ ] Quarantine mechanism

### Database Models

- [ ] Create `files` table
  - [ ] file_id (UUID)
  - [ ] filename
  - [ ] content_type
  - [ ] size_bytes
  - [ ] storage_path
  - [ ] uploaded_by (FK to users)
  - [ ] uploaded_at
  - [ ] virus_scan_status (PENDING, CLEAN, INFECTED)
  - [ ] virus_scan_at
- [ ] Create `message_attachments` table
  - [ ] message_id (FK)
  - [ ] file_id (FK)
- [ ] Create `letter_attachments` table
  - [ ] letter_id (FK)
  - [ ] file_id (FK)

### FHIR DocumentReference Integration

- [ ] Create FHIR DocumentReference for each file
  - [ ] Link to patient
  - [ ] Link to file storage
  - [ ] Set document type
  - [ ] Set creation date
- [ ] Create FHIR Binary resource for file content
- [ ] Link DocumentReference to Binary
- [ ] Update FHIR client with DocumentReference methods

### API Endpoints

- [ ] POST /api/files (upload file)
  - [ ] Request: multipart/form-data with file
  - [ ] Response: file_id, filename, size
  - [ ] Require JWT authentication
  - [ ] Trigger virus scan
- [ ] GET /api/files/{id} (download file)
  - [ ] Streaming response
  - [ ] Content-Disposition header
  - [ ] Require JWT authentication
  - [ ] Check file ownership/permissions
- [ ] DELETE /api/files/{id} (delete file)
  - [ ] Soft delete (mark as deleted)
  - [ ] Require JWT authentication
  - [ ] Check file ownership
- [ ] GET /api/files/{id}/metadata (file info)
  - [ ] Response: filename, size, content_type, uploaded_at
- [ ] POST /api/conversations/{id}/messages (update to support attachments)
  - [ ] Accept file_ids[] in request
  - [ ] Create message_attachments records

### Frontend Implementation

- [ ] File upload component
  - [ ] Drag-and-drop zone
  - [ ] File picker button
  - [ ] Upload progress bar
  - [ ] File type validation
  - [ ] Size validation
- [ ] Attachment display in messages
  - [ ] File icon by type
  - [ ] Download button
  - [ ] Delete button (own files only)
  - [ ] Preview for images
- [ ] Attachment display in letters
  - [ ] List of attached documents
  - [ ] Download all button
- [ ] Document preview modal
  - [ ] Image preview
  - [ ] PDF preview (if supported)
  - [ ] Download button

---

## Phase 4: Billing Integration (Optional - Not Required for MVP) 💳

**Goal:** Implement payment processing if business model requires it

**Dependencies:** Phase 1 (messaging with estimates)

**Timeline:** Post-MVP, optional feature

**Status:** ✅ **CONFIRMED**: Not required for MVP - deferred to post-launch phase

### Stripe Integration

- [ ] Create Stripe account and obtain API keys
- [ ] Install Stripe Python library
- [ ] Configure Stripe API client
- [ ] Create Stripe webhook endpoint
  - [ ] Verify webhook signatures
  - [ ] Handle payment events
  - [ ] Handle subscription events
  - [ ] Handle failed payment events
- [ ] Store Stripe customer IDs on users
- [ ] Store Stripe payment intent IDs on quotes

### Quote Workflow

- [ ] Create `quotes` table
  - [ ] quote_id (UUID)
  - [ ] conversation_id (FK)
  - [ ] estimate_id (FK)
  - [ ] clinician_id (FK to users)
  - [ ] time_minutes (6-minute units)
  - [ ] rate_per_unit (currency)
  - [ ] total_amount (currency)
  - [ ] created_at
  - [ ] expires_at
  - [ ] accepted_at (nullable)
  - [ ] stripe_payment_intent_id (nullable)
  - [ ] status (PENDING, ACCEPTED, PAID, EXPIRED, CANCELLED)
- [ ] Create quote generation logic
  - [ ] Calculate cost from time estimate
  - [ ] Apply service level rates
  - [ ] Add VAT/tax
- [ ] Create quote expiry mechanism
  - [ ] Background job to expire old quotes
- [ ] Create quote acceptance endpoint
  - [ ] Create Stripe checkout session
  - [ ] Redirect to Stripe hosted page
- [ ] Create quote payment confirmation
  - [ ] Update quote status to PAID
  - [ ] Update conversation state
  - [ ] Send payment receipt

### Subscription Management

- [ ] Create `subscriptions` table
  - [ ] subscription_id (UUID)
  - [ ] user_id (FK)
  - [ ] plan_type (BRONZE, SILVER, GOLD)
  - [ ] stripe_subscription_id
  - [ ] status (ACTIVE, CANCELLED, PAST_DUE, TRIAL)
  - [ ] current_period_start
  - [ ] current_period_end
  - [ ] monthly_message_quota
  - [ ] monthly_message_count
  - [ ] monthly_letter_quota
  - [ ] monthly_letter_count
- [ ] Create subscription plans configuration
  - [ ] Bronze: £X/month, Y messages, Z letters
  - [ ] Silver: £X/month, Y messages, Z letters
  - [ ] Gold: £X/month, unlimited messages/letters
- [ ] Create subscription signup flow
  - [ ] Choose plan page
  - [ ] Create Stripe checkout session
  - [ ] Handle successful subscription
- [ ] Create quota tracking
  - [ ] Increment on message send
  - [ ] Increment on letter create
  - [ ] Block if quota exceeded
- [ ] Create subscription renewal handling
  - [ ] Reset quotas on renewal
  - [ ] Handle failed payments
  - [ ] Send renewal notifications

### API Endpoints

- [ ] POST /api/quotes (create quote from estimate)
  - [ ] Require Clinician role
  - [ ] Link to conversation
- [ ] GET /api/quotes/{id} (retrieve quote)
- [ ] POST /api/quotes/{id}/accept (patient accepts quote)
  - [ ] Create Stripe checkout session
  - [ ] Return checkout URL
- [ ] POST /api/stripe/webhook (handle Stripe events)
  - [ ] Verify signature
  - [ ] Handle payment_intent.succeeded
  - [ ] Handle subscription events
- [ ] GET /api/subscriptions (current user's subscription)
- [ ] POST /api/subscriptions (create subscription)
  - [ ] Request: plan_type
  - [ ] Create Stripe checkout session
- [ ] DELETE /api/subscriptions/{id} (cancel subscription)

### Frontend Implementation

- [ ] Quote display in conversation
  - [ ] Time breakdown
  - [ ] Cost calculation
  - [ ] Accept quote button
  - [ ] Decline quote button
- [ ] Payment checkout flow
  - [ ] Redirect to Stripe hosted page
  - [ ] Return URL handling
  - [ ] Payment success/failure feedback
- [ ] Subscription management page
  - [ ] Current plan display
  - [ ] Usage stats (messages/letters this month)
  - [ ] Upgrade/downgrade buttons
  - [ ] Cancel subscription button
  - [ ] Billing history
- [ ] Billing dashboard (for Billing Staff)
  - [ ] Revenue reports
  - [ ] Payment history
  - [ ] Failed payments list
  - [ ] Subscription churn metrics

---

## Ongoing: Security & Compliance 🔒

**Priority:** Throughout all phases

### Security Hardening

- [ ] Rate limiting on all endpoints
  - [ ] Install slowapi or similar
  - [ ] Configure limits per endpoint
  - [ ] Return 429 Too Many Requests
- [ ] IP allowlisting (if required)
  - [ ] Configure allowed IP ranges
  - [ ] Middleware to check IP
- [ ] Session management
  - [ ] Token revocation on logout
  - [ ] Blacklist for revoked tokens (Redis?)
  - [ ] Force logout on password change
- [ ] CSRF protection on all state-changing operations
  - [ ] Extend to all POST/PUT/PATCH/DELETE endpoints
  - [ ] Currently only some routes protected
- [ ] Input validation and sanitization
  - [ ] Comprehensive Pydantic schema validation
  - [ ] HTML/markdown sanitization
  - [ ] SQL injection protection (already via SQLAlchemy)
- [ ] Secrets management
  - [ ] Move secrets to vault (AWS Secrets Manager, HashiCorp Vault)
  - [ ] Rotate secrets regularly
  - [ ] Audit secret access

### Service Worker Development

- [ ] Implement push notification event handling
  - [ ] `push` event listener
  - [ ] Extract notification payload
  - [ ] Display notification with custom options
- [ ] Implement notification click handling
  - [ ] `notificationclick` event listener
  - [ ] Open app to relevant page (conversation, letter)
  - [ ] Focus existing window if open
- [ ] Offline functionality
  - [ ] Cache static assets
  - [ ] Cache API responses
  - [ ] Offline page
  - [ ] Queue actions for when online
- [ ] Background sync
  - [ ] `sync` event listener
  - [ ] Retry failed API requests
  - [ ] Send queued messages
- [ ] Caching strategies
  - [ ] Cache-first for static assets
  - [ ] Network-first for API calls
  - [ ] Stale-while-revalidate for data

### Audit & Compliance

- [x] Append-only audit log design (Phase 1 roadmap)
- [ ] GDPR compliance
  - [ ] Data export endpoint (subject access request)
  - [ ] Data deletion endpoint (right to be forgotten)
  - [ ] Consent tracking (requirements to be clarified)
  - [ ] Privacy policy page
  - [ ] Cookie consent banner
- [ ] **Consent Management** (requirements to be fleshed out)
  - [ ] Define consent types (GDPR, clinical, research)
  - [ ] Design consent capture UI/workflow
  - [ ] Consent storage and audit trail
  - [ ] Consent withdrawal mechanism
- [ ] NHS Data Security and Protection Toolkit requirements
  - [ ] Document security controls
  - [ ] Regular security audits
  - [ ] Staff training records
- [ ] Clinical safety documentation (DCB0129, DCB0160)
  - [ ] Clinical Risk Management File
  - [ ] Hazard log
  - [ ] Safety case report

---

## Technical Debt 🛠️

### Current Issues

1. **Duplicate API Route**
   - Two POST /api/patients endpoints defined (lines 579 and 698 in main.py)
   - Only last one registered by FastAPI
   - **Action**: Combine into single endpoint with optional query parameters

2. **Push Notification Authentication**
   - POST /api/push/subscribe has no authentication
   - POST /api/push/send-test has no authentication
   - **Action**: Add JWT token requirement to both endpoints

3. **Push Notification Storage**
   - In-memory list - not persisted to database
   - Will not survive backend restarts
   - ❓ **CLARIFY**: PostgreSQL table or Redis for production?
   - **Action**: Implement database persistence

4. **Frontend Patient Type Mismatch**
   - Patient type has fields not populated from FHIR (address, telephone, mobile, onQuill, nextOfKin)
   - **Action**: Align with FHIR R4 standard structures (Address, ContactPoint, Patient.contact)

5. **OpenEHR Template Missing**
   - Code references `quill_letter.v1` template
   - Template not created or uploaded to EHRbase
   - **Action**: Design, create, and upload template

6. **Service Worker Underdeveloped**
   - `public/sw.js` exists but not extensively worked on
   - Push event handling not implemented
   - **Action**: Complete service worker implementation (see Ongoing section)

7. **CSRF Protection Incomplete**
   - Only some routes have CSRF protection
   - **Action**: Apply to all state-changing operations

8. **No Rate Limiting**
   - All endpoints unprotected from abuse
   - **Action**: Implement rate limiting middleware

9. **No Token Revocation**
   - Logout only clears cookies, doesn't revoke tokens
   - Tokens valid until expiry even after logout
   - **Action**: Implement token blacklist

10. **Patient Management UI Incomplete**
    - Can view patients but not create/edit
    - **Action**: Build create/edit forms

### Code Quality Improvements

- [ ] Increase test coverage (currently minimal tests)
- [ ] Add integration tests for FHIR/EHRbase interactions
- [ ] Add end-to-end tests with Playwright or Cypress
- [ ] Document all API endpoints with comprehensive examples
- [ ] Create developer onboarding guide
- [ ] Standardize error response format across all endpoints
- [ ] Add request/response logging middleware
- [ ] Improve error messages for better debugging
- [ ] Add performance monitoring (APM tool)
- [ ] Add database query optimization (analyze slow queries)

---

## Future Enhancements 🚀

### Long-Term Goals (Post-MVP)

- [ ] **Multi-tenancy support (REQUIRED - design early)**
  - [ ] Multiple clinics on single deployment
  - [ ] Tenant isolation and data segregation
  - [ ] Clinic-specific configuration
  - [ ] White-label branding per clinic
- [ ] **International health service integration**
  - [ ] Location-agnostic architecture
  - [ ] Support for NHS (UK), Medicare (US), etc.
  - [ ] Multi-language support (i18n)
  - [ ] Regional compliance (GDPR, HIPAA, etc.)
- [ ] Mobile apps (React Native or Flutter)
- [ ] AI-powered message triage
- [ ] Automated letter drafting (AI assistant)
- [ ] Analytics dashboard for clinic owners
  - [ ] Response time metrics
  - [ ] Patient satisfaction scores
  - [ ] Revenue analytics
  - [ ] Clinician workload metrics
- [ ] Patient portal mobile app
- [ ] GP integration (HL7 FHIR messaging)
- [ ] NHS Spine integration
- [ ] Clinical decision support tools
- [ ] Appointment scheduling
- [ ] Prescription management
- [ ] Lab results integration
- [ ] Medical device integration
- [ ] Insurance claim submission
- [ ] Accessibility improvements (WCAG AAA)
- [ ] Voice dictation for clinicians
- [ ] Smart notifications with ML-based prioritization

### Very Long-Term (Many Years Out)

- [ ] Video consultation integration (Zoom/Teams/WebRTC)
- [ ] Telemedicine platform integration

---

## Confirmed Decisions ✅

Based on stakeholder input:

### 1. Billing Integration

✅ **CONFIRMED**: Stripe/payment processing NOT required for MVP

- Phase 4 deferred to post-launch
- Estimates and quotes can exist without payment processing
- Focus on clinical workflow first

### 2. Multi-Tenancy

✅ **CONFIRMED**: Multiple clinics MUST be supported

- Required for business model
- Implementation approach to be determined
- Architecture should accommodate multiple tenants
- **Action**: Design multi-tenant database schema early

### 3. International Health Services

✅ **CONFIRMED**: Build location-agnostic from start

- Long-term goal: Support NHS, international health services
- Architecture should not assume UK-only deployment
- Language and regionalisation important
- **Action**: Design flexible healthcare provider integration layer

### 4. Clinical Safety Standards

✅ **CONFIRMED**: DCB0129 and DCB0160 compliance required

- Integrate early in development process
- Use LLM to assist with hazard identification and documentation
- Consider embedding hazard documentation in code
- **Action**: Set up hazard log and clinical risk management framework in Phase 1

### 5. Video Consultation

✅ **CONFIRMED**: Not for a long time

- Deprioritised - many years out
- Remove from near-term roadmap

---

## Remaining Uncertainties ❓

### 1. Push Notification Storage Strategy

❓ **DECISION NEEDED**: Production persistence for push subscriptions

- Options: PostgreSQL table, Redis, or other solution
- Currently using in-memory (not production-ready)
- **Action**: Research and decide before Phase 1 completion

### 2. Service Level Agreements (Bronze/Silver/Gold)

❓ **TO BE CLARIFIED**: Service level implementation details

- Mentioned in SPEC.md but specifics unclear
- SLA targets and pricing tiers need definition
- **Action**: Stakeholder meeting to define service levels post-MVP

### 3. Consent Management Requirements

❓ **TO BE CLARIFIED**: Detailed consent capture approach

- Important but specifics to be fleshed out
- Types: GDPR, clinical procedures, research?
- Storage and audit requirements?
- **Action**: Define consent requirements before Phase 2 (letter workflow)

---

## Assumptions to Verify 🔍

Based on codebase analysis, the following assumptions were made:

### 1. Letter Workflow State Machine

🔍 **ASSUMPTION**: The SPEC.md document describes letter states (DRAFT → REVIEW → APPROVED → SENT → ACKNOWLEDGED) but none of this is implemented yet. Assuming this is Phase 2 priority.

### 2. Messaging System Priority

✅ **CONFIRMED**: Messaging system implementation is highest priority (Phase 1) for MVP.

### 3. Payment Processing

✅ **CONFIRMED**: Billing/payment integration NOT required for MVP. Quotes/estimates can exist without payment processing initially.

### 4. Role Implementation Urgency

🔍 **ASSUMPTION**: Administrator, Clinic Owner, and Billing Staff roles are needed "very soon" (Phase 1) based on user confirmation. Assuming these are required before messaging workflow is complete.

### 5. OpenEHR Template Status

🔍 **ASSUMPTION**: The `quill_letter.v1` template is referenced in code but doesn't exist yet. Assuming it needs to be created and uploaded before letter workflow can be implemented.

### 6. Frontend Patient Fields

🔍 **ASSUMPTION**: Frontend Patient type fields (address, telephone, mobile, onQuill, nextOfKin) are placeholders for future FHIR extensions. Assuming these should eventually map to FHIR structures.

### 7. Audit Logging Requirements

🔍 **ASSUMPTION**: Enterprise-level clinical application requires full append-only audit log with cryptographic hash chain. Assuming this is mandatory for compliance.

### 8. Service Worker Status

🔍 **ASSUMPTION**: Service Worker (`public/sw.js`) exists but hasn't been extensively developed. Assuming push notification handling is incomplete.

### 9. Multi-Tenancy Architecture

✅ **CONFIRMED**: Multi-tenancy (multiple clinics) REQUIRED. Current architecture assumes single clinic but must be redesigned for multi-tenant support. Implementation approach to be determined.

### 10. FHIR R4 Alignment & International Support

✅ **CONFIRMED**: System should align with FHIR R4 and build location-agnostic architecture. Long-term goal to support NHS and international health services with proper regionalisation.

---

## Incomplete Implementations ⚠️

Items flagged as incomplete during codebase analysis:

### 1. Duplicate API Routes

⚠️ **INCOMPLETE**: Two POST /api/patients endpoints (lines 579 and 698 in main.py) with different purposes. Only last one is registered. Need to combine or separate properly.

### 2. Patient Management UI

⚠️ **INCOMPLETE**: Frontend can list patients but has no create/edit forms. Read-only implementation only.

### 3. Clinical Letters UI

⚠️ **INCOMPLETE**: Letter API endpoints exist but no UI for creating, viewing, or editing letters.

### 4. Push Notifications

⚠️ **INCOMPLETE**: Multiple issues:

- No authentication on subscribe/send endpoints
- In-memory storage (not persisted)
- No user-subscription association
- Service Worker not extensively developed
- Push event handling not implemented

### 5. OpenEHR Template

⚠️ **INCOMPLETE**: Template `quill_letter.v1` referenced in code but not created or uploaded to EHRbase.

### 6. Frontend Patient Type

⚠️ **INCOMPLETE**: Patient type has fields (address, telephone, mobile, onQuill, nextOfKin) that don't map to FHIR data. Need to align with FHIR R4.

### 7. Role-Based Access Control

⚠️ **INCOMPLETE**: Only "Clinician" role is used. Administrator, Clinic Owner, Billing Staff roles don't exist yet. No role-specific UI.

### 8. Security Measures

⚠️ **INCOMPLETE**: Multiple security gaps:

- No rate limiting
- No token revocation (logout doesn't invalidate tokens)
- CSRF protection only on some routes
- No audit logging

### 9. PWA Functionality

⚠️ **INCOMPLETE**: PWA infrastructure files exist but service worker not extensively developed. Offline functionality, caching strategies not implemented.

### 10. Test Coverage

⚠️ **INCOMPLETE**: Minimal test coverage. Only basic FHIR integration tests exist. Need comprehensive unit, integration, and e2e tests.

---

## End of Roadmap
