/**
 * PatientsList Component Stories
 *
 * Demonstrates the patient list component:
 * - Table of patients with demographics
 * - Profile picture avatars with gradient colors
 * - NHS number and contact information
 * - Sortable columns
 * - Click to open patient detail view
 * - Loading and empty states
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import PatientsList from "./PatientsList";
import { demoPatientsList } from "@/demo-data/patients/demoPatients";

const meta: Meta<typeof PatientsList> = {
  title: "Patients/PatientsList",
  component: PatientsList,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof PatientsList>;

export const Default: Story = {
  args: {
    patients: demoPatientsList,
  },
};

export const Loading: Story = {
  args: {
    patients: [],
    isLoading: true,
    fhirAvailable: false,
  },
};

export const DatabaseInitialising: Story = {
  args: {
    patients: [],
    isLoading: false,
    fhirAvailable: false,
  },
};

export const NoPatients: Story = {
  args: {
    patients: [],
    isLoading: false,
    fhirAvailable: true,
  },
};

/**
 * Animated Loading Sequence
 *
 * Demonstrates the complete FHIR initialization sequence:
 * 1. Initial health check loading (5s)
 * 2. Database initialising message (5s)
 * 3. Fetching patients loading (5s)
 * 4. Patient list displayed (15s)
 *
 * Loops indefinitely to show the full startup flow.
 */
export const AnimatedLoadingSequence: Story = {
  render: () => {
    const [state, setState] = useState<
      "health-check" | "db-init" | "fetching" | "loaded"
    >("health-check");

    useEffect(() => {
      let timeoutId: NodeJS.Timeout;

      const scheduleNextState = (nextState: typeof state, delay: number) => {
        timeoutId = setTimeout(() => {
          setState(nextState);
        }, delay);
      };

      // State machine timing
      if (state === "health-check") {
        scheduleNextState("db-init", 5000);
      } else if (state === "db-init") {
        scheduleNextState("fetching", 5000);
      } else if (state === "fetching") {
        scheduleNextState("loaded", 5000);
      } else if (state === "loaded") {
        scheduleNextState("health-check", 15000);
      }

      return () => clearTimeout(timeoutId);
    }, [state]);

    // Render appropriate state
    if (state === "health-check") {
      return (
        <PatientsList patients={[]} isLoading={true} fhirAvailable={false} />
      );
    }

    if (state === "db-init") {
      return (
        <PatientsList patients={[]} isLoading={false} fhirAvailable={false} />
      );
    }

    if (state === "fetching") {
      return (
        <PatientsList patients={[]} isLoading={true} fhirAvailable={true} />
      );
    }

    // state === "loaded"
    return (
      <PatientsList
        patients={demoPatientsList}
        isLoading={false}
        fhirAvailable={true}
      />
    );
  },
};
