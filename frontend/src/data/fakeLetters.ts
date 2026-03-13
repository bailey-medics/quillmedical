/**
 * Fake Clinical Letters Data
 *
 * Shared fake letter data used by PatientLetters list and PatientLetterView
 * detail pages. Extracted to its own file to satisfy the react-refresh
 * ESLint rule (component files must only export components).
 */

export type ClinicalLetter = {
  id: string;
  title: string;
  date: string;
  author: string;
  authorRole: string;
  status: "final" | "draft" | "amended";
  summary: string;
  body: string;
};

export const fakeLetters: ClinicalLetter[] = [
  {
    id: "letter-1",
    title: "Gastroenterology outpatient clinic letter",
    date: "2026-03-19",
    author: "Dr Gareth Corbett",
    authorRole: "Consultant Gastroenterologist",
    status: "final",
    summary:
      "Dear Dr Williams, Thank you for referring this patient to the gastroenterology outpatient clinic. I saw them on 19 March 2026 at Riverside Health Centre. Presenting complaint: Recurrent epigastric discomfort and bloating over the past four months. Symptoms are worse after meals, particularly with spicy or fatty foods\u2026",
    body: `Dear Dr Williams,

Thank you for referring this patient to the gastroenterology outpatient clinic. I saw them on 19 March 2026 at Riverside Health Centre.

Presenting complaint:
Recurrent epigastric discomfort and bloating over the past four months. Symptoms are worse after meals, particularly with spicy or fatty foods. The patient describes a burning sensation in the upper abdomen with associated early satiety and occasional nausea. No dysphagia, odynophagia, haematemesis, melaena, or unintentional weight loss reported.

Past medical history:
Nil significant. No previous gastrointestinal investigations.

Medications:
Antacids (over-the-counter) \u2014 partial relief only.

Examination:
Abdomen soft, non-tender. No organomegaly or masses palpable. Bowel sounds normal. No signs of anaemia or jaundice.

Impression:
Functional dyspepsia \u2014 likely acid-related. No red flag symptoms to suggest serious pathology at this stage.

Plan:
1. Commence omeprazole 20mg once daily, taken 30 minutes before breakfast.
2. Dietary modification advice given \u2014 avoid known triggers (spicy foods, caffeine, alcohol, fatty meals). Patient to keep a food diary for 14 days.
3. Follow-up in 3 weeks to review response to PPI therapy.
4. If symptoms fail to improve, will arrange upper GI endoscopy (OGD) for further evaluation.

Kind regards,
Dr Gareth Corbett
Consultant Gastroenterologist
Riverside Health Centre`,
  },
  {
    id: "letter-2",
    title: "GP referral letter \u2014 gastroenterology",
    date: "2026-02-25",
    author: "Dr Emily Williams",
    authorRole: "General Practitioner",
    status: "final",
    summary:
      "Dear Dr Corbett, I would be grateful if you could see this patient in your gastroenterology clinic at your earliest convenience. Reason for referral: Four-month history of intermittent epigastric pain, worse after meals, associated with bloating and early satiety. No weight loss, dysphagia, or gastrointestinal bleeding\u2026",
    body: `Dear Dr Corbett,

I would be grateful if you could see this patient in your gastroenterology clinic at your earliest convenience.

Reason for referral:
Four-month history of intermittent epigastric pain, worse after meals, associated with bloating and early satiety. No weight loss, dysphagia, or gastrointestinal bleeding. The patient has tried over-the-counter antacids with partial relief only.

Relevant history:
No significant past medical history. No family history of gastrointestinal malignancy. Non-smoker. Alcohol intake within recommended limits. No NSAID use.

Investigations to date:
Full blood count \u2014 normal. No anaemia.
Liver function tests \u2014 within normal limits.
H. pylori stool antigen \u2014 awaiting result (will forward when available).

Current medications:
Nil regular. Over-the-counter antacids as required.

I would be grateful for your assessment and any further investigation you feel appropriate. The patient is aware of the referral and keen to attend promptly.

With best wishes,
Dr Emily Williams
General Practitioner
Riverside Medical Practice`,
  },
  {
    id: "letter-3",
    title: "Routine health review letter",
    date: "2026-01-10",
    author: "Dr Emily Williams",
    authorRole: "General Practitioner",
    status: "final",
    summary:
      "Dear Patient, Thank you for attending your annual routine health review on 10 January 2026. Observations: Blood pressure: 124/78 mmHg (normal). BMI: 26.2 (slightly above normal range \u2014 healthy lifestyle advice discussed). Heart rate: 72 bpm, regular\u2026",
    body: `Dear Patient,

Thank you for attending your annual routine health review on 10 January 2026.

Results summary:

Observations:
- Blood pressure: 124/78 mmHg (normal)
- BMI: 26.2 (slightly above normal range \u2014 healthy lifestyle advice discussed)
- Heart rate: 72 bpm, regular

Blood tests:
- Full blood count (FBC): Within normal limits. No anaemia.
- Urea & electrolytes (U&E): Normal renal function.
- Liver function tests (LFTs): Within normal limits.
- HbA1c: 38 mmol/mol (normal \u2014 no evidence of diabetes)
- Total cholesterol: 4.8 mmol/L (within acceptable range)

Assessment:
No new health concerns identified. All investigations within normal limits. We discussed maintaining a balanced diet and regular physical activity to support long-term cardiovascular health.

Plan:
- Continue current management.
- No new medications required.
- Next routine health review in 12 months (January 2027).
- Please contact the surgery if any new symptoms develop in the interim.

Kind regards,
Dr Emily Williams
General Practitioner
Riverside Medical Practice`,
  },
];
