import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import Demographics from "./Demographics";
import type { Patient } from "@/domains/patient";

const mockPatient: Patient = {
  id: "1",
  name: "John Smith",
  givenName: "John",
  familyName: "Smith",
  dob: "1980-09-15",
  age: 43,
  sex: "male",
  nationalNumber: "1234567890",
  nationalNumberSystem: "https://fhir.nhs.uk/Id/nhs-number",
};

describe("Demographics Component", () => {
  describe("Patient display", () => {
    it("renders patient name", () => {
      renderWithMantine(<Demographics patient={mockPatient} />);
      expect(screen.getByText("John Smith")).toBeInTheDocument();
    });

    it("renders formatted date of birth", () => {
      renderWithMantine(<Demographics patient={mockPatient} />);
      expect(screen.getByText("15/09/1980")).toBeInTheDocument();
    });

    it("renders patient age", () => {
      renderWithMantine(<Demographics patient={mockPatient} />);
      expect(screen.getByText(/43/)).toBeInTheDocument();
    });

    it("renders patient sex", () => {
      renderWithMantine(<Demographics patient={mockPatient} />);
      expect(screen.getByText(/male/)).toBeInTheDocument();
    });

    it("renders NHS number", () => {
      renderWithMantine(<Demographics patient={mockPatient} />);
      expect(screen.getByText(/NHS/)).toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("renders skeleton when isLoading is true", () => {
      const { container } = renderWithMantine(<Demographics isLoading />);
      // Mantine Skeleton component
      const skeletons = container.querySelectorAll('[class*="Skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("does not render patient data when loading", () => {
      renderWithMantine(<Demographics patient={mockPatient} isLoading />);
      expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
    });
  });

  describe("No patient", () => {
    it("returns null when no patient and not loading", () => {
      renderWithMantine(<Demographics />);
      // Component returns null, so no patient name should be rendered
      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
      expect(screen.queryByText(/DOB|Age|Sex|NHS/)).not.toBeInTheDocument();
    });

    it("returns null when patient is undefined", () => {
      renderWithMantine(<Demographics patient={undefined} />);
      // Component returns null, so no patient data should be rendered
      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
      expect(screen.queryByText(/DOB|Age|Sex|NHS/)).not.toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("handles patient without DOB", () => {
      const patientNoDob = { ...mockPatient, dob: undefined };
      renderWithMantine(<Demographics patient={patientNoDob} />);
      expect(screen.queryByText(/\//)).not.toBeInTheDocument(); // No date format
    });

    it("handles patient without age", () => {
      const patientNoAge = { ...mockPatient, age: undefined };
      renderWithMantine(<Demographics patient={patientNoAge} />);
      expect(screen.getByText("John Smith")).toBeInTheDocument();
      // Age should not be displayed
    });

    it("handles patient without sex", () => {
      const patientNoSex = { ...mockPatient, sex: undefined };
      renderWithMantine(<Demographics patient={patientNoSex} />);
      expect(screen.getByText("John Smith")).toBeInTheDocument();
    });

    it("handles patient without national number", () => {
      const patientNoNHS = { ...mockPatient, nationalNumber: undefined };
      renderWithMantine(<Demographics patient={patientNoNHS} />);
      expect(screen.queryByText(/NHS/)).not.toBeInTheDocument();
    });

    it("handles patient with only name", () => {
      const minimalPatient: Patient = {
        id: "1",
        name: "Jane Doe",
      };
      renderWithMantine(<Demographics patient={minimalPatient} />);
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });
  });

  describe("Text styling", () => {
    it("renders name with bold font weight", () => {
      renderWithMantine(<Demographics patient={mockPatient} />);
      const nameElement = screen.getByText("John Smith");
      expect(nameElement).toHaveStyle({ fontWeight: "700" });
    });

    it("renders secondary info with correct font size", () => {
      const { container } = renderWithMantine(
        <Demographics patient={mockPatient} />,
      );
      const secondaryText = container.querySelector('[style*="font-size: 14"]');
      expect(secondaryText).toBeInTheDocument();
    });
  });
});
