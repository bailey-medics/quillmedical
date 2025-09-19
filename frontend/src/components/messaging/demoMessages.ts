import type { Message } from "./Messaging";

export const demoMessages: Message[] = [
  {
    id: "m1",
    senderId: "me",
    text: "Hello — I had a clinic earlier today. I've been getting more stomach pain and wondered if I should change my pain meds before my tests.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "m2",
    senderId: "admin",
    senderName: "Clinic Admin",
    text: "Thanks for your message — a clinician will triage this and we'll update Dr Gareth if needed.",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 + 60000).toISOString(),
  },
  {
    id: "m3",
    senderId: "admin",
    senderName: "Clinic Admin",
    text: "Triage note: ongoing abdominal pain post-consult, possible med query — please advise Dr Gareth.",
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 24 + 120000
    ).toISOString(),
  },
  {
    id: "m4",
    senderId: "doc",
    senderName: "Dr Gareth (Gastroenterology)",
    text: "Received — forwarding to consultant. Can you provide the names of current medications and the timing of symptoms?",
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 24 + 180000
    ).toISOString(),
  },
  {
    id: "m5",
    senderId: "me",
    text: "I'm taking over-the-counter antacids and ibuprofen as needed; pain tends to be worse after meals.",
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 24 + 240000
    ).toISOString(),
  },
  {
    id: "m6",
    senderId: "doc",
    senderName: "Dr Gareth (Gastroenterology)",
    text: "Thanks — please avoid ibuprofen until we complete the investigations as it can worsen GI symptoms. Continue antacids if needed but note any bleeding. We'll arrange bloods and stool and review results next week.",
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 24 + 300000
    ).toISOString(),
  },
  {
    id: "m7",
    senderId: "me",
    text: "Understood. Should I stop my regular blood pressure tablet?",
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 24 + 360000
    ).toISOString(),
  },
  {
    id: "m8",
    senderId: "doc",
    senderName: "Dr Gareth (Gastroenterology)",
    text: "No, continue your regular prescribed meds unless advised by GP — only stop OTC NSAIDs like ibuprofen.",
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 24 + 420000
    ).toISOString(),
  },
  {
    id: "m9",
    senderId: "admin",
    senderName: "Clinic Admin",
    text: "I've arranged bloods and stool sample kits; pickup scheduled for tomorrow.",
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 24 + 480000
    ).toISOString(),
  },
  {
    id: "m10",
    senderId: "me",
    text: "Thank you both — I appreciate the quick response.",
    timestamp: new Date(
      Date.now() - 1000 * 60 * 60 * 24 + 540000
    ).toISOString(),
  },
];

export default demoMessages;
