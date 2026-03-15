#!/usr/bin/env python3
"""Seed messaging conversations for development.

Creates staff users and four conversations matching the front-end
demo data so the UI works end-to-end without mock data.

Each message is created directly in SQL (skipping the real FHIR
write) because this is seed/demo data — FHIR IDs are synthetic.

Run from the backend container:
    python scripts/seed_messages.py
"""

import os
import sys
import uuid
from datetime import UTC, datetime, timedelta

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)

from app.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Conversation,
    ConversationParticipant,
    Message,
    User,
)
from app.security import hash_password  # noqa: E402

DEFAULT_PASSWORD = "DemoPass123!"


def _now() -> datetime:
    return datetime.now(UTC)


def _ago(**kwargs: float) -> datetime:
    return _now() - timedelta(**kwargs)


def get_or_create_user(
    db,
    *,
    username: str,
    email: str,
) -> User:
    """Get existing user or create with default password."""
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        user = User(
            username=username,
            email=email,
            password_hash=hash_password(DEFAULT_PASSWORD),
            is_active=True,
        )
        db.add(user)
        db.flush()
        print(f"  + Created user: {username}")
    else:
        print(f"  = User exists: {username}")
    return user


def _fhir_id() -> str:
    return str(uuid.uuid4())


def add_message(
    db,
    *,
    conversation: Conversation,
    sender: User,
    body: str,
    created_at: datetime,
) -> Message:
    """Add a single message to a conversation."""
    msg = Message(
        fhir_communication_id=_fhir_id(),
        conversation_id=conversation.id,
        sender_id=sender.id,
        body=body,
    )
    db.add(msg)
    db.flush()
    # Override the server-default timestamp
    msg.created_at = created_at
    return msg


def seed_conversation_1(
    db,
    emily: User,
    mark: User,
    patient_id: str,
) -> None:
    """Conv 1 — Prescription renewal."""
    print(f"\n  Conversation 1: patient={patient_id} — Prescription renewal")

    conv = Conversation(
        fhir_conversation_id=_fhir_id(),
        patient_id=patient_id,
        subject="Prescription renewal",
        status="active",
    )
    db.add(conv)
    db.flush()

    db.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=mark.id, role="participant"
        )
    )
    db.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=emily.id, role="participant"
        )
    )
    db.flush()

    msgs = [
        (
            mark,
            _ago(hours=3),
            "Hi, I wanted to check on my prescription renewal"
            " — it's due in a few days and I'd like to make sure"
            " there aren't any changes.",
        ),
        (
            emily,
            _ago(hours=2, minutes=30),
            "Hello, let me pull up your records" " — which medication is it?",
        ),
        (
            mark,
            _ago(hours=2),
            "It's the Amlodipine 5mg for blood pressure."
            " I've been taking it for about six months now.",
        ),
        (
            emily,
            _ago(hours=1, minutes=30),
            "I can see your prescription here. Your last BP reading"
            " was 128/82 which is well controlled. I'll renew the"
            " Amlodipine for another three months — no changes needed.",
        ),
        (
            mark,
            _ago(hours=1),
            "That's great news. Should I still come in for a"
            " check-up soon?",
        ),
        (
            emily,
            _ago(minutes=45),
            "Yes, let's schedule a routine review in about four weeks."
            " The admin team will send you appointment options.",
        ),
        (
            mark,
            _ago(minutes=30),
            "Thank you for your help with my prescription",
        ),
    ]
    for sender, ts, body in msgs:
        add_message(
            db, conversation=conv, sender=sender, body=body, created_at=ts
        )
    print(f"    {len(msgs)} messages added")


def seed_conversation_2(
    db,
    gemma: User,
    david: User,
    mark: User,
    patient_id: str,
) -> None:
    """Conv 2 — Gastroenterology clinic."""
    print(
        f"\n  Conversation 2: patient={patient_id} — Gastroenterology clinic"
    )

    conv = Conversation(
        fhir_conversation_id=_fhir_id(),
        patient_id=patient_id,
        subject="Gastroenterology clinic",
        status="active",
    )
    db.add(conv)
    db.flush()

    db.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=mark.id, role="participant"
        )
    )
    db.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=gemma.id, role="participant"
        )
    )
    db.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=david.id, role="participant"
        )
    )
    db.flush()

    dietary_advice = (
        "Thank you Mary, payment received. I've reviewed your case"
        " notes and endoscopy findings from your appointment. Given"
        " your presentation of functional dyspepsia with suspected"
        " dietary triggers, I'd recommend the following:\n\n"
        "1. **Foods to avoid:** High-fat and deep-fried foods,"
        " heavily spiced dishes (particularly chilli, black pepper,"
        " and paprika), citrus fruits and juices, tomato-based"
        " sauces, raw onions, garlic, chocolate, peppermint, and"
        " cruciferous vegetables such as broccoli and cauliflower"
        " if they provoke bloating.\n\n"
        "2. **Drinks to limit or avoid:** Caffeine (coffee, strong"
        " tea, energy drinks), alcohol (especially red wine and"
        " spirits), carbonated beverages, and highly acidic fruit"
        " juices.\n\n"
        "3. **Eating habits:** Eat smaller, more frequent meals"
        " rather than large portions. Avoid eating within three"
        " hours of lying down. Chew thoroughly and eat slowly"
        " — rushing meals increases aerophagia and gastric"
        " distension.\n\n"
        "4. **Food diary:** Please keep a structured food diary for"
        " the next 14 days, noting everything you eat and drink"
        " alongside any symptoms (timing, severity 1–10, and"
        " duration). This will help us identify your specific"
        " triggers rather than relying on generalised guidance.\n\n"
        "5. **Medication:** Continue with the omeprazole 20mg once"
        " daily, taken 30 minutes before breakfast. If symptoms are"
        " not adequately controlled after two weeks of dietary"
        " adjustment, we may consider switching to esomeprazole or"
        " adding a prokinetic agent.\n\n"
        "If your symptoms worsen — particularly if you experience"
        " unintentional weight loss, dysphagia, persistent"
        " vomiting, or any blood in your stool — please contact"
        " the clinic immediately as these would warrant further"
        " investigation.\n\n"
        "I'll ask Gemma to schedule a follow-up review in three"
        " weeks so we can assess your progress with the dietary"
        " changes. Take care."
    )

    msgs = [
        (
            mark,
            _ago(days=10),
            "Hello, I'd like to book in for Dr Corbett's gastro"
            " clinic please. My GP referred me a couple of weeks"
            " ago.",
        ),
        (
            gemma,
            _ago(days=10) + timedelta(minutes=45),
            "Hello, I can see your referral. Dr Corbett has"
            " availability on Wednesday 19 March at 10:30 at Riverside"
            " Health Centre, Room 4. Would that suit you?",
        ),
        (
            mark,
            _ago(days=10) + timedelta(hours=1),
            "That's perfect, thank you very much!",
        ),
        (
            gemma,
            _ago(days=10) + timedelta(minutes=75),
            "Lovely, you're all booked in for the gastro clinic."
            " You'll receive a reminder closer to the date.",
        ),
        (
            mark,
            _ago(days=2),
            "Hi, I had my appointment with Dr Corbett last week"
            " and he was very helpful. I have a quick question"
            " though. I know this was not something covered in the"
            " appointment, but I wonder if certain foods could"
            " worsen my condition. Could he provide a list of foods"
            " I should be avoiding?",
        ),
        (
            gemma,
            _ago(days=2) + timedelta(minutes=30),
            "That's a clinical question so I'll need"
            " to pass it to Dr Corbett directly. I've flagged it"
            " for him and he'll respond here.",
        ),
        (
            david,
            _ago(days=2) + timedelta(hours=1),
            "Hello, Gemma's passed your question on to me."
            " I'm happy to put together a personalised dietary"
            " guide for you — it'll take me about 12 minutes to"
            " review your notes and write it up. As this falls"
            " outside your original appointment, there would be a"
            " charge of £70 for the additional consultation time."
            " Would you like to go ahead?",
        ),
        (
            mark,
            _ago(days=1),
            "Yes please, that would be really helpful. I've just"
            " made the payment through the app.",
        ),
        (david, _ago(hours=23), dietary_advice),
    ]
    for sender, ts, body in msgs:
        add_message(
            db, conversation=conv, sender=sender, body=body, created_at=ts
        )
    print(f"    {len(msgs)} messages added")


def seed_conversation_3(
    db,
    lisa: User,
    james: User,
    mark: User,
    patient_id: str,
) -> None:
    """Conv 3 — Blood test results."""
    print(f"\n  Conversation 3: patient={patient_id} — Blood test results")

    conv = Conversation(
        fhir_conversation_id=_fhir_id(),
        patient_id=patient_id,
        subject="Blood test results",
        status="active",
    )
    db.add(conv)
    db.flush()

    db.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=mark.id, role="participant"
        )
    )
    db.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=lisa.id, role="participant"
        )
    )
    db.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=james.id, role="participant"
        )
    )
    db.flush()

    msgs = [
        (
            mark,
            _ago(hours=6),
            "Hi, I received a notification that my blood test results"
            " are ready. Could someone go through them with me?",
        ),
        (
            lisa,
            _ago(hours=5, minutes=30),
            "Hello, I've flagged your results for Dr Smith to"
            " review. He'll respond here once he's had a look.",
        ),
        (
            james,
            _ago(hours=5),
            "I've reviewed your bloods. Most values are within"
            " normal range. Your cholesterol is slightly elevated at"
            " 5.4 mmol/L — we should discuss dietary adjustments at"
            " your next appointment.",
        ),
        (
            mark,
            _ago(hours=5),
            "My test results came back, what should I do next?",
        ),
    ]
    for sender, ts, body in msgs:
        add_message(
            db, conversation=conv, sender=sender, body=body, created_at=ts
        )
    print(f"    {len(msgs)} messages added")


def seed_conversation_4(
    db,
    emily: User,
    mark: User,
    patient_id: str,
) -> None:
    """Conv 4 — Headaches."""
    print(f"\n  Conversation 4: patient={patient_id} — Headaches")

    conv = Conversation(
        fhir_conversation_id=_fhir_id(),
        patient_id=patient_id,
        subject="Headaches",
        status="resolved",
    )
    db.add(conv)
    db.flush()

    db.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=mark.id, role="participant"
        )
    )
    db.add(
        ConversationParticipant(
            conversation_id=conv.id, user_id=emily.id, role="participant"
        )
    )
    db.flush()

    msgs = [
        (
            mark,
            _ago(days=2),
            "I've been having headaches for the past week — worse"
            " in the mornings. Should I be concerned?",
        ),
        (
            emily,
            _ago(days=2) + timedelta(minutes=30),
            "Morning headaches can have several causes. Are you"
            " well hydrated? Any changes in sleep or screen time"
            " recently?",
        ),
        (
            mark,
            _ago(days=2) + timedelta(hours=1),
            "Now that you mention it, I have been drinking less"
            " water and working longer hours at the computer.",
        ),
        (
            emily,
            _ago(days=2) + timedelta(minutes=90),
            "Try increasing your water intake to 2 litres a day"
            " and taking a 10-minute break from the screen each"
            " hour. If the headaches persist beyond a week of"
            " trying that, book in and we'll investigate further.",
        ),
        (mark, _ago(days=1), "Issue resolved, thank you"),
    ]
    for sender, ts, body in msgs:
        add_message(
            db, conversation=conv, sender=sender, body=body, created_at=ts
        )
    print(f"    {len(msgs)} messages added")


def main() -> int:
    """Seed all demo messaging data."""
    print("Seeding messaging conversations …")

    db = SessionLocal()
    try:
        # Check if messaging data already exists
        existing = db.query(Conversation).first()
        if existing:
            print("  Conversations already exist — skipping seed.")
            return 0

        # Look up the primary dev user (mark.bailey)
        mark = db.query(User).filter(User.username == "mark.bailey").first()
        if mark is None:
            print("  ✗ User mark.bailey not found — run create-user first.")
            return 1
        print(f"  = Using mark.bailey (id={mark.id}) as participant")

        # Fetch real FHIR patient IDs
        from app.fhir_client import get_fhir_client

        fhir = get_fhir_client()
        bundle = fhir.server.request_json("Patient?_count=10")
        entries = bundle.get("entry", [])
        if len(entries) < 4:
            print(
                f"  ✗ Need at least 4 FHIR patients, found {len(entries)}."
                " Run create-5-patients.sh first."
            )
            return 1

        patient_ids = [e["resource"]["id"] for e in entries[:4]]
        for i, pid in enumerate(patient_ids, 1):
            name = entries[i - 1]["resource"].get("name", [{}])[0]
            given = " ".join(name.get("given", []))
            family = name.get("family", "")
            print(f"  = Patient {i}: {pid} ({given} {family})")

        # Staff users
        emily = get_or_create_user(
            db,
            username="emily.williams",
            email="emily.williams@example.com",
        )
        gemma = get_or_create_user(
            db,
            username="gemma.corbett",
            email="gemma.corbett@example.com",
        )
        david = get_or_create_user(
            db,
            username="david.corbett",
            email="david.corbett@example.com",
        )
        lisa = get_or_create_user(
            db,
            username="lisa.taylor",
            email="lisa.taylor@example.com",
        )
        james = get_or_create_user(
            db,
            username="james.smith",
            email="james.smith@example.com",
        )

        seed_conversation_1(db, emily, mark, patient_ids[0])
        seed_conversation_2(db, gemma, david, mark, patient_ids[1])
        seed_conversation_3(db, lisa, james, mark, patient_ids[2])
        seed_conversation_4(db, emily, mark, patient_ids[3])

        db.commit()
        print("\n✓ Seeded 4 conversations successfully.")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"\n✗ Error: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
