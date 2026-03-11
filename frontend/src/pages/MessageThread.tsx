/**
 * Message Thread Page
 *
 * Displays a single conversation thread with full message history and
 * a message input for sending new messages. Uses the conversation ID
 * from the route params to load the thread.
 */

import Messaging, { type Message } from "@/components/messaging/Messaging";
import PageHeader from "@/components/page-header";
import type { LayoutCtx } from "@/RootLayout";
import type { Patient } from "@domains/patient";
import { Badge, Button, Container, Group, Stack } from "@mantine/core";
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
        senderId: "me",
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
        senderId: "me",
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
        senderId: "me",
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
    status: "new",
    messages: [
      {
        id: "m1",
        senderId: "patient-2",
        senderName: "Mary Johnson",
        givenName: "Mary",
        familyName: "Johnson",
        gradientIndex: 4,
        text: "Hello, I need to schedule a follow-up appointment after my recent consultation. Dr Davies mentioned I should come back in two weeks.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
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
        senderName: "Reception - Clinic Admin",
        givenName: "Lisa",
        familyName: "Taylor",
        gradientIndex: 11,
        text: "Hello Robert, I've flagged your results for Dr Smith to review. He'll respond here once he's had a look.",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5.5).toISOString(),
      },
      {
        id: "m3",
        senderId: "me",
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
        senderId: "me",
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
        senderId: "me",
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

function getStatusColour(status: string): string {
  switch (status) {
    case "new":
      return "blue";
    case "active":
      return "green";
    case "resolved":
      return "gray";
    case "closed":
      return "dark";
    default:
      return "gray";
  }
}

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
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate("/messages")}
          style={{ alignSelf: "flex-start" }}
        >
          Back to messages
        </Button>

        <Group gap="sm">
          <PageHeader title={thread.patientName} size="lg" mb={0} />
          <Badge
            size="lg"
            color={getStatusColour(thread.status)}
            variant="light"
          >
            {thread.status}
          </Badge>
        </Group>

        <div style={{ height: "60vh" }}>
          <Messaging
            messages={messages}
            currentUserId="me"
            onSend={(text) =>
              setMessages((prev) => [
                ...prev,
                {
                  id: `new-${prev.length + 1}`,
                  senderId: "me",
                  givenName: "You",
                  familyName: "",
                  text,
                  timestamp: new Date().toISOString(),
                },
              ])
            }
          />
        </div>
      </Stack>
    </Container>
  );
}
