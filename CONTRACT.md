# Quill Contract

This file defines the contract for Quill’s API.  
It is the source of truth for how clients and servers exchange data.  
All examples use JSON.  
All timestamps are in ISO 8601 (UTC).  
Errors use HTTP status codes with a JSON body.

---

## Authentication

- All requests require JSON Web Token (JWT) in `Authorization: Bearer <token>`.
- Tokens are issued per user role (patient, administrator, clinician, billing staff).
- Role-based access control is enforced by the server.

---

## Conversations

### Create a new conversation

`POST /conversations`

Request:

```json
{
  "opening_message": "I feel dizzy after my tablets.",
  "attachments": []
}
```

Response:

```json
{
  "conversation_id": "conv_123",
  "status": "NEW",
  "patient_excerpt": "I feel dizzy after my tablets.",
  "opened_at": "2025-09-06T10:12:00Z"
}
```

---

### List conversations

`GET /conversations`

Response:

```json
[
  {
    "conversation_id": "conv_123",
    "status": "ANSWERED",
    "last_message_excerpt": "Yes, this is a common side effect...",
    "updated_at": "2025-09-06T11:45:00Z"
  },
  {
    "conversation_id": "conv_124",
    "status": "WAITING_PAYMENT",
    "last_message_excerpt": "I need advice about travel vaccines",
    "updated_at": "2025-09-06T14:21:00Z"
  }
]
```

---

### Add a message to a conversation

`POST /conversations/{conversation_id}/messages`

Request:

```json
{
  "body": "Here is a photo of the tablets I am taking.",
  "attachments": ["file_abc123.png"]
}
```

Response:

```json
{
  "message_id": "msg_789",
  "conversation_id": "conv_123",
  "sender_role": "patient",
  "created_at": "2025-09-06T12:00:00Z"
}
```

---

## Estimates and Quotes

### Add an estimate

`POST /conversations/{conversation_id}/estimates`

Request:

```json
{
  "units": 2,
  "notes": "Likely to take 12 minutes to answer fully."
}
```

Response:

```json
{
  "estimate_id": "est_456",
  "units": 2,
  "created_at": "2025-09-06T12:15:00Z"
}
```

---

### Create a quote

`POST /estimates/{estimate_id}/quote`

Response:

```json
{
  "quote_id": "q_111",
  "amount_pennies": 6000,
  "currency": "GBP",
  "checkout_url": "https://checkout.stripe.com/pay/pi_abc123",
  "expires_at": "2025-09-08T12:15:00Z"
}
```

---

## Payments

### Payment webhook (from Stripe)

`POST /webhooks/payment`

Request (simplified):

```json
{
  "event": "payment_succeeded",
  "provider_ref": "pi_abc123",
  "quote_id": "q_111",
  "amount_pennies": 6000,
  "currency": "GBP"
}
```

Response:

```json
{ "ok": true }
```

---

## Letters

### Create a letter draft

`POST /letters`

Request:

```json
{
  "subject": "Clinic summary of consultation",
  "body_md": "Patient presented with dizziness after new tablets...",
  "recipients": [{ "type": "patient", "method": "portal" }]
}
```

Response:

```json
{
  "letter_id": "let_222",
  "status": "DRAFT",
  "created_at": "2025-09-06T13:00:00Z"
}
```

---

### Approve a letter

`POST /letters/{letter_id}/approve`

Response:

```json
{
  "letter_id": "let_222",
  "status": "APPROVED",
  "pdf_hash": "sha256:abcd1234...",
  "updated_at": "2025-09-06T13:30:00Z"
}
```

---

### Send a letter

`POST /letters/{letter_id}/send`

Request:

```json
{
  "recipients": [
    { "type": "patient", "method": "portal" },
    { "type": "gp", "method": "email", "address": "gp@practice.nhs.uk" }
  ]
}
```

Response:

```json
{
  "letter_id": "let_222",
  "status": "SENT",
  "sent_at": "2025-09-06T14:00:00Z"
}
```

---

## Subscriptions

### Start a subscription

`POST /subscriptions`

Request:

```json
{
  "plan": "silver",
  "patient_id": "pat_789"
}
```

Response:

```json
{
  "subscription_id": "sub_333",
  "plan": "silver",
  "quota_per_week": 4,
  "renewal_date": "2025-10-06"
}
```

---

## Audit

### Record an audit event

`POST /audit`

Request:

```json
{
  "actor": "clinician_123",
  "action": "estimate_created",
  "object_ref": "est_456",
  "hash": "sha256:123abc",
  "previous_hash": "sha256:def456",
  "time": "2025-09-06T12:15:01Z"
}
```

Response:

```json
{ "ok": true }
```

---

## Errors

All errors return JSON like:

```json
{
  "error": "invalid_request",
  "message": "Estimate must have at least 1 unit."
}
```

---

# Notes

- All patient health and care data is committed into the patient’s Git repository.
- Database stores only routing state, login, billing metadata.
- Payments are handled externally (Stripe); Git logs only lean events.
- Letters must always include a signed PDF hash.
- Conversation and letter states follow the workflows defined in `SPEC.md`.

---
