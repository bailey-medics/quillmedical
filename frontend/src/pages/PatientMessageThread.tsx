/**
 * Patient Message Thread Page
 *
 * Displays a single messaging thread for a specific patient, accessed from
 * the patient messages list. Uses the patient data from the ribbon context
 * to personalise the conversation. Currently uses fake data adapted from
 * the Dr Corbett gastro clinic conversation.
 */

import { useAuth } from "@/auth/AuthContext";
import Messaging, { type Message } from "@/components/messaging/Messaging";
import { usePatientLoader } from "@/hooks/usePatientLoader";
import { Container, Stack } from "@mantine/core";
import { useState } from "react";

/**
 * Build fake conversation messages personalised with the patient's name.
 * Uses the Dr Corbett gastro clinic scenario.
 */
function buildFakeMessages(
  patientName: string,
  patientFirstName: string,
  patientGradientIndex: number,
): Message[] {
  const patientId = "current-patient";
  return [
    {
      id: "pm1",
      senderId: patientId,
      senderName: patientName,
      givenName: patientFirstName,
      familyName: patientName.split(" ").slice(1).join(" "),
      gradientIndex: patientGradientIndex,
      text: "Hello, I'd like to book in for Dr Corbett's gastro clinic please. My GP referred me a couple of weeks ago.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    },
    {
      id: "pm2",
      senderId: "admin-gemma",
      senderName: "Administrator — Gemma Corbett",
      givenName: "Gemma",
      familyName: "Corbett",
      gradientIndex: 11,
      text: `Hello ${patientFirstName}, I can see your referral. Dr Corbett has availability on Wednesday 19 March at 10:30 at Riverside Health Centre, Room 4. Would that suit you?`,
      timestamp: new Date(
        Date.now() - 1000 * 60 * 60 * 24 * 10 + 1000 * 60 * 45,
      ).toISOString(),
    },
    {
      id: "pm3",
      senderId: patientId,
      senderName: patientName,
      givenName: patientFirstName,
      familyName: patientName.split(" ").slice(1).join(" "),
      gradientIndex: patientGradientIndex,
      text: "That's perfect, thank you very much!",
      timestamp: new Date(
        Date.now() - 1000 * 60 * 60 * 24 * 10 + 1000 * 60 * 60,
      ).toISOString(),
    },
    {
      id: "pm4",
      senderId: "admin-gemma",
      senderName: "Administrator — Gemma Corbett",
      givenName: "Gemma",
      familyName: "Corbett",
      gradientIndex: 11,
      text: "Lovely, you're all booked in for the gastro clinic. You'll receive a reminder closer to the date.",
      timestamp: new Date(
        Date.now() - 1000 * 60 * 60 * 24 * 10 + 1000 * 60 * 75,
      ).toISOString(),
    },
    {
      id: "pm5",
      senderId: "system",
      senderName: "Appointment reminder — Quill System",
      givenName: "Quill",
      familyName: "System",
      gradientIndex: 0,
      text: "Reminder: You have a gastro clinic appointment tomorrow, Wednesday 19 March at 10:30 at Riverside Health Centre, Room 4. Please do attend — if you can no longer make it, let us know so we can offer the slot to another patient.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
      actions: [
        {
          label: "I'll attend",
          value: "confirm-attendance",
          variant: "filled",
          color: "green",
        },
        {
          label: "I can't make it",
          value: "cancel-attendance",
          variant: "outline",
          color: "red",
        },
      ],
    },
    {
      id: "pm6",
      senderId: patientId,
      senderName: patientName,
      givenName: patientFirstName,
      familyName: patientName.split(" ").slice(1).join(" "),
      gradientIndex: patientGradientIndex,
      text: "Hi, I had my appointment with Dr Corbett last week and he was very helpful. I have a quick question though — he mentioned that certain foods can trigger my symptoms. Could he provide a list of foods I should be avoiding? I forgot to ask at the time.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    },
    {
      id: "pm7",
      senderId: "admin-gemma",
      senderName: "Administrator — Gemma Corbett",
      givenName: "Gemma",
      familyName: "Corbett",
      gradientIndex: 11,
      text: `Hello ${patientFirstName}, that's a clinical question so I'll need to pass it to Dr Corbett directly. I've flagged it for him and he'll respond here.`,
      timestamp: new Date(
        Date.now() - 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 30,
      ).toISOString(),
    },
    {
      id: "pm8",
      senderId: "dr-corbett",
      senderName: "Gastroenterologist — Dr Corbett",
      givenName: "David",
      familyName: "Corbett",
      gradientIndex: 5,
      text: `Hello ${patientFirstName}, Gemma's passed your question on to me. I'm happy to put together a personalised dietary guide for you — it'll take me about 12 minutes to review your notes and write it up. As this falls outside your original appointment, there would be a charge of £70 for the additional consultation time. Would you like to go ahead?`,
      timestamp: new Date(
        Date.now() - 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 60,
      ).toISOString(),
      actions: [
        {
          label: "Yes, please go ahead",
          value: "accept-charge",
          variant: "filled",
          color: "green",
        },
        {
          label: "No thanks",
          value: "decline-charge",
          variant: "outline",
          color: "gray",
        },
      ],
    },
    {
      id: "pm9",
      senderId: patientId,
      senderName: patientName,
      givenName: patientFirstName,
      familyName: patientName.split(" ").slice(1).join(" "),
      gradientIndex: patientGradientIndex,
      text: "Yes please, that would be really helpful. I've just made the payment through the app.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
    {
      id: "pm10",
      senderId: "dr-corbett",
      senderName: "Gastroenterologist — Dr Corbett",
      givenName: "David",
      familyName: "Corbett",
      gradientIndex: 5,
      text: `Thank you ${patientFirstName}, payment received. I've reviewed your case notes and endoscopy findings from your appointment. Given your presentation of functional dyspepsia with suspected dietary triggers, I'd recommend the following:\n\n1. **Foods to avoid:** High-fat and deep-fried foods, heavily spiced dishes (particularly chilli, black pepper, and paprika), citrus fruits and juices, tomato-based sauces, raw onions, garlic, chocolate, peppermint, and cruciferous vegetables such as broccoli and cauliflower if they provoke bloating.\n\n2. **Drinks to limit or avoid:** Caffeine (coffee, strong tea, energy drinks), alcohol (especially red wine and spirits), carbonated beverages, and highly acidic fruit juices.\n\n3. **Eating habits:** Eat smaller, more frequent meals rather than large portions. Avoid eating within three hours of lying down. Chew thoroughly and eat slowly — rushing meals increases aerophagia and gastric distension.\n\n4. **Food diary:** Please keep a structured food diary for the next 14 days, noting everything you eat and drink alongside any symptoms (timing, severity 1–10, and duration). This will help us identify your specific triggers rather than relying on generalised guidance.\n\n5. **Medication:** Continue with the omeprazole 20mg once daily, taken 30 minutes before breakfast. If symptoms are not adequately controlled after two weeks of dietary adjustment, we may consider switching to esomeprazole or adding a prokinetic agent.\n\nIf your symptoms worsen — particularly if you experience unintentional weight loss, dysphagia, persistent vomiting, or any blood in your stool — please contact the clinic immediately as these would warrant further investigation.\n\nI'll ask Gemma to schedule a follow-up review in three weeks so we can assess your progress with the dietary changes. Take care.`,
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
    },
  ];
}

export default function PatientMessageThread() {
  const { patient } = usePatientLoader();
  const { state } = useAuth();

  const currentUserId =
    state.status === "authenticated" ? state.user.id : "unknown";

  const patientName = patient?.name ?? "Patient";
  const patientFirstName = patient?.givenName ?? "Patient";
  const patientGradientIndex = patient?.gradientIndex ?? 0;

  const [messages, setMessages] = useState<Message[]>(
    buildFakeMessages(patientName, patientFirstName, patientGradientIndex),
  );

  return (
    <Container
      size="lg"
      pt="xs"
      pb={0}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <Messaging
            messages={messages}
            currentUserId={currentUserId}
            onSend={(text) =>
              setMessages((prev) => [
                ...prev,
                {
                  id: `new-${prev.length + 1}`,
                  senderId: currentUserId,
                  givenName:
                    state.status === "authenticated"
                      ? (state.user.name?.split(" ")[0] ?? "You")
                      : "You",
                  familyName:
                    state.status === "authenticated"
                      ? (state.user.name?.split(" ").slice(1).join(" ") ?? "")
                      : "",
                  text,
                  timestamp: new Date().toISOString(),
                },
              ])
            }
            onAction={(messageId) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === messageId ? { ...msg, actions: undefined } : msg,
                ),
              );
            }}
          />
        </div>
      </Stack>
    </Container>
  );
}
