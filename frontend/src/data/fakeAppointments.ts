/**
 * Fake Appointments Data
 *
 * Shared fake appointment data used by the PatientAppointments page and
 * AppointmentsList stories. Extracted to avoid react-refresh ESLint errors.
 */

import type { Appointment } from "@/components/appointments/AppointmentsList";

export const fakeAppointments: Appointment[] = [
  {
    id: "appt-1",
    title: "Gastro clinic follow-up review",
    date: "2026-04-09",
    time: "10:00",
    location: "Riverside Health Centre, Room 4",
    clinician: "Dr Gareth Corbett",
    clinicianRole: "Consultant Gastroenterologist",
    status: "upcoming",
    notes:
      "3-week follow-up to review dietary modifications and food diary. Assess symptom response to omeprazole.",
  },
  {
    id: "appt-2",
    title: "Gastro clinic — initial assessment",
    date: "2026-03-19",
    time: "10:30",
    location: "Riverside Health Centre, Room 4",
    clinician: "Dr Gareth Corbett",
    clinicianRole: "Consultant Gastroenterologist",
    status: "completed",
    notes:
      "Initial assessment for functional dyspepsia. Commenced omeprazole 20mg OD. Dietary advice provided. Food diary requested.",
  },
  {
    id: "appt-3",
    title: "GP consultation — gastro referral",
    date: "2026-02-25",
    time: "09:15",
    location: "Meadowbrook Surgery, Room 2",
    clinician: "Dr Emily Williams",
    clinicianRole: "General Practitioner",
    status: "completed",
    notes:
      "Assessment of epigastric symptoms. Referral to gastroenterology arranged.",
  },
  {
    id: "appt-4",
    title: "Annual health review",
    date: "2026-01-10",
    time: "14:30",
    location: "Meadowbrook Surgery, Room 2",
    clinician: "Dr Emily Williams",
    clinicianRole: "General Practitioner",
    status: "completed",
    notes:
      "Routine annual review. Bloods normal. BP within target. No concerns.",
  },
  {
    id: "appt-5",
    title: "Practice nurse — BP and weight check",
    date: "2025-10-15",
    time: "11:00",
    location: "Meadowbrook Surgery, Treatment Room",
    clinician: "Nurse Sarah Mitchell",
    clinicianRole: "Practice Nurse",
    status: "completed",
    notes: "Routine monitoring. BP 126/80, weight 82.4kg. No action required.",
  },
];
