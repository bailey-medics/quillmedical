/**
 * Demo Patients Data
 *
 * Sample patient records for use in patient list stories and testing.
 * Provides realistic patient demographics with various ages, genders, and
 * NHS numbers for demonstrating patient list functionality.
 */

import type { Patient } from "@/domains/patient";

/** Array of sample patient records for demo purposes */
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
  {
    id: "p4",
    name: "Emma Wilson",
    dob: "1985-03-22",
    age: 40,
    sex: "female",
    nationalNumber: "1111222233",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    onQuill: true,
    gradientIndex: 1,
  },
  {
    id: "p5",
    name: "Oliver Johnson",
    dob: "1992-11-15",
    age: 33,
    sex: "male",
    nationalNumber: "4444555566",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    gradientIndex: 2,
  },
  {
    id: "p6",
    name: "Sophia Taylor",
    dob: "1978-07-30",
    age: 47,
    sex: "female",
    nationalNumber: "7777888899",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    onQuill: true,
    gradientIndex: 4,
  },
  {
    id: "p7",
    name: "William Davis",
    dob: "1988-09-05",
    age: 37,
    sex: "male",
    nationalNumber: "2222333344",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    gradientIndex: 7,
  },
  {
    id: "p8",
    name: "Charlotte Miller",
    dob: "1995-12-18",
    age: 30,
    sex: "female",
    nationalNumber: "6666777788",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    onQuill: true,
    gradientIndex: 8,
  },
  {
    id: "p9",
    name: "James Anderson",
    dob: "1982-04-27",
    age: 43,
    sex: "male",
    nationalNumber: "9999000011",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    gradientIndex: 9,
  },
  {
    id: "p10",
    name: "Amelia Thomas",
    dob: "1991-06-14",
    age: 34,
    sex: "female",
    nationalNumber: "3333444455",
    nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
    onQuill: true,
    gradientIndex: 0,
  },
];
