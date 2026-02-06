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
    gradientIndex: 3,
  },
  {
    id: "p2",
    name: "Alex Smith",
    dob: "1990-01-01",
    age: 35,
    sex: "male",
    nhsNumber: "9876543210",
    gradientIndex: 6,
  },
  {
    id: "p3",
    name: "Sam Brown",
    dob: "1975-08-08",
    age: 50,
    sex: "male",
    nhsNumber: "5555555555",
    gradientIndex: 5,
  },
];
