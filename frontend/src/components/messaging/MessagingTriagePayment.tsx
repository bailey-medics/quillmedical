/**
 * Messaging Triage Payment Component
 *
 * Complex demonstration component showing full messaging workflow with:
 * - Patient messaging interface
 * - Administrator triage controls
 * - Clinician assignment
 * - Time estimation and quotes
 * - Payment calculation
 * - State transitions (NEW → ADMIN_REVIEW → ASSIGNED → QUOTED → etc.)
 *
 * Used in Storybook to demonstrate complete messaging and billing workflow.
 */

import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import Messaging, { type Message } from "./Messaging";

/**
 * MessagingTriagePayment Props
 */
type Props = {
  /** Patient identifier */
  patientId?: string;
  /** Initial messages for conversation */
  initialMessages?: Message[];
  /** Clinic hourly rate in cents (default: 12000 = $120/hour) */
  perHourRateCents?: number;
};

/**
 * Messaging Triage Payment
 *
 * Demonstrates complete messaging workflow from patient inquiry through
 * triage, assignment, time estimation, quote generation, and payment.
 * Shows role-based UI (patient, admin, clinician views).
 *
 * @param props - Component props
 * @returns Interactive messaging workflow demo
 */
export default function MessagingTriagePayment({
  patientId = "patient-1",
  initialMessages = [],
  perHourRateCents = 12000, // $120/hour default
}: Props) {
  const [messages, setMessages] = useState<Message[]>([
    ...initialMessages,
    {
      id: "1",
      senderId: patientId,
      senderName: "You",
      text: "Hi — when is my colonoscopy appointment?",
      timestamp: new Date().toISOString(),
    },
  ]);

  const [role, setRole] = useState<"patient" | "admin" | "clinician">(
    "patient",
  );
  const [input, setInput] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);

  const [offer, setOffer] = useState<{
    minutes: number;
    priceCents: number;
    clinicianId: string;
    status: "pending" | "accepted" | "declined";
  } | null>(null);

  function pushMessage(m: Omit<Message, "id">) {
    setMessages((prev) => [...prev, { id: String(prev.length + 1), ...m }]);
  }

  function sendAsRole(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (role === "patient") {
      pushMessage({
        senderId: patientId,
        senderName: "You",
        text: trimmed,
        timestamp: new Date().toISOString(),
      });
      pushMessage({
        senderId: "system",
        senderName: "System",
        text: "Sent to triage",
        timestamp: new Date().toISOString(),
      });
    }

    if (role === "admin") {
      const tag = trimmed.match(/@([\w.]+)/);
      if (tag) {
        const name = tag[1];
        setAssignedTo(name);
        pushMessage({
          senderId: "admin-1",
          senderName: "Reception",
          text: `@${name} please review this.`,
          timestamp: new Date().toISOString(),
        });
        pushMessage({
          senderId: "system",
          senderName: "System",
          text: `Assigned to ${name}`,
          timestamp: new Date().toISOString(),
        });
      } else {
        pushMessage({
          senderId: "admin-1",
          senderName: "Reception",
          text: trimmed,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (role === "clinician") {
      // clinician can post an offer using "/<minutes>" syntax
      const offerMatch = trimmed.match(/^\/(\d+)$/);
      if (offerMatch) {
        const minutes = Number(offerMatch[1]);
        const price = Math.round((minutes / 60) * perHourRateCents);
        setOffer({
          minutes,
          priceCents: price,
          clinicianId: "clinician-1",
          status: "pending",
        });
        pushMessage({
          senderId: "clinician-1",
          senderName: "Dr. Clinician",
          text: `Offer created: ${minutes} minutes — $${(price / 100).toFixed(
            2,
          )} (patient must accept).`,
          timestamp: new Date().toISOString(),
        });
        pushMessage({
          senderId: "system",
          senderName: "System",
          text: `Offer pending: ${minutes} minutes ($${(price / 100).toFixed(2)})`,
          timestamp: new Date().toISOString(),
        });
      } else {
        pushMessage({
          senderId: "clinician-1",
          senderName: "Dr. Clinician",
          text: trimmed,
          timestamp: new Date().toISOString(),
        });
      }
    }

    setInput("");
  }

  function patientAcceptOffer() {
    if (!offer) return;
    setOffer((o) => (o ? { ...o, status: "accepted" } : o));
    pushMessage({
      senderId: "system",
      senderName: "System",
      text: `Patient accepted offer — payment simulated.`,
      timestamp: new Date().toISOString(),
    });
    setTimeout(() => {
      pushMessage({
        senderId: "clinician-1",
        senderName: "Dr. Clinician",
        text: `Thanks — I've reviewed and here's the answer: your appointment is on 2025-10-01 at 10:30.`,
        timestamp: new Date().toISOString(),
      });
      setOffer(null);
    }, 900);
  }

  function patientDeclineOffer() {
    if (!offer) return;
    setOffer((o) => (o ? { ...o, status: "declined" } : o));
    pushMessage({
      senderId: "system",
      senderName: "System",
      text: `Patient declined the offer.`,
      timestamp: new Date().toISOString(),
    });
  }

  return (
    <Box
      style={{
        border: "1px solid #e6e6e6",
        borderRadius: 8,
        overflow: "hidden",
        height: 640,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box style={{ padding: "0.75rem", borderBottom: "1px solid #eee" }}>
        <Box
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Title order={4}>Messaging — Inline Triage & Offer Demo</Title>
          <Badge color="gray">Assigned: {assignedTo ?? "triage"}</Badge>
        </Box>
      </Box>

      <Box style={{ flex: 1, padding: "0.75rem" }}>
        <Messaging messages={messages} currentUserId={patientId} />
      </Box>

      <Box style={{ padding: "0.75rem", borderTop: "1px solid #eee" }}>
        <Box style={{ marginBottom: 8 }}>
          <Group gap="xs">
            <Button
              variant={role === "patient" ? "filled" : "outline"}
              onClick={() => setRole("patient")}
            >
              Patient
            </Button>
            <Button
              variant={role === "admin" ? "filled" : "outline"}
              onClick={() => setRole("admin")}
            >
              Admin
            </Button>
            <Button
              variant={role === "clinician" ? "filled" : "outline"}
              onClick={() => setRole("clinician")}
            >
              Clinician
            </Button>
          </Group>
        </Box>
        <Text size="xs" color="dimmed" mb={6}>
          Sending as: {role}
        </Text>

        <Group>
          <TextInput
            placeholder={
              role === "clinician"
                ? "Type /12 to offer 12 minutes, or message normally"
                : role === "admin"
                  ? "Type a reply or @Gareth.Corben to tag"
                  : "Ask your question"
            }
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button onClick={() => sendAsRole(input)}>Send</Button>
        </Group>

        {offer && offer.status === "pending" && (
          <Box mt={12}>
            <Alert title="Offer pending" color="blue">
              Offer: {offer.minutes} minutes —{" "}
              <strong>${(offer.priceCents / 100).toFixed(2)}</strong>
              <Group mt={8}>
                <Button onClick={patientAcceptOffer}>
                  Accept & Pay (simulate)
                </Button>
                <Button
                  variant="outline"
                  color="red"
                  onClick={patientDeclineOffer}
                >
                  Decline
                </Button>
              </Group>
            </Alert>
          </Box>
        )}
      </Box>
    </Box>
  );
}
<Alert title="Processing payment" color="yellow">
  Simulating payment...
</Alert>;
