/**
 * Patient Page Gradient Index Tests
 *
 * Tests for the Patient detail page's gradient index extraction from FHIR.
 * Note: Full integration tests with routing should be done in e2e tests.
 */

/* eslint-disable no-restricted-syntax */
import { describe, it, expect } from "vitest";
import { extractAvatarGradientIndex } from "@/lib/fhir-patient";

describe("Patient Page - Gradient Index Extraction", () => {
  it("should extract gradientIndex from FHIR extension", () => {
    const mockFhirPatient = {
      resourceType: "Patient",
      id: "test-patient-id",
      name: [
        {
          given: ["John"],
          family: "Smith",
          use: "official",
        },
      ],
      birthDate: "1990-01-15",
      gender: "male",
      identifier: [
        {
          system: "https://fhir.nhs.uk/Id/nhs-number",
          value: "1234567890",
        },
      ],
      extension: [
        {
          url: "urn:quillmedical:avatar-gradient",
          valueInteger: 5,
        },
      ],
    };

    const gradientIndex = extractAvatarGradientIndex(mockFhirPatient);
    expect(gradientIndex).toBe(5);
  });

  it("should return undefined when extension is missing", () => {
    const mockFhirPatient = {
      resourceType: "Patient",
      id: "test-patient-id",
      name: [
        {
          given: ["John"],
          family: "Smith",
          use: "official",
        },
      ],
    };

    const gradientIndex = extractAvatarGradientIndex(mockFhirPatient);
    expect(gradientIndex).toBeUndefined();
  });

  it("should return undefined when extension array is empty", () => {
    const mockFhirPatient = {
      resourceType: "Patient",
      id: "test-patient-id",
      extension: [],
    };

    const gradientIndex = extractAvatarGradientIndex(mockFhirPatient);
    expect(gradientIndex).toBeUndefined();
  });

  it("should extract correct index from multiple extensions", () => {
    const mockFhirPatient = {
      resourceType: "Patient",
      id: "test-patient-id",
      extension: [
        {
          url: "urn:some-other-extension",
          valueString: "foo",
        },
        {
          url: "urn:quillmedical:avatar-gradient",
          valueInteger: 15,
        },
        {
          url: "urn:another-extension",
          valueInteger: 99,
        },
      ],
    };

    const gradientIndex = extractAvatarGradientIndex(mockFhirPatient);
    expect(gradientIndex).toBe(15);
  });

  it("should handle index of 0", () => {
    const mockFhirPatient = {
      resourceType: "Patient",
      id: "test-patient-id",
      extension: [
        {
          url: "urn:quillmedical:avatar-gradient",
          valueInteger: 0,
        },
      ],
    };

    const gradientIndex = extractAvatarGradientIndex(mockFhirPatient);
    expect(gradientIndex).toBe(0);
  });

  it("should handle maximum index value (29)", () => {
    const mockFhirPatient = {
      resourceType: "Patient",
      id: "test-patient-id",
      extension: [
        {
          url: "urn:quillmedical:avatar-gradient",
          valueInteger: 29,
        },
      ],
    };

    const gradientIndex = extractAvatarGradientIndex(mockFhirPatient);
    expect(gradientIndex).toBe(29);
  });
});
