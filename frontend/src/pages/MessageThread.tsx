/**
 * Message Thread Page
 *
 * Displays a single conversation thread with full message history and
 * a message input for sending new messages. Uses the conversation ID
 * from the route params to load the thread.
 */

import { useAuth } from "@/auth/AuthContext";
import Messaging, { type Message } from "@/components/messaging/Messaging";
import PageHeader from "@/components/page-header";
import type { LayoutCtx } from "@/RootLayout";
import type { Patient } from "@domains/patient";
import { Button, Container, Stack } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";

/**
 * Fake thread data keyed by conversation ID.
 *
 * Each thread contains realistic clinical messages matching the
 * conversation stubs on the Messages list page.
 */
/**
 * Fake patient demographics for each conversation, used to populate the
 * top ribbon when viewing a message thread.
 */
const fakePatients: Record<string, Patient> = {
  "conv-1": {
    id: "patient-1",
    name: "John Smith",
    givenName: "John",
    familyName: "Smith",
    dob: "1978-04-12",
    age: 47,
    sex: "male",
    gradientIndex: 2,
  },
  "conv-2": {
    id: "patient-2",
    name: "Mary Johnson",
    givenName: "Mary",
    familyName: "Johnson",
    dob: "1985-09-03",
    age: 40,
    sex: "female",
    gradientIndex: 4,
  },
  "conv-3": {
    id: "patient-3",
    name: "Robert Brown",
    givenName: "Robert",
    familyName: "Brown",
    dob: "1962-11-28",
    age: 63,
    sex: "male",
    gradientIndex: 9,
  },
  "conv-4": {
    id: "patient-4",
    name: "Sarah Davis",
    givenName: "Sarah",
    familyName: "Davis",
    dob: "1991-06-17",
    age: 34,
    sex: "female",
    gradientIndex: 1,
  },
};

const fakeThreads: Record<
  string,
  { patientName: string; status: string; messages: Message[] }
> = {
  "conv-1": {
    patientName: "John Smith",
    status: "active",
    messages: [
      {
        id: "m1",
        senderId: "patient-1",
        senderName: "John Smith",
        givenName: "John",
        familyName: "Smith",
        gradientIndex: 2,
        text: "Hi, I wanted to check on my prescription renewal — it's due in a few days and I'd like to make sure there aren't any changes.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      },
      {
        id: "m2",
        senderId: "dr-emily",
        senderName: "GP — Emily Williams",
        givenName: "Emily",
        familyName: "Williams",
        gradientIndex: 7,
        text: "Hello John. Let me pull up your records — which medication is it?",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2.5).toISOString(),
      },
      {
        id: "m3",
        senderId: "patient-1",
        senderName: "John Smith",
        givenName: "John",
        familyName: "Smith",
        gradientIndex: 2,
        text: "It's the Amlodipine 5mg for blood pressure. I've been taking it for about six months now.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      },
      {
        id: "m4",
        senderId: "dr-emily",
        senderName: "GP — Emily Williams",
        givenName: "Emily",
        familyName: "Williams",
        gradientIndex: 7,
        text: "I can see your prescription here. Your last BP reading was 128/82 which is well controlled. I'll renew the Amlodipine for another three months — no changes needed.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 1.5).toISOString(),
      },
      {
        id: "m5",
        senderId: "patient-1",
        senderName: "John Smith",
        givenName: "John",
        familyName: "Smith",
        gradientIndex: 2,
        text: "That's great news. Should I still come in for a check-up soon?",
        timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      },
      {
        id: "m6",
        senderId: "dr-emily",
        senderName: "GP — Emily Williams",
        givenName: "Emily",
        familyName: "Williams",
        gradientIndex: 7,
        text: "Yes, let's schedule a routine review in about four weeks. The admin team will send you appointment options.",
        timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      },
      {
        id: "m7",
        senderId: "patient-1",
        senderName: "John Smith",
        givenName: "John",
        familyName: "Smith",
        gradientIndex: 2,
        text: "Thank you for your help with my prescription",
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
    ],
  },
  "conv-2": {
    patientName: "Mary Johnson",
    status: "active",
    messages: [
      {
        id: "m1",
        senderId: "patient-2",
        senderName: "Mary Johnson",
        givenName: "Mary",
        familyName: "Johnson",
        gradientIndex: 4,
        text: "Hello, I'd like to book in for Dr Corbett's gastro clinic please. My GP referred me a couple of weeks ago.",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 10,
        ).toISOString(),
      },
      {
        id: "m2",
        senderId: "admin-gemma",
        senderName: "Administrator — Gemma Corbett",
        givenName: "Gemma",
        familyName: "Corbett",
        gradientIndex: 11,
        text: "Hello Mary, I can see your referral. Dr Corbett has availability on Wednesday 19 March at 10:30 at Riverside Health Centre, Room 4. Would that suit you?",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 10 + 1000 * 60 * 45,
        ).toISOString(),
      },
      {
        id: "m3",
        senderId: "patient-2",
        senderName: "Mary Johnson",
        givenName: "Mary",
        familyName: "Johnson",
        gradientIndex: 4,
        text: "That's perfect, thank you very much!",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 10 + 1000 * 60 * 60,
        ).toISOString(),
      },
      {
        id: "m4",
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
        id: "m5",
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
        id: "m6",
        senderId: "patient-2",
        senderName: "Mary Johnson",
        givenName: "Mary",
        familyName: "Johnson",
        gradientIndex: 4,
        text: "Hi, I had my appointment with Dr Corbett last week and he was very helpful. I have a quick question though — he mentioned that certain foods can trigger my symptoms. Could he provide a list of foods I should be avoiding? I forgot to ask at the time.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      },
      {
        id: "m7",
        senderId: "admin-gemma",
        senderName: "Administrator — Gemma Corbett",
        givenName: "Gemma",
        familyName: "Corbett",
        gradientIndex: 11,
        text: "Hello Mary, that's a clinical question so I'll need to pass it to Dr Corbett directly. I've flagged it for him and he'll respond here.",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 30,
        ).toISOString(),
      },
      {
        id: "m8",
        senderId: "dr-corbett",
        senderName: "Gastroenterologist — Dr Corbett",
        givenName: "David",
        familyName: "Corbett",
        gradientIndex: 5,
        text: "Hello Mary, Gemma's passed your question on to me. I'm happy to put together a personalised dietary guide for you — it'll take me about 12 minutes to review your notes and write it up. As this falls outside your original appointment, there would be a charge of £70 for the additional consultation time. Would you like to go ahead?",
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
        id: "m9",
        senderId: "patient-2",
        senderName: "Mary Johnson",
        givenName: "Mary",
        familyName: "Johnson",
        gradientIndex: 4,
        text: "Yes please, that would be really helpful. I've just made the payment through the app.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      },
      {
        id: "m10",
        senderId: "dr-corbett",
        senderName: "Gastroenterologist — Dr Corbett",
        givenName: "David",
        familyName: "Corbett",
        gradientIndex: 5,
        text: "Thank you Mary, payment received. I've reviewed your case notes and endoscopy findings from your appointment. Given your presentation of functional dyspepsia with suspected dietary triggers, I'd recommend the following:\n\n1. **Foods to avoid:** High-fat and deep-fried foods, heavily spiced dishes (particularly chilli, black pepper, and paprika), citrus fruits and juices, tomato-based sauces, raw onions, garlic, chocolate, peppermint, and cruciferous vegetables such as broccoli and cauliflower if they provoke bloating.\n\n2. **Drinks to limit or avoid:** Caffeine (coffee, strong tea, energy drinks), alcohol (especially red wine and spirits), carbonated beverages, and highly acidic fruit juices.\n\n3. **Eating habits:** Eat smaller, more frequent meals rather than large portions. Avoid eating within three hours of lying down. Chew thoroughly and eat slowly — rushing meals increases aerophagia and gastric distension.\n\n4. **Food diary:** Please keep a structured food diary for the next 14 days, noting everything you eat and drink alongside any symptoms (timing, severity 1–10, and duration). This will help us identify your specific triggers rather than relying on generalised guidance.\n\n5. **Medication:** Continue with the omeprazole 20mg once daily, taken 30 minutes before breakfast. If symptoms are not adequately controlled after two weeks of dietary adjustment, we may consider switching to esomeprazole or adding a prokinetic agent.\n\nIf your symptoms worsen — particularly if you experience unintentional weight loss, dysphagia, persistent vomiting, or any blood in your stool — please contact the clinic immediately as these would warrant further investigation.\n\nI'll ask Gemma to schedule a follow-up review in three weeks so we can assess your progress with the dietary changes. Take care.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
      },
    ],
  },
  "conv-3": {
    patientName: "Robert Brown",
    status: "active",
    messages: [
      {
        id: "m1",
        senderId: "patient-3",
        senderName: "Robert Brown",
        givenName: "Robert",
        familyName: "Brown",
        gradientIndex: 9,
        text: "Hi, I received a notification that my blood test results are ready. Could someone go through them with me?",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
      },
      {
        id: "m2",
        senderId: "admin-1",
        senderName: "Reception — Lisa Taylor",
        givenName: "Lisa",
        familyName: "Taylor",
        gradientIndex: 11,
        text: "Hello Robert, I've flagged your results for Dr Smith to review. He'll respond here once he's had a look.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5.5).toISOString(),
      },
      {
        id: "m3",
        senderId: "dr-james",
        senderName: "GP — James Smith",
        givenName: "James",
        familyName: "Smith",
        gradientIndex: 3,
        text: "Robert, I've reviewed your bloods. Most values are within normal range. Your cholesterol is slightly elevated at 5.4 mmol/L — we should discuss dietary adjustments at your next appointment.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      },
      {
        id: "m4",
        senderId: "patient-3",
        senderName: "Robert Brown",
        givenName: "Robert",
        familyName: "Brown",
        gradientIndex: 9,
        text: "My test results came back, what should I do next?",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      },
    ],
  },
  "conv-4": {
    patientName: "Sarah Davis",
    status: "resolved",
    messages: [
      {
        id: "m1",
        senderId: "patient-4",
        senderName: "Sarah Davis",
        givenName: "Sarah",
        familyName: "Davis",
        gradientIndex: 1,
        text: "I've been having headaches for the past week — worse in the mornings. Should I be concerned?",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      },
      {
        id: "m2",
        senderId: "dr-emily",
        senderName: "GP — Emily Williams",
        givenName: "Emily",
        familyName: "Williams",
        gradientIndex: 7,
        text: "Morning headaches can have several causes. Are you well hydrated? Any changes in sleep or screen time recently?",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 30,
        ).toISOString(),
      },
      {
        id: "m3",
        senderId: "patient-4",
        senderName: "Sarah Davis",
        givenName: "Sarah",
        familyName: "Davis",
        gradientIndex: 1,
        text: "Now that you mention it, I have been drinking less water and working longer hours at the computer.",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 60,
        ).toISOString(),
      },
      {
        id: "m4",
        senderId: "dr-emily",
        senderName: "GP — Emily Williams",
        givenName: "Emily",
        familyName: "Williams",
        gradientIndex: 7,
        text: "Try increasing your water intake to 2 litres a day and taking a 10-minute break from the screen each hour. If the headaches persist beyond a week of trying that, book in and we'll investigate further.",
        timestamp: new Date(
          Date.now() - 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 90,
        ).toISOString(),
      },
      {
        id: "m5",
        senderId: "patient-4",
        senderName: "Sarah Davis",
        givenName: "Sarah",
        familyName: "Davis",
        gradientIndex: 1,
        text: "Issue resolved, thank you",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      },
    ],
  },
};

/**
 * Message Thread Page
 *
 * Displays a full conversation thread for a given conversation ID taken
 * from the route params. Uses fake data for now.
 *
 * @example
 * <Route path="/messages/:conversationId" element={<MessageThread />} />
 */
export default function MessageThread() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { setPatient } = useOutletContext<LayoutCtx>();
  const { state } = useAuth();

  const currentUserId =
    state.status === "authenticated" ? state.user.id : "unknown";

  const thread = conversationId ? fakeThreads[conversationId] : undefined;
  const patient = conversationId ? fakePatients[conversationId] : undefined;

  const [messages, setMessages] = useState<Message[]>(thread?.messages ?? []);

  // Populate the top ribbon with patient details
  useEffect(() => {
    setPatient(patient ?? null);
    return () => {
      setPatient(null);
    };
  }, [patient, setPatient]);

  if (!thread) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => navigate("/messages")}
          >
            Back to messages
          </Button>
          <PageHeader
            title="Conversation not found"
            description="This conversation does not exist or has been removed."
            size="md"
          />
        </Stack>
      </Container>
    );
  }

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
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate("/messages")}
          style={{ alignSelf: "flex-start" }}
        >
          Back to messages
        </Button>

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
            onAction={(messageId, actionValue) => {
              // Remove action buttons from the message after clicking
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === messageId ? { ...msg, actions: undefined } : msg,
                ),
              );
              // TODO: send action to API

              console.log("Action:", messageId, actionValue);
            }}
          />
        </div>
      </Stack>
    </Container>
  );
}
