import { useState } from "react";
import { Outlet } from "react-router-dom";

import { type Patient } from "@domains/patient";
import MainLayout from "./components/layouts/MainLayout";

export type LayoutCtx = {
  patient: Patient | null;
  setPatient: React.Dispatch<React.SetStateAction<Patient | null>>;
};

export default function RootLayout() {
  const [patient, setPatient] = useState<Patient | null>(null);

  return (
    <>
      <MainLayout patient={patient} isLoading={false}>
        <Outlet context={{ patient, setPatient } satisfies LayoutCtx} />
      </MainLayout>
    </>
  );
}
