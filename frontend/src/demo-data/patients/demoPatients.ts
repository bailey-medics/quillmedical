import type { Patient } from "@/domains/patient";

export const demoPatientFull: Patient = {
  id: "p123",
  name: "Alice Example",
  dob: "01/01/1980",
  age: 44,
  sex: "F",
  nhsNumber: "123 456 7890",
  address: "Flat 2, 10 High Street, Exampletown, EX4 3PL",
  telephone: "020 7946 0000",
  mobile: "07700 900123",
  onQuill: true,
  nextOfKin: { name: "Bob Example", phone: "07700 900124" },
};

export const demoPatient: Patient = {
  id: "p124",
  name: "Sam Demo",
  dob: "05/05/1990",
  age: 35,
  sex: "M",
  nhsNumber: "987 654 3210",
  address: "Flat 1, 2 Station Road, DemoCity, DC1 2DD",
  telephone: "020 7946 1111",
  mobile: "07700 900125",
  onQuill: false,
  nextOfKin: { name: "Pat Demo", phone: "07700 900126" },
};

export default demoPatientFull;
