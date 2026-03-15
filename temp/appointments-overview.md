# Quill Medical — FHIR Backend Implementation Outline

## Context for GitHub Copilot

---

## 1. Stack Context

- **Backend**: FastAPI (Python)
- **FHIR Server**: HAPI FHIR (R4), exposed via REST
- **Clinical DB**: EHRbase (OpenEHR) — for structured clinical observations only
- **Auth/Admin DB**: PostgreSQL (`auth_db`) — organisations, staff, CBAC, access control, messaging metadata
- **Demographics DB**: HAPI FHIR (`fhir_db`) — Patient, Practitioner, Organisation resources
- **Object Storage**: MinIO
- **Auth**: JWT-based, with optional 2FA

All FHIR interactions go through a FastAPI service layer — the frontend never calls HAPI FHIR directly.

---

## 2. Architectural Principle

> All data in Quill belongs to either the **administrative layer** or the **clinical layer**.
> The administrative layer stores organisational events, group contexts, and communications metadata.
> The clinical layer stores only data pertaining to a specific individual patient.
> No patient's clinical record shall contain data that pertains to another patient.

**Implications for this build:**

- `Communication` resources (message content) → FHIR (`fhir_db` via HAPI)
- `Appointment`, `Schedule`, `Slot` resources → FHIR (`fhir_db` via HAPI)
- Thread access control, participant lists, CBAC permissions, read receipts → `auth_db` (PostgreSQL)
- `Encounter` resources created post-appointment → FHIR (`fhir_db` via HAPI)

---

## 3. Messaging — FHIR `Communication` Resource

### 3.1 Resource Shape

Each message is stored as a FHIR `Communication` resource with the following key fields:

```json
{
  "resourceType": "Communication",
  "status": "completed",
  "subject": { "reference": "Patient/{patient_fhir_id}" },
  "sender": { "reference": "Practitioner/{sender_fhir_id}" },
  "recipient": [{ "reference": "Practitioner/{recipient_fhir_id}" }],
  "inResponseTo": [{ "reference": "Communication/{parent_message_id}" }],
  "sent": "2026-03-15T10:00:00Z",
  "payload": [
    {
      "contentString": "Message body text here"
    }
  ],
  "category": [
    {
      "coding": [
        {
          "system": "http://quillmedical.com/fhir/communication-category",
          "code": "clinical-thread",
          "display": "Clinical Thread Message"
        }
      ]
    }
  ],
  "extension": [
    {
      "url": "http://quillmedical.com/fhir/extensions/thread-id",
      "valueString": "{thread_uuid}"
    },
    {
      "url": "http://quillmedical.com/fhir/extensions/patient-view-off",
      "valueBoolean": false
    }
  ]
}
```

### 3.2 Threading Model

- Threads are identified by a custom extension `thread-id` (UUID) on each `Communication`
- The first message in a thread has no `inResponseTo`
- Subsequent messages reference their direct parent via `inResponseTo`
- Thread metadata (participant list, access control, read receipts) is stored in `auth_db`, not in FHIR

### 3.3 Patient View Off

- When `patient-view-off` extension is `true`, the message is not returned in any query issued with a patient-scoped token
- This allows pre-diagnosis clinical discussion before the patient is brought into the thread
- `patient-view-off` can only be set to `false` (never reversed once patient has viewed)

### 3.4 Thread Access Control (auth_db)

Thread access is **relationship-derived**, not explicitly granted per message. Access rules:

| Access Type      | Condition                                                                     |
| ---------------- | ----------------------------------------------------------------------------- |
| Org member       | Practitioner is an `OrganisationStaffMember` of the patient's organisation    |
| CBAC             | Practitioner has a clinical competency allowing access to this patient's care |
| Referral unlock  | External practitioner has been explicitly granted access via a referral link  |
| Patient/advocate | Patient themselves or a registered advocate                                   |

Thread access metadata tables in `auth_db`:

```sql
-- Thread registry (admin layer)
CREATE TABLE message_thread (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_fhir_id VARCHAR NOT NULL,       -- immutable anchor
    organisation_id UUID NOT NULL REFERENCES organisation(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_fhir_id VARCHAR NOT NULL,
    patient_view_enabled BOOLEAN NOT NULL DEFAULT true
);

-- Read receipts (admin layer)
CREATE TABLE message_read_receipt (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES message_thread(id),
    communication_fhir_id VARCHAR NOT NULL,
    reader_fhir_id VARCHAR NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.5 FastAPI Endpoints

```
POST   /api/v1/threads/                        # Create new thread for a patient
GET    /api/v1/threads/?patient_id={id}        # List threads for a patient (CBAC-filtered)
GET    /api/v1/threads/{thread_id}/messages/   # Get all Communications in a thread
POST   /api/v1/threads/{thread_id}/messages/   # Post new Communication to a thread
PATCH  /api/v1/threads/{thread_id}/patient-view-off  # Toggle patient view off
POST   /api/v1/threads/{thread_id}/read/       # Mark messages as read
```

### 3.6 HAPI FHIR Query Patterns

**Fetch all messages in a thread:**

```
GET [HAPI_BASE]/Communication?_tag=thread-id|{thread_uuid}&_sort=sent&subject=Patient/{patient_id}
```

**Fetch replies to a message:**

```
GET [HAPI_BASE]/Communication?in-response-to=Communication/{message_id}
```

---

## 4. Appointments — FHIR Scheduling Resources

### 4.1 Resource Family

| FHIR Resource         | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `Schedule`            | A clinician or clinic's bookable availability window        |
| `Slot`                | Individual bookable time units within a Schedule            |
| `Appointment`         | A confirmed or pending booking of a Slot                    |
| `AppointmentResponse` | Participant acceptance/decline                              |
| `Encounter`           | Created when the appointment is fulfilled (patient attends) |

### 4.2 Schedule Resource

```json
{
  "resourceType": "Schedule",
  "active": true,
  "serviceType": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "11429006",
          "display": "Consultation"
        }
      ]
    }
  ],
  "specialty": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "41176001",
          "display": "Respiratory medicine"
        }
      ]
    }
  ],
  "actor": [
    { "reference": "Practitioner/{practitioner_fhir_id}" },
    { "reference": "Location/{clinic_location_fhir_id}" }
  ],
  "planningHorizon": {
    "start": "2026-04-01T00:00:00Z",
    "end": "2026-06-30T23:59:59Z"
  }
}
```

### 4.3 Slot Resource

```json
{
  "resourceType": "Slot",
  "schedule": { "reference": "Schedule/{schedule_id}" },
  "status": "free", // free | busy | busy-unavailable | busy-tentative
  "start": "2026-04-10T09:00:00Z",
  "end": "2026-04-10T09:30:00Z",
  "serviceType": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "11429006"
        }
      ]
    }
  ]
}
```

### 4.4 Appointment Resource

```json
{
  "resourceType": "Appointment",
  "status": "booked",
  "serviceType": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "11429006",
          "display": "Consultation"
        }
      ]
    }
  ],
  "specialty": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "41176001",
          "display": "Respiratory medicine"
        }
      ]
    }
  ],
  "reasonCode": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "267036007",
          "display": "Breathlessness"
        }
      ]
    }
  ],
  "start": "2026-04-10T09:00:00Z",
  "end": "2026-04-10T09:30:00Z",
  "slot": [{ "reference": "Slot/{slot_id}" }],
  "participant": [
    {
      "actor": { "reference": "Patient/{patient_fhir_id}" },
      "status": "accepted"
    },
    {
      "actor": { "reference": "Practitioner/{practitioner_fhir_id}" },
      "status": "accepted"
    },
    {
      "actor": { "reference": "Location/{location_fhir_id}" },
      "status": "accepted"
    }
  ],
  "created": "2026-03-15T10:00:00Z",
  "comment": "Patient requested morning slot"
}
```

### 4.5 Appointment Status Lifecycle

```
proposed → pending → booked → arrived → fulfilled
                           → cancelled
                           → noshow
```

- `proposed`: system-generated suggestion, not yet confirmed
- `pending`: booked but awaiting participant confirmation
- `booked`: fully confirmed
- `arrived`: patient has checked in
- `fulfilled`: appointment completed → triggers `Encounter` creation
- `cancelled` / `noshow`: terminal states

### 4.6 Encounter Creation on Fulfilment

When an appointment is marked `fulfilled`, a corresponding FHIR `Encounter` is created:

```json
{
  "resourceType": "Encounter",
  "status": "finished",
  "class": {
    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
    "code": "AMB",
    "display": "ambulatory"
  },
  "subject": { "reference": "Patient/{patient_fhir_id}" },
  "participant": [
    {
      "individual": { "reference": "Practitioner/{practitioner_fhir_id}" }
    }
  ],
  "appointment": [{ "reference": "Appointment/{appointment_id}" }],
  "period": {
    "start": "2026-04-10T09:00:00Z",
    "end": "2026-04-10T09:28:00Z"
  }
}
```

### 4.7 FastAPI Endpoints

```
# Schedules
POST   /api/v1/schedules/                         # Create a schedule for a practitioner/location
GET    /api/v1/schedules/?practitioner={id}        # Get schedules for a practitioner
GET    /api/v1/schedules/?location={id}            # Get schedules for a location

# Slots
POST   /api/v1/schedules/{schedule_id}/slots/      # Create slots within a schedule
GET    /api/v1/slots/?schedule={id}&status=free    # Get available slots
PATCH  /api/v1/slots/{slot_id}/status              # Update slot status

# Appointments
POST   /api/v1/appointments/                       # Book an appointment (marks slot busy)
GET    /api/v1/appointments/?patient={id}          # Get appointments for a patient
GET    /api/v1/appointments/?practitioner={id}     # Get appointments for a practitioner
PATCH  /api/v1/appointments/{id}/status            # Update appointment status
DELETE /api/v1/appointments/{id}                   # Cancel appointment (sets status=cancelled)

# Encounters
POST   /api/v1/appointments/{id}/fulfil            # Mark fulfilled + create Encounter
GET    /api/v1/encounters/?patient={id}            # Get encounters for a patient
```

---

## 5. HAPI FHIR Service Layer (FastAPI)

### 5.1 HAPI Client Pattern

All FHIR interactions are wrapped in a service class:

```python
# app/services/fhir_client.py

import httpx
from app.core.config import settings

class FHIRClient:
    def __init__(self):
        self.base_url = settings.HAPI_FHIR_BASE_URL
        self.headers = {"Content-Type": "application/fhir+json"}

    async def create_resource(self, resource_type: str, resource: dict) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/{resource_type}",
                json=resource,
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def get_resource(self, resource_type: str, resource_id: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/{resource_type}/{resource_id}",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def search_resources(self, resource_type: str, params: dict) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/{resource_type}",
                params=params,
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def update_resource(self, resource_type: str, resource_id: str, resource: dict) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{self.base_url}/{resource_type}/{resource_id}",
                json=resource,
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

fhir_client = FHIRClient()
```

### 5.2 CBAC Access Check Pattern

Every FHIR read or write must be gated by the CBAC layer before it reaches HAPI:

```python
# app/services/access_control.py

async def assert_thread_access(
    requesting_user_fhir_id: str,
    patient_fhir_id: str,
    organisation_id: str,
    db: AsyncSession
) -> None:
    """
    Raises HTTP 403 if the requesting user does not have access to the
    patient's thread. Access is derived from:
    - Org membership (OrganisationStaffMember)
    - CBAC competency for this patient
    - Referral-based unlock
    - Patient/advocate status
    """
    # Implementation checks auth_db tables
    ...
```

### 5.3 Environment Variables Required

```env
HAPI_FHIR_BASE_URL=http://hapi-fhir:8080/fhir
AUTH_DB_URL=postgresql+asyncpg://user:pass@auth-db:5432/auth_db
FHIR_DB_URL=postgresql+asyncpg://user:pass@fhir-db:5432/fhir_db
```

---

## 6. Custom Extensions Registry

All Quill-specific FHIR extensions use the base URL `http://quillmedical.com/fhir/extensions/`.

| Extension URL          | Resource      | Type                 | Purpose                                   |
| ---------------------- | ------------- | -------------------- | ----------------------------------------- |
| `.../thread-id`        | Communication | `valueString` (UUID) | Groups messages into a thread             |
| `.../patient-view-off` | Communication | `valueBoolean`       | Hides message from patient-scoped queries |
| `.../organisation-id`  | Communication | `valueString` (UUID) | Links message to Quill organisation       |
| `.../clinic-venue-id`  | Appointment   | `valueString` (UUID) | Links to Quill clinic venue entity        |

---

## 7. Key FHIR Search Parameters

### Communication

| Parameter | Usage                                        |
| --------- | -------------------------------------------- |
| `subject` | Filter by patient: `subject=Patient/{id}`    |
| `sender`  | Filter by sender: `sender=Practitioner/{id}` |
| `_tag`    | Filter by thread: `_tag=thread-id\|{uuid}`   |
| `_sort`   | Order by sent time: `_sort=sent`             |
| `status`  | Filter by status: `status=completed`         |

### Appointment

| Parameter      | Usage                                 |
| -------------- | ------------------------------------- |
| `patient`      | `patient=Patient/{id}`                |
| `practitioner` | `practitioner=Practitioner/{id}`      |
| `status`       | `status=booked`                       |
| `date`         | `date=ge2026-04-01&date=le2026-04-30` |
| `slot`         | `slot=Slot/{id}`                      |

### Slot

| Parameter  | Usage                          |
| ---------- | ------------------------------ |
| `schedule` | `schedule=Schedule/{id}`       |
| `status`   | `status=free`                  |
| `start`    | `start=ge2026-04-01T00:00:00Z` |

---

## 8. Build Order Recommendation

1. **FHIR client service** — wrap HAPI with async httpx client
2. **Communication POST** — create messages, store thread metadata in auth_db
3. **Communication GET (thread)** — fetch and return ordered thread
4. **Patient view off** — extension logic and query filtering
5. **Read receipts** — write to auth_db on message fetch
6. **Schedule + Slot creation** — admin endpoints for clinic setup
7. **Appointment booking** — create Appointment, mark Slot busy, transactional
8. **Appointment status lifecycle** — patch endpoint with state machine validation
9. **Encounter creation on fulfil** — triggered by fulfilled status
10. **iCal export** — optional: convert Appointment to `.ics` for patient calendar integration

---

## 9. Notes for Copilot

- Use `httpx.AsyncClient` for all HAPI FHIR calls — do not use synchronous requests
- All endpoints require JWT authentication; extract `requesting_user_fhir_id` from token
- CBAC access check must be called before any FHIR read or write — never skip it
- Thread metadata (participants, read receipts) goes to `auth_db` via SQLAlchemy async session
- Message content goes to HAPI FHIR — never store message text in `auth_db`
- Use `async with` for database sessions; do not use synchronous SQLAlchemy
- Follow existing Quill FastAPI patterns for router/service/schema separation
- All FHIR resource IDs returned from HAPI should be stored in `auth_db` foreign key fields where cross-referencing is needed
- Pydantic schemas should model the API contract, not the raw FHIR JSON — translate in the service layer
