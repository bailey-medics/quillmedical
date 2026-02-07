/**
 * Demo Messages Data
 *
 * Sample messages for use in messaging component stories and testing.
 * Includes helper function for generating realistic timestamps and a variety
 * of message types (sent/received, text/attachments).
 */

import type { Message } from "@/components/messaging/Messaging";

/**
 * Helper to produce reproducible demo timestamps.
 *
 * Generates ISO timestamp for specified days in the past plus optional offset.
 * Used to create consistent message timestamps across story renders.
 *
 * @param offsetMs - Milliseconds to offset from base time (default: 0)
 * @param daysAgo - Number of days before now (default: 1)
 * @returns ISO 8601 timestamp string
 */
const demoTimestamp = (offsetMs = 0, daysAgo = 1) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 + offsetMs).toISOString();

export const demoMessages: Message[] = [
  {
    id: "m1",
    senderId: "me",
    givenName: "Sarah",
    familyName: "Johnson",
    gradientIndex: 0,
    text: "Hello — I had a clinic earlier today. I've been getting more stomach pain and wondered if I should change my pain meds before my tests.",
    timestamp: demoTimestamp(),
  },
  {
    id: "m2",
    senderId: "admin",
    senderName: "Emma Williams - Clinic Admin",
    givenName: "Emma",
    familyName: "Williams",
    gradientIndex: 10,
    text: "Thanks for your message — a clinician will triage this and we'll update Dr Gareth if needed.",
    timestamp: demoTimestamp(60_000),
  },
  {
    id: "m3",
    senderId: "admin",
    senderName: "Emma Williams - Clinic Admin",
    givenName: "Emma",
    familyName: "Williams",
    gradientIndex: 10,
    text: "Triage note: ongoing abdominal pain post-consult, possible med query — please advise Dr Gareth.",
    timestamp: demoTimestamp(120_000),
  },
  {
    id: "m4",
    senderId: "doc",
    senderName: "Dr Gareth Davies - Gastroenterology",
    givenName: "Gareth",
    familyName: "Davies",
    gradientIndex: 5,
    text: "Received — forwarding to consultant. Can you provide the names of current medications and the timing of symptoms?",
    timestamp: demoTimestamp(180_000),
  },
  {
    id: "m5",
    senderId: "me",
    givenName: "Sarah",
    familyName: "Johnson",
    gradientIndex: 0,
    text: "I'm taking over-the-counter antacids and ibuprofen as needed; pain tends to be worse after meals.",
    timestamp: demoTimestamp(240_000),
  },
  {
    id: "m6",
    senderId: "doc",
    senderName: "Dr Gareth Davies - Gastroenterology",
    givenName: "Gareth",
    familyName: "Davies",
    gradientIndex: 5,
    text: "Thanks — please avoid ibuprofen until we complete the investigations as it can worsen GI symptoms. Continue antacids if needed but note any bleeding. We'll arrange bloods and stool and review results next week.",
    timestamp: demoTimestamp(300_000),
  },
  {
    id: "m7",
    senderId: "me",
    givenName: "Sarah",
    familyName: "Johnson",
    gradientIndex: 0,
    text: "Understood. Should I stop my regular blood pressure tablet?",
    timestamp: demoTimestamp(360_000),
  },
  {
    id: "m8",
    senderId: "doc",
    senderName: "Dr Gareth Davies - Gastroenterology",
    givenName: "Gareth",
    familyName: "Davies",
    gradientIndex: 5,
    text: "No, continue your regular prescribed meds unless advised by GP — only stop OTC NSAIDs like ibuprofen.",
    timestamp: demoTimestamp(420_000),
  },
  {
    id: "m9",
    senderId: "admin",
    senderName: "Emma Williams - Clinic Admin",
    givenName: "Emma",
    familyName: "Williams",
    gradientIndex: 10,
    text: "I've arranged bloods and stool sample kits; pickup scheduled for tomorrow.",
    timestamp: demoTimestamp(480_000),
  },
  {
    id: "m10",
    senderId: "me",
    givenName: "Sarah",
    familyName: "Johnson",
    gradientIndex: 0,
    text: "Thank you both — I appreciate the quick response.",
    timestamp: demoTimestamp(540_000),
  },
];

export default demoMessages;
