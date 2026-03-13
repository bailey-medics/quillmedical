/**
 * Fake Clinical Notes Data
 *
 * Shared fake note data used by the PatientNotes page and NotesList
 * stories. Extracted to avoid react-refresh ESLint errors.
 */

import type { ClinicalNote } from "@/components/notes/NotesList";

export const fakeNotes: ClinicalNote[] = [
  {
    id: "note-1",
    title: "Gastro clinic consultation",
    date: "2026-03-19",
    author: "Dr Gareth Corbett",
    authorRole: "Consultant Gastroenterologist",
    category: "consultation",
    content:
      "S: Patient attends for initial gastro assessment. Reports 4-month history of intermittent epigastric discomfort, worse after eating, with associated bloating. Denies dysphagia, weight loss, haematemesis, melaena. No FHx of GI malignancy. Non-smoker, moderate alcohol intake (8 units/week).\n\nO: Abdo exam: soft, non-tender. No organomegaly. No masses palpable. Bowel sounds normal.\n\nA: Functional dyspepsia — likely dietary trigger component.\n\nP: 1. Omeprazole 20mg OD, 30 mins before breakfast. 2. Dietary modification — avoid known triggers (detailed guidance to follow via messaging). 3. Food diary for 14 days. 4. Review in 3 weeks. 5. If red flag symptoms develop, patient to contact clinic urgently.",
  },
  {
    id: "note-2",
    title: "Telephone consultation — dietary guidance follow-up",
    date: "2026-03-20",
    author: "Dr Gareth Corbett",
    authorRole: "Consultant Gastroenterologist",
    category: "telephone",
    content:
      "Patient messaged requesting dietary guidance following yesterday's clinic appointment. Personalised dietary guide provided via secure messaging. Advised to avoid: high-fat/fried foods, heavily spiced dishes, citrus, tomato-based sauces, raw onions, garlic, chocolate, peppermint, cruciferous vegetables if bloating occurs. Limit caffeine, alcohol (especially red wine), carbonated drinks. Keep structured food diary for 14 days. Continue omeprazole as prescribed. Charged £70 for additional consultation time — patient consented and paid via app.",
  },
  {
    id: "note-3",
    title: "GP review — epigastric symptoms",
    date: "2026-02-25",
    author: "Dr Emily Williams",
    authorRole: "General Practitioner",
    category: "consultation",
    content:
      "Patient presents with 4-month history of recurrent epigastric pain. Worse post-prandially. Tried over-the-counter antacids with partial relief. No red flag symptoms elicited. Examination: abdomen soft, non-tender, no masses. Decision: refer to gastroenterology for specialist opinion. Referral letter sent to Dr Corbett's clinic at Riverside Health Centre.",
  },
  {
    id: "note-4",
    title: "Annual health review",
    date: "2026-01-10",
    author: "Dr Emily Williams",
    authorRole: "General Practitioner",
    category: "consultation",
    content:
      "Routine annual review. Patient reports feeling generally well aside from intermittent indigestion (discussed separately). No new medications. Exercise: walks 30 mins x 4/week. Diet: balanced, though notes discomfort after certain meals.\n\nObservations: BP 124/78, HR 72 regular, BMI 26.2, SpO2 98%.\n\nBloods reviewed: FBC normal, U&E normal, LFTs normal, HbA1c 38 mmol/mol (normal), Total cholesterol 4.8 mmol/L (acceptable). No action required on bloods. Next review 12 months.",
  },
  {
    id: "note-5",
    title: "BP and weight check",
    date: "2025-10-15",
    author: "Nurse Sarah Mitchell",
    authorRole: "Practice Nurse",
    category: "observation",
    content:
      "Routine BP and weight monitoring. BP: 126/80 (within target). Weight: 82.4kg. BMI: 26.2. Patient reports no concerns. Advised to maintain current lifestyle. No further action required.",
  },
];
