/**
 * DemographicsDetailed Component Tests
 *
 * Tests for detailed patient demographics display including profile picture,
 * contact information, and responsive layout.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import DemographicsDetailed from "./DemographicsDetailed";
import type { Patient } from "@/domains/patient";

// Mock child components
vi.mock("@/components/demographics/NationalNumber", () => ({
  default: ({ nationalNumber }: { nationalNumber: string }) => (
    <span data-testid="national-number">{nationalNumber}</span>
  ),
}));

vi.mock("@/components/profile-pic/ProfilePic", () => ({
  default: ({
    givenName,
    familyName,
    gradientIndex,
    size,
    isLoading,
  }: {
    givenName?: string;
    familyName?: string;
    gradientIndex?: number;
    size: string;
    isLoading?: boolean;
  }) =>
    isLoading ? (
      <div data-testid="profile-pic-loading" />
    ) : (
      <div
        data-testid="profile-pic"
        data-given={givenName}
        data-family={familyName}
        data-gradient={gradientIndex}
        data-size={size}
      />
    ),
}));

const mockPatient: Patient = {
  id: "1",
  name: "John Doe",
  givenName: "John",
  familyName: "Doe",
  nationalNumber: "NHS1234567",
  dob: "01/01/1980",
  age: 44,
  sex: "Male",
  nationalNumberSystem: "nhs-number",
  address: "123 Main St, London",
  telephone: "020 1234 5678",
  mobile: "07700 900123",
  onQuill: true,
  gradientIndex: 2,
  nextOfKin: {
    name: "Jane Doe",
    phone: "07700 900456",
  },
};

describe("DemographicsDetailed", () => {
  describe("Basic rendering", () => {
    it("renders patient name", () => {
      renderWithMantine(<DemographicsDetailed patient={mockPatient} />);
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    it("renders DOB, age, and sex", () => {
      renderWithMantine(<DemographicsDetailed patient={mockPatient} />);
      expect(screen.getByText(/DOB: 01\/01\/1980/)).toBeInTheDocument();
      expect(screen.getByText(/Age: 44/)).toBeInTheDocument();
      expect(screen.getByText(/Male/)).toBeInTheDocument();
    });

    it("renders national number", () => {
      renderWithMantine(<DemographicsDetailed patient={mockPatient} />);
      expect(screen.getByTestId("national-number")).toBeInTheDocument();
      expect(screen.getByTestId("national-number")).toHaveTextContent(
        "NHS1234567",
      );
    });

    it("renders profile picture with correct props", () => {
      renderWithMantine(<DemographicsDetailed patient={mockPatient} />);
      const profilePic = screen.getByTestId("profile-pic");
      expect(profilePic).toHaveAttribute("data-given", "John");
      expect(profilePic).toHaveAttribute("data-family", "Doe");
      expect(profilePic).toHaveAttribute("data-gradient", "2");
    });
  });

  describe("Contact information", () => {
    it("displays address when provided", () => {
      renderWithMantine(<DemographicsDetailed patient={mockPatient} />);
      expect(screen.getByText("123 Main St, London")).toBeInTheDocument();
    });

    it("displays telephone when provided", () => {
      renderWithMantine(<DemographicsDetailed patient={mockPatient} />);
      expect(screen.getByText(/Tel: 020 1234 5678/)).toBeInTheDocument();
    });

    it("displays mobile when provided", () => {
      renderWithMantine(<DemographicsDetailed patient={mockPatient} />);
      expect(screen.getByText(/Mobile: 07700 900123/)).toBeInTheDocument();
    });

    it("hides contact information when not provided", () => {
      const patient = {
        ...mockPatient,
        address: undefined,
        telephone: undefined,
        mobile: undefined,
      };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      expect(screen.queryByText(/Tel:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Mobile:/)).not.toBeInTheDocument();
    });
  });

  describe("Next of kin information", () => {
    it("displays next of kin name", () => {
      renderWithMantine(<DemographicsDetailed patient={mockPatient} />);
      expect(screen.getByText(/Next of kin: Jane Doe/)).toBeInTheDocument();
    });

    it("displays next of kin phone", () => {
      renderWithMantine(<DemographicsDetailed patient={mockPatient} />);
      expect(
        screen.getByText(/Next of kin tel: 07700 900456/),
      ).toBeInTheDocument();
    });

    it("hides next of kin when not provided", () => {
      const patient = { ...mockPatient, nextOfKin: undefined };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      expect(screen.queryByText(/Next of kin/)).not.toBeInTheDocument();
    });

    it("handles partial next of kin information", () => {
      const patient = {
        ...mockPatient,
        nextOfKin: { name: "Jane Doe" },
      };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      expect(screen.getByText(/Next of kin: Jane Doe/)).toBeInTheDocument();
      expect(screen.queryByText(/Next of kin tel:/)).not.toBeInTheDocument();
    });
  });

  describe("Quill app status", () => {
    it("displays 'On Quill app' when patient is on Quill", () => {
      renderWithMantine(<DemographicsDetailed patient={mockPatient} />);
      expect(screen.getByText("On Quill app")).toBeInTheDocument();
    });

    it("displays 'Not on Quill' when patient is not on Quill", () => {
      const patient = { ...mockPatient, onQuill: false };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      expect(screen.getByText("Not on Quill")).toBeInTheDocument();
    });

    it("hides Quill status when undefined", () => {
      const patient = { ...mockPatient, onQuill: undefined };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      expect(screen.queryByText(/Quill/)).not.toBeInTheDocument();
    });
  });

  describe("Compact mode", () => {
    it("applies compact styling when isCompact is true", () => {
      renderWithMantine(
        <DemographicsDetailed patient={mockPatient} isCompact={true} />,
      );
      const nameText = screen.getByText("John Doe");
      expect(nameText).toHaveStyle({ fontSize: 14 });
    });

    it("applies normal styling when isCompact is false", () => {
      renderWithMantine(
        <DemographicsDetailed patient={mockPatient} isCompact={false} />,
      );
      const nameText = screen.getByText("John Doe");
      expect(nameText).toHaveStyle({ fontSize: 16 });
    });
  });

  describe("Loading state", () => {
    it("displays skeleton loaders when loading", () => {
      const { container } = renderWithMantine(
        <DemographicsDetailed patient={null} isLoading={true} />,
      );

      // Component renders Mantine Skeleton directly instead of ProfilePic with isLoading
      const skeletons = container.querySelectorAll('[class*="Skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
      expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
    });

    it("shows content when not loading", () => {
      renderWithMantine(
        <DemographicsDetailed patient={mockPatient} isLoading={false} />,
      );
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });
  });

  describe("Null patient handling", () => {
    it("renders nothing when patient is null and not loading", () => {
      renderWithMantine(
        <DemographicsDetailed patient={null} isLoading={false} />,
      );
      // Component returns null - check for absence of content
      expect(screen.queryByText(/John Doe/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId("profile-pic")).not.toBeInTheDocument();
    });
  });

  describe("Avatar customization", () => {
    it("passes custom avatar source to ProfilePic", () => {
      renderWithMantine(
        <DemographicsDetailed
          patient={mockPatient}
          avatarSrc="https://example.com/avatar.jpg"
        />,
      );
      expect(screen.getByTestId("profile-pic")).toBeInTheDocument();
    });
  });

  describe("Name parsing", () => {
    it("handles single name correctly", () => {
      const patient = { ...mockPatient, name: "Prince" };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      const profilePic = screen.getByTestId("profile-pic");
      expect(profilePic).toHaveAttribute("data-given", "Prince");
      // Undefined attributes are rendered as null, not empty string
      expect(profilePic.getAttribute("data-family")).toBeNull();
    });

    it("handles multiple names correctly", () => {
      const patient = { ...mockPatient, name: "Mary Jane Watson" };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      const profilePic = screen.getByTestId("profile-pic");
      expect(profilePic).toHaveAttribute("data-given", "Mary");
      expect(profilePic).toHaveAttribute("data-family", "Watson");
    });

    it("handles empty name gracefully", () => {
      const patient = { ...mockPatient, name: "" };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      expect(screen.getByTestId("profile-pic")).toBeInTheDocument();
    });
  });

  describe("Optional patient fields", () => {
    it("handles missing DOB gracefully", () => {
      const patient = { ...mockPatient, dob: undefined };
      const { container } = renderWithMantine(
        <DemographicsDetailed patient={patient} />,
      );
      expect(container.textContent).not.toContain("DOB:");
    });

    it("handles missing age gracefully", () => {
      const patient = { ...mockPatient, age: undefined };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      // Should still render other info
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    it("handles missing sex gracefully", () => {
      const patient = { ...mockPatient, sex: undefined };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    it("handles missing national number gracefully", () => {
      const patient = { ...mockPatient, nationalNumber: undefined };
      renderWithMantine(<DemographicsDetailed patient={patient} />);
      expect(screen.queryByTestId("national-number")).not.toBeInTheDocument();
    });
  });
});
