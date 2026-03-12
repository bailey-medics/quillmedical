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
import { useParams } from "react-router-dom";

/**
 * Build fake conversation messages personalised with the patient's name.
 * Returns different threads depending on the conversation ID.
 */
function buildFakeMessages(
  conversationId: string,
  patientName: string,
  patientFirstName: string,
  patientGradientIndex: number,
): Message[] {
  const patientId = "current-patient";
  const patientMsg = (
    overrides: Partial<Message> & {
      id: string;
      text: string;
      timestamp: string;
    },
  ): Message => ({
    senderId: patientId,
    senderName: patientName,
    givenName: patientFirstName,
    familyName: patientName.split(" ").slice(1).join(" "),
    gradientIndex: patientGradientIndex,
    ...overrides,
  });

  if (conversationId === "gp-referral") {
    return [
      patientMsg({
        id: "ref1",
        text: "Hi, my GP mentioned they'd send a referral to a gastroenterology clinic. Has that come through yet?",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 21,
        ).toISOString(),
      }),
      {
        id: "ref2",
        senderId: "dr-patel",
        senderName: "GP — Dr Patel",
        givenName: "Raj",
        familyName: "Patel",
        gradientIndex: 8,
        text: `Hello ${patientFirstName}, yes I submitted the referral last Friday. It typically takes five to seven working days for the receiving clinic to process it and send you an appointment.`,
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 20,
        ).toISOString(),
      },
      patientMsg({
        id: "ref3",
        text: "Thanks for letting me know. Should I do anything in the meantime?",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 20 + 1000 * 60 * 30,
        ).toISOString(),
      }),
      {
        id: "ref4",
        senderId: "dr-patel",
        senderName: "GP — Dr Patel",
        givenName: "Raj",
        familyName: "Patel",
        gradientIndex: 8,
        text: `Continue with the omeprazole as prescribed and keep a note of any new symptoms. If anything worsens before your clinic appointment — particularly difficulty swallowing or unexplained weight loss — contact us straight away.`,
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 20 + 1000 * 60 * 60,
        ).toISOString(),
      },
      patientMsg({
        id: "ref5",
        text: "Will do. Just to confirm, the referral went to Dr Corbett's gastro clinic at Riverside Health Centre?",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 15,
        ).toISOString(),
      }),
      {
        id: "ref6",
        senderId: "dr-patel",
        senderName: "GP — Dr Patel",
        givenName: "Raj",
        familyName: "Patel",
        gradientIndex: 8,
        text: `That's correct. Dr Corbett's clinic at Riverside. They'll contact you directly with appointment details. I've also attached a copy of my referral letter to your records for reference.`,
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 14 + 1000 * 60 * 45,
        ).toISOString(),
      },
      patientMsg({
        id: "ref7",
        text: "That's great, thank you Dr Patel. I'll wait to hear from them.",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 14,
        ).toISOString(),
      }),
      {
        id: "ref8",
        senderId: "dr-patel",
        senderName: "GP — Dr Patel",
        givenName: "Raj",
        familyName: "Patel",
        gradientIndex: 8,
        text: "Your referral to the gastroenterology clinic has been processed. You should hear from them within the next few days. All the best.",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 14,
        ).toISOString(),
      },
    ];
  }

  if (conversationId === "prescription-query") {
    return [
      patientMsg({
        id: "rx1",
        text: "Hello, I need to renew my repeat prescription for omeprazole. Can I do that through here?",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 35,
        ).toISOString(),
      }),
      {
        id: "rx2",
        senderId: "reception-lisa",
        senderName: "Reception — Lisa Taylor",
        givenName: "Lisa",
        familyName: "Taylor",
        gradientIndex: 15,
        text: `Hello ${patientFirstName}, of course! I can see your omeprazole 20mg is on your repeat prescription list. I'll send it through to your nominated pharmacy now. Which pharmacy do you use?`,
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 35 + 1000 * 60 * 20,
        ).toISOString(),
      },
      patientMsg({
        id: "rx3",
        text: "Boots on the High Street, please.",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 35 + 1000 * 60 * 40,
        ).toISOString(),
      }),
      {
        id: "rx4",
        senderId: "reception-lisa",
        senderName: "Reception — Lisa Taylor",
        givenName: "Lisa",
        familyName: "Taylor",
        gradientIndex: 15,
        text: `That's confirmed as your nominated pharmacy. I've sent the prescription through — they usually have it ready within two to four hours. You'll get a text from them when it's ready to collect.`,
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 35 + 1000 * 60 * 55,
        ).toISOString(),
      },
      patientMsg({
        id: "rx5",
        text: "That's brilliant, thank you. One more thing — I think I only have one more repeat left on this prescription. Will I need to see the doctor before it can be extended?",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 34,
        ).toISOString(),
      }),
      {
        id: "rx6",
        senderId: "reception-lisa",
        senderName: "Reception — Lisa Taylor",
        givenName: "Lisa",
        familyName: "Taylor",
        gradientIndex: 15,
        text: `Good question. Looking at your record, your last medication review was eight months ago, so you'll need a review before we can authorise further repeats. I've booked you a telephone review with Dr Patel for next Tuesday at 11:15. Does that work?`,
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 34 + 1000 * 60 * 30,
        ).toISOString(),
      },
      patientMsg({
        id: "rx7",
        text: "That works perfectly. Thanks for sorting all of that out, Lisa.",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 30 + 1000 * 60 * 60,
        ).toISOString(),
      }),
      {
        id: "rx8",
        senderId: "reception-lisa",
        senderName: "Reception — Lisa Taylor",
        givenName: "Lisa",
        familyName: "Taylor",
        gradientIndex: 15,
        text: "Your repeat prescription has been sent to your nominated pharmacy. You're all sorted! Let us know if you need anything else.",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 30,
        ).toISOString(),
      },
    ];
  }

  // Default: gastro-clinic conversation
  return [
    patientMsg({
      id: "pm1",
      text: "Hello, I'd like to book in for Dr Corbett's gastro clinic please. My GP referred me a couple of weeks ago.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    }),
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
    patientMsg({
      id: "pm3",
      text: "That's perfect, thank you very much!",
      timestamp: new Date(
        Date.now() - 1000 * 60 * 60 * 24 * 10 + 1000 * 60 * 60,
      ).toISOString(),
    }),
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
    patientMsg({
      id: "pm6",
      text: "Hi, I had my appointment with Dr Corbett last week and he was very helpful. I have a quick question though — he mentioned that certain foods can trigger my symptoms. Could he provide a list of foods I should be avoiding? I forgot to ask at the time.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    }),
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
      givenName: "Gareth",
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
    patientMsg({
      id: "pm9",
      text: "Yes please, that would be really helpful. I've just made the payment through the app.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    }),
    {
      id: "pm10",
      senderId: "dr-corbett",
      senderName: "Gastroenterologist — Dr Corbett",
      givenName: "Gareth",
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
  const { conversationId } = useParams<{ conversationId: string }>();

  const currentUserId =
    state.status === "authenticated" ? state.user.id : "unknown";

  const patientName = patient?.name ?? "Patient";
  const patientFirstName = patient?.givenName ?? "Patient";
  const patientGradientIndex = patient?.gradientIndex ?? 0;

  const [messages, setMessages] = useState<Message[]>(
    buildFakeMessages(
      conversationId ?? "",
      patientName,
      patientFirstName,
      patientGradientIndex,
    ),
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
