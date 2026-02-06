import type { Patient } from "@/domains/patient";

export const demoPatientsList: Patient[] = [
  {
    id: "p1",
    name: "Jane Doe",
    dob: "1980-05-12",
    age: 45,
    sex: "female",
    nhsNumber: "1234567890",
    onQuill: true,
    colorFrom: "#667eea",
    colorTo: "#764ba2",
  },
  {
    id: "p2",
    name: "Alex Smith",
    dob: "1990-01-01",
    age: 35,
    sex: "male",
    nhsNumber: "9876543210",
    colorFrom: "#4ECDC4",
    colorTo: "#44A08D",
  },
  {
    id: "p3",
    name: "Sam Brown",
    dob: "1975-08-08",
    age: 50,
    sex: "male",
    nhsNumber: "5555555555",
    colorFrom: "#FF6B6B",
    colorTo: "#FFE66D",
  },
];
