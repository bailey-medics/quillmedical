import type { Patient } from "@/domains/patient";

export const demoPatientsList: Patient[] = [
  {
    id: "p1",
    name: "Jane Doe",
    dob: "1980-05-12",
    age: 45,
    sex: "female",
    nationalNumber: "1234567890",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    onQuill: true,
    gradientIndex: 3,
  },
  {
    id: "p2",
    name: "Alex Smith",
    dob: "1990-01-01",
    age: 35,
    sex: "male",
    nationalNumber: "9876543210",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    gradientIndex: 6,
  },
  {
    id: "p3",
    name: "Sam Brown",
    dob: "1975-08-08",
    age: 50,
    sex: "male",
    nationalNumber: "5555555555",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    gradientIndex: 5,
  },
];
