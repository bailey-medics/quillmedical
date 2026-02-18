/**
 * ViewAllPatientsPage Component Tests
 *
 * Tests for the view all patients page including:
 * - Loading states
 * - FHIR initialization handling
 * - Patient list display
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import ViewAllPatientsPage from "./ViewAllPatientsPage";
import * as apiLib from "@/lib/api";

describe("ViewAllPatientsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Loading states", () => {
    it("displays skeletons on initial load", () => {
      // Mock API to never resolve (simulating before first response)
      vi.spyOn(apiLib.api, "get").mockImplementation(
        () => new Promise(() => {}),
      );

      renderWithRouter(<ViewAllPatientsPage />, {
        initialRoute: "/admin/patients/list",
      });

      // Should show skeletons while waiting for first API response
      const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("FHIR initialization", () => {
    it('displays "Database is initialising" when FHIR not ready', async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [],
        fhir_ready: false,
      });

      renderWithRouter(<ViewAllPatientsPage />, {
        initialRoute: "/admin/patients/list",
      });

      await waitFor(
        () => {
          expect(
            screen.getByText("Database is initialising"),
          ).toBeInTheDocument();
        },
        { timeout: 10000 },
      );
    }, 15000);
  });

  describe("Patient list display", () => {
    it('displays "No patients to show" when FHIR ready but no patients', async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [],
        fhir_ready: true,
      });

      renderWithRouter(<ViewAllPatientsPage />, {
        initialRoute: "/admin/patients/list",
      });

      await waitFor(() => {
        expect(screen.getByText("No patients to show")).toBeInTheDocument();
      });
    });

    it("displays patient table when patients available", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [
          {
            id: "patient-1",
            name: [{ given: ["John"], family: "Doe" }],
            birthDate: "1980-05-15",
            gender: "male",
          },
          {
            id: "patient-2",
            name: [{ given: ["Jane"], family: "Smith" }],
            birthDate: "1990-10-20",
            gender: "female",
          },
        ],
        fhir_ready: true,
      });

      renderWithRouter(<ViewAllPatientsPage />, {
        initialRoute: "/admin/patients/list",
      });

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
        expect(screen.getByText("Jane Smith")).toBeInTheDocument();
        expect(screen.getByText("1980-05-15")).toBeInTheDocument();
        expect(screen.getByText("1990-10-20")).toBeInTheDocument();
      });
    });

    it("displays N/A for missing patient data", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [
          {
            id: "patient-1",
            name: [{ given: ["Test"], family: "Patient" }],
            // birthDate and gender missing
          },
        ],
        fhir_ready: true,
      });

      renderWithRouter(<ViewAllPatientsPage />, {
        initialRoute: "/admin/patients/list",
      });

      await waitFor(() => {
        expect(screen.getByText("Test Patient")).toBeInTheDocument();
        // Should have N/A for missing fields
        const naCells = screen.getAllByText("N/A");
        expect(naCells.length).toBeGreaterThanOrEqual(2); // birthDate and gender
      });
    });

    it("displays 'Unknown' for patients with no name", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [
          {
            id: "patient-1",
            name: [],
            birthDate: "1990-01-01",
            gender: "other",
          },
        ],
        fhir_ready: true,
      });

      renderWithRouter(<ViewAllPatientsPage />, {
        initialRoute: "/admin/patients/list",
      });

      await waitFor(() => {
        expect(screen.getByText("Unknown")).toBeInTheDocument();
      });
    });
  });

  describe("Error handling", () => {
    it("displays error message when API call fails", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("Network error"));

      renderWithRouter(<ViewAllPatientsPage />, {
        initialRoute: "/admin/patients/list",
      });

      await waitFor(() => {
        expect(screen.getByText("Error loading patients")).toBeInTheDocument();
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("displays generic error for unknown errors", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue("Something went wrong");

      renderWithRouter(<ViewAllPatientsPage />, {
        initialRoute: "/admin/patients/list",
      });

      await waitFor(() => {
        expect(screen.getByText("Error loading patients")).toBeInTheDocument();
        expect(screen.getByText("Unknown error")).toBeInTheDocument();
      });
    });
  });
});
