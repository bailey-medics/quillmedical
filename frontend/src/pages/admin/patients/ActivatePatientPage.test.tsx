/**
 * Tests for ActivatePatientPage
 *
 * Tests the activation confirmation page functionality including:
 * - Displaying patient details when patient ID is provided
 * - Displaying list of deactivated patients for selection
 * - Activation confirmation and API integration
 * - Error handling and loading states
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import ActivatePatientPage from "./ActivatePatientPage";
import * as apiLib from "@/lib/api";

// Mock the API module
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock @mantine/notifications
vi.mock("@mantine/notifications", () => ({
  notifications: {
    show: vi.fn(),
  },
}));

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("ActivatePatientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("With patient ID in route", () => {
    it("displays patient details for activation", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["Jane"], family: "Smith" }],
        birthDate: "1975-03-20",
        gender: "female",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatient,
      });

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/:patientId/activate",
        initialRoute: "/admin/patients/patient-123/activate",
      });

      await waitFor(() => {
        expect(screen.getByText("Activate Jane Smith")).toBeInTheDocument();
        expect(
          screen.getByText("Confirm activation of this patient record"),
        ).toBeInTheDocument();
        expect(screen.getByText("Jane Smith")).toBeInTheDocument();
        expect(screen.getByText("1975-03-20")).toBeInTheDocument();
        expect(screen.getByText("female")).toBeInTheDocument();
      });
    });

    it("shows activation confirmation alert", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["Jane"], family: "Smith" }],
        birthDate: "1975-03-20",
        gender: "female",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatient,
      });

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/:patientId/activate",
        initialRoute: "/admin/patients/patient-123/activate",
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            "You are about to activate this patient record. This will restore access to their records.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("activates patient on confirm button click", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["Jane"], family: "Smith" }],
        birthDate: "1975-03-20",
        gender: "female",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatient,
      });

      vi.spyOn(apiLib.api, "post").mockResolvedValueOnce({});

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/:patientId/activate",
        initialRoute: "/admin/patients/patient-123/activate",
      });

      await waitFor(() => {
        expect(screen.getByText("Activate Jane Smith")).toBeInTheDocument();
      });

      const activateButton = screen.getByRole("button", {
        name: /activate patient/i,
      });

      fireEvent.click(activateButton);

      await waitFor(() => {
        expect(apiLib.api.post).toHaveBeenCalledWith(
          "/patients/patient-123/activate",
        );
        expect(mockNavigate).toHaveBeenCalledWith(
          "/admin/patients/patient-123",
        );
      });
    });

    it("navigates back on cancel button click", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["Jane"], family: "Smith" }],
        birthDate: "1975-03-20",
        gender: "female",
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatient,
      });

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/:patientId/activate",
        initialRoute: "/admin/patients/patient-123/activate",
      });

      await waitFor(() => {
        expect(screen.getByText("Activate Jane Smith")).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith("/admin/patients/patient-123");
    });
  });

  describe("Without patient ID (selection list)", () => {
    it("displays list of deactivated patients", async () => {
      const mockPatientsResponse = {
        patients: [
          {
            id: "patient-1",
            name: [{ given: ["John"], family: "Doe" }],
            birthDate: "1980-01-01",
            gender: "male",
            is_active: false,
          },
          {
            id: "patient-2",
            name: [{ given: ["Jane"], family: "Smith" }],
            birthDate: "1990-02-02",
            gender: "female",
            is_active: true, // Active patient should be filtered out
          },
          {
            id: "patient-3",
            name: [{ given: ["Bob"], family: "Johnson" }],
            birthDate: "1985-03-03",
            gender: "male",
            is_active: false,
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatientsResponse,
      });

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/activate",
        initialRoute: "/admin/patients/activate",
      });

      await waitFor(() => {
        expect(screen.getByText("Activate patient")).toBeInTheDocument();
        expect(
          screen.getByText("Select a deactivated patient to activate"),
        ).toBeInTheDocument();

        // Only deactivated patients should be shown
        expect(screen.getByText("John Doe")).toBeInTheDocument();
        expect(screen.getByText("Bob Johnson")).toBeInTheDocument();
        expect(screen.queryByText("Jane Smith")).not.toBeInTheDocument();
      });
    });

    it("displays empty state when no deactivated patients", async () => {
      const mockPatientsResponse = {
        patients: [],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatientsResponse,
      });

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/activate",
        initialRoute: "/admin/patients/activate",
      });

      await waitFor(() => {
        expect(
          screen.getByText("No deactivated patients found"),
        ).toBeInTheDocument();
      });
    });

    it("shows modal and activates patient on activate button click", async () => {
      const mockPatientsResponse = {
        patients: [
          {
            id: "patient-1",
            name: [{ given: ["John"], family: "Doe" }],
            birthDate: "1980-01-01",
            gender: "male",
            is_active: false,
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatientsResponse,
      });

      vi.spyOn(apiLib.api, "post").mockResolvedValueOnce({});

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/activate",
        initialRoute: "/admin/patients/activate",
      });

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      });

      const activateButtons = screen.getAllByRole("button", {
        name: /activate/i,
      });
      const activateButton = activateButtons[0]; // First activate button in table

      fireEvent.click(activateButton);

      await waitFor(() => {
        expect(screen.getByText("Confirm activation")).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole("button", { name: /confirm/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(apiLib.api.post).toHaveBeenCalledWith(
          "/patients/patient-1/activate",
        );
        expect(mockNavigate).toHaveBeenCalledWith("/admin/patients");
      });
    });
  });

  describe("Error handling", () => {
    it("displays error when patient fetch fails", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
      });

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/:patientId/activate",
        initialRoute: "/admin/patients/patient-123/activate",
      });

      await waitFor(() => {
        expect(screen.getByText("Error loading patients")).toBeInTheDocument();
        expect(screen.getByText("Failed to fetch patient")).toBeInTheDocument();
      });
    });

    it("displays error when patients list fetch fails", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
      });

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/activate",
        initialRoute: "/admin/patients/activate",
      });

      await waitFor(() => {
        expect(screen.getByText("Error loading patients")).toBeInTheDocument();
        expect(
          screen.getByText("Failed to fetch patients"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Loading state", () => {
    it("shows skeleton loaders while loading patient", async () => {
      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise(() => {
            /* never resolves */
          }),
      );

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/:patientId/activate",
        initialRoute: "/admin/patients/patient-123/activate",
      });

      const skeletonElements = document.querySelectorAll(
        ".mantine-Skeleton-root",
      );
      expect(skeletonElements.length).toBeGreaterThan(0);
    });

    it("shows skeleton loaders while loading patients list", async () => {
      (global.fetch as any).mockImplementationOnce(
        () =>
          new Promise(() => {
            /* never resolves */
          }),
      );

      renderWithRouter(<ActivatePatientPage />, {
        routePath: "/admin/patients/activate",
        initialRoute: "/admin/patients/activate",
      });

      // Check for skeleton loaders
      const skeletonElements = document.querySelectorAll(
        ".mantine-Skeleton-root",
      );
      expect(skeletonElements.length).toBeGreaterThan(0);
    });
  });
});
