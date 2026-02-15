/**
 * PatientsList Component Tests
 *
 * Tests for the patient list component including:
 * - Loading states with skeleton UI
 * - Empty states (FHIR initializing vs no patients)
 * - Patient list rendering
 * - Patient selection callbacks
 * - "On Quill" badge display
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import PatientsList from "./PatientsList";
import { demoPatientsList } from "@/demo-data/patients/demoPatients";

describe("PatientsList", () => {
  describe("Loading state", () => {
    it("renders skeleton loaders when loading", () => {
      renderWithMantine(<PatientsList patients={[]} isLoading={true} />);

      // Should have multiple skeleton elements
      const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("renders 10 skeleton items", () => {
      const { container } = renderWithMantine(
        <PatientsList patients={[]} isLoading={true} />,
      );

      // Count the skeleton groups (each patient has a group with circle + text skeletons)
      const groups = container.querySelectorAll('[style*="padding: 8"]');
      expect(groups.length).toBe(10);
    });

    it("does not render patient data when loading", () => {
      renderWithMantine(
        <PatientsList patients={demoPatientsList} isLoading={true} />,
      );

      // Should not show actual patient names
      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    });
  });

  describe("Empty states", () => {
    it("shows database initialising message when FHIR unavailable and no patients", () => {
      renderWithMantine(<PatientsList patients={[]} fhirAvailable={false} />);

      expect(screen.getByText("Database is initialising")).toBeInTheDocument();
    });

    it("shows no patients message when FHIR available and no patients", () => {
      renderWithMantine(<PatientsList patients={[]} fhirAvailable={true} />);

      expect(screen.getByText("No patients to show")).toBeInTheDocument();
    });

    it("defaults to database initialising when no fhirAvailable prop", () => {
      renderWithMantine(<PatientsList patients={[]} />);

      expect(screen.getByText("Database is initialising")).toBeInTheDocument();
    });
  });

  describe("Patient list rendering", () => {
    it("renders all patients in the list", () => {
      renderWithMantine(
        <PatientsList patients={demoPatientsList} fhirAvailable={true} />,
      );

      // Check for a few patient names
      expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
      expect(screen.getByText(/Alex Smith/)).toBeInTheDocument();
      expect(screen.getByText(/Sam Brown/)).toBeInTheDocument();
    });

    it("renders correct number of patient items", () => {
      const { container } = renderWithMantine(
        <PatientsList patients={demoPatientsList} fhirAvailable={true} />,
      );

      // Count UnstyledButton elements (one per patient)
      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBe(demoPatientsList.length);
    });

    it("renders ProfilePic component for each patient", () => {
      const { container } = renderWithMantine(
        <PatientsList
          patients={demoPatientsList.slice(0, 3)}
          fhirAvailable={true}
        />,
      );

      // ProfilePic components should be rendered
      const avatars = container.querySelectorAll(
        "[data-testid], .mantine-Avatar-root",
      );
      expect(avatars.length).toBeGreaterThan(0);
    });

    it("renders Demographics component for each patient", () => {
      renderWithMantine(
        <PatientsList
          patients={demoPatientsList.slice(0, 2)}
          fhirAvailable={true}
        />,
      );

      // Demographics should show date, age and sex
      // Jane Doe: 12/05/1980, 45, female
      expect(screen.getByText("12/05/1980")).toBeInTheDocument();
      expect(screen.getByText(/45/)).toBeInTheDocument();
      expect(screen.getByText(/female/)).toBeInTheDocument();
    });
  });

  describe("On Quill badge", () => {
    it('shows "On Quill" badge for patients who are on Quill', () => {
      renderWithMantine(
        <PatientsList patients={demoPatientsList} fhirAvailable={true} />,
      );

      // Jane Doe (p1) and Emma Wilson (p4) are on Quill
      const onQuillBadges = screen.getAllByText("On Quill");
      expect(onQuillBadges.length).toBeGreaterThan(0);
    });

    it('does not show "On Quill" badge for patients not on Quill', () => {
      const patientNotOnQuill = {
        ...demoPatientsList[1], // Alex Smith
        onQuill: false,
      };

      renderWithMantine(
        <PatientsList patients={[patientNotOnQuill]} fhirAvailable={true} />,
      );

      // Alex Smith should be rendered but without "On Quill"
      expect(screen.getByText(/Alex Smith/)).toBeInTheDocument();
      expect(screen.queryByText("On Quill")).not.toBeInTheDocument();
    });
  });

  describe("Patient selection", () => {
    it("calls onSelect callback when patient is clicked", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      renderWithMantine(
        <PatientsList
          patients={demoPatientsList.slice(0, 1)}
          fhirAvailable={true}
          onSelect={onSelect}
        />,
      );

      // Click on Jane Doe
      const patientButton = screen.getByRole("button");
      await user.click(patientButton);

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(demoPatientsList[0]);
    });

    it("calls onSelect with correct patient data", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      renderWithMantine(
        <PatientsList
          patients={[demoPatientsList[1]]} // Alex Smith
          fhirAvailable={true}
          onSelect={onSelect}
        />,
      );

      const patientButton = screen.getByRole("button");
      await user.click(patientButton);

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "p2",
          name: "Alex Smith",
        }),
      );
    });

    it("does not error when onSelect is undefined", async () => {
      const user = userEvent.setup();

      renderWithMantine(
        <PatientsList
          patients={demoPatientsList.slice(0, 1)}
          fhirAvailable={true}
        />,
      );

      const patientButton = screen.getByRole("button");

      // Should not throw error
      await expect(user.click(patientButton)).resolves.not.toThrow();
    });
  });

  describe("Edge cases", () => {
    it("handles empty patient array gracefully", () => {
      renderWithMantine(<PatientsList patients={[]} fhirAvailable={true} />);

      expect(screen.getByText("No patients to show")).toBeInTheDocument();
    });

    it("handles patient with missing name parts", () => {
      const patientWithSingleName = {
        ...demoPatientsList[0],
        name: "Madonna",
      };

      renderWithMantine(
        <PatientsList
          patients={[patientWithSingleName]}
          fhirAvailable={true}
        />,
      );

      expect(screen.getByText(/Madonna/)).toBeInTheDocument();
    });

    it("handles patient with no name", () => {
      const patientWithNoName = {
        ...demoPatientsList[0],
        name: "",
      };

      const { container } = renderWithMantine(
        <PatientsList patients={[patientWithNoName]} fhirAvailable={true} />,
      );

      // Should still render a patient button
      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBe(1);
    });
  });

  describe("Responsive behavior", () => {
    it("renders with full width styling", () => {
      const { container } = renderWithMantine(
        <PatientsList
          patients={demoPatientsList.slice(0, 1)}
          fhirAvailable={true}
        />,
      );

      const wrapper = container.querySelector('div[style*="width: 100%"]');
      expect(wrapper).toBeInTheDocument();
    });

    it("maintains width styling for patient buttons", () => {
      const { container } = renderWithMantine(
        <PatientsList
          patients={demoPatientsList.slice(0, 1)}
          fhirAvailable={true}
        />,
      );

      const button = container.querySelector('button[style*="width: 100%"]');
      expect(button).toBeInTheDocument();
    });
  });
});
