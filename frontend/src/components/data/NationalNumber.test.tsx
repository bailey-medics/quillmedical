import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import NationalNumber from "./NationalNumber";

describe("NationalNumber Component", () => {
  describe("NHS number formatting", () => {
    it("formats 10-digit NHS number with spaces", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="1234567890"
          nationalNumberSystem="https://fhir.nhs.uk/Id/nhs-number"
        />,
      );
      expect(screen.getByText("NHS 123 456 7890")).toBeInTheDocument();
    });

    it("displays NHS prefix for NHS numbers", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="9876543210"
          nationalNumberSystem="https://fhir.nhs.uk/Id/nhs-number"
        />,
      );
      expect(screen.getByText("NHS 987 654 3210")).toBeInTheDocument();
    });

    it("handles NHS numbers with existing spaces", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="123 456 7890"
          nationalNumberSystem="https://fhir.nhs.uk/Id/nhs-number"
        />,
      );
      expect(screen.getByText("NHS 123 456 7890")).toBeInTheDocument();
    });

    it("handles NHS numbers with hyphens", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="123-456-7890"
          nationalNumberSystem="https://fhir.nhs.uk/Id/nhs-number"
        />,
      );
      expect(screen.getByText("NHS 123 456 7890")).toBeInTheDocument();
    });

    it("returns unformatted NHS number if not 10 digits", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="12345"
          nationalNumberSystem="https://fhir.nhs.uk/Id/nhs-number"
        />,
      );
      expect(screen.getByText("NHS 12345")).toBeInTheDocument();
    });

    it("detects NHS system with partial URL match", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="1234567890"
          nationalNumberSystem="https://some.nhs.uk/path"
        />,
      );
      expect(screen.getByText(/NHS/)).toBeInTheDocument();
    });
  });

  describe("Other national number systems", () => {
    it("renders number without prefix for non-NHS system", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="1234567890"
          nationalNumberSystem="https://example.com/id"
        />,
      );
      expect(screen.getByText("1234567890")).toBeInTheDocument();
      expect(screen.queryByText(/NHS/)).not.toBeInTheDocument();
    });

    it("renders number without prefix when no system provided", () => {
      renderWithMantine(<NationalNumber nationalNumber="1234567890" />);
      expect(screen.getByText("1234567890")).toBeInTheDocument();
      expect(screen.queryByText(/NHS/)).not.toBeInTheDocument();
    });

    it("renders number without formatting for non-NHS system", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="ABC-123-XYZ"
          nationalNumberSystem="https://example.org/id"
        />,
      );
      expect(screen.getByText("ABC-123-XYZ")).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("handles empty string number", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber=""
          nationalNumberSystem="https://fhir.nhs.uk/Id/nhs-number"
        />,
      );
      expect(screen.getByText("NHS")).toBeInTheDocument();
    });

    it("handles NHS number with mixed characters", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="12A 34B 56C7D890"
          nationalNumberSystem="https://fhir.nhs.uk/Id/nhs-number"
        />,
      );
      // Should extract digits and format: 1234567890 -> 123 456 7890
      expect(screen.getByText("NHS 123 456 7890")).toBeInTheDocument();
    });

    it("handles undefined nationalNumberSystem", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="1234567890"
          nationalNumberSystem={undefined}
        />,
      );
      expect(screen.getByText("1234567890")).toBeInTheDocument();
    });

    it("handles NHS number longer than 10 digits", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="123456789012345"
          nationalNumberSystem="https://fhir.nhs.uk/Id/nhs-number"
        />,
      );
      // Should return unformatted if not exactly 10 digits
      expect(screen.getByText("NHS 123456789012345")).toBeInTheDocument();
    });

    it("handles NHS number shorter than 10 digits", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="12345"
          nationalNumberSystem="https://fhir.nhs.uk/Id/nhs-number"
        />,
      );
      expect(screen.getByText("NHS 12345")).toBeInTheDocument();
    });
  });

  describe("Case sensitivity", () => {
    it("does not detect NHS system with uppercase NHS in URL", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="1234567890"
          nationalNumberSystem="https://fhir.NHS.uk/Id/nhs-number"
        />,
      );
      // .includes() is case sensitive, so uppercase NHS won't match
      expect(screen.queryByText(/NHS/)).not.toBeInTheDocument();
      expect(screen.getByText("1234567890")).toBeInTheDocument();
    });

    it("detects NHS system with lowercase nhs in URL", () => {
      renderWithMantine(
        <NationalNumber
          nationalNumber="1234567890"
          nationalNumberSystem="https://fhir.nhs.uk/Id/nhs-number"
        />,
      );
      expect(screen.getByText(/NHS 123 456 7890/)).toBeInTheDocument();
    });
  });
});
