/**
 * AdminPatientsPage Component Tests
 *
 * Tests for the admin patients page including:
 * - Loading states
 * - Patient list display
 * - FHIR readiness polling
 * - Add patient button
 * - Patient navigation
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AdminPatientsPage from "./AdminPatientsPage";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import * as apiLib from "@/lib/api";

// Mock navigate function
const mockNavigate = vi.fn();

// Mock react-router-dom
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock users with different permission levels
const mockUsers: Record<string, User> = {
  admin: {
    id: "3",
    username: "admin.user",
    email: "admin@example.com",
    system_permissions: "admin",
  },
  superadmin: {
    id: "4",
    username: "superadmin.user",
    email: "superadmin@example.com",
    system_permissions: "superadmin",
  },
};

describe("AdminPatientsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock auth context to return admin user
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: {
        status: "authenticated",
        user: mockUsers.admin,
      },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    });
  });

  describe("Page layout", () => {
    it("displays page title", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [],
        fhir_ready: true,
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      await waitFor(() => {
        expect(screen.getByText("Patient management")).toBeInTheDocument();
      });
    });

    it("displays page description", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [],
        fhir_ready: true,
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      await waitFor(() => {
        expect(
          screen.getByText("View and manage all patient records"),
        ).toBeInTheDocument();
      });
    });

    it("displays add patient button", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [],
        fhir_ready: true,
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      await waitFor(() => {
        expect(screen.getByText("Add patient")).toBeInTheDocument();
      });
    });
  });

  describe("Patient list display", () => {
    it("displays patients in a table", async () => {
      const mockPatients = [
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
      ];

      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: mockPatients,
        fhir_ready: true,
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
        expect(screen.getByText("Jane Smith")).toBeInTheDocument();
        expect(screen.getByText("1980-05-15")).toBeInTheDocument();
        expect(screen.getByText("1990-10-20")).toBeInTheDocument();
      });
    });

    it("displays patient gender", async () => {
      const mockPatients = [
        {
          id: "patient-1",
          name: [{ given: ["Alex"], family: "Johnson" }],
          birthDate: "1985-03-10",
          gender: "other",
        },
      ];

      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: mockPatients,
        fhir_ready: true,
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      await waitFor(() => {
        expect(screen.getByText("other")).toBeInTheDocument();
      });
    });

    it("displays patient IDs", async () => {
      const mockPatients = [
        {
          id: "patient-123",
          name: [{ given: ["Sarah"], family: "Williams" }],
          birthDate: "1975-12-05",
          gender: "female",
        },
      ];

      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: mockPatients,
        fhir_ready: true,
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      await waitFor(() => {
        expect(screen.getByText("patient-123")).toBeInTheDocument();
      });
    });
  });

  describe("Empty states", () => {
    it("shows no patients message when list is empty", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [],
        fhir_ready: true,
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      await waitFor(() => {
        expect(screen.getByText("No patients to show")).toBeInTheDocument();
      });
    });

    it("shows database initialising message when FHIR not ready", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [],
        fhir_ready: false,
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      await waitFor(() => {
        expect(
          screen.getByText("Database is initialising"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("FHIR readiness polling", () => {
    it("polls API when FHIR is not ready", async () => {
      let callCount = 0;
      vi.spyOn(apiLib.api, "get").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            patients: [],
            fhir_ready: false,
          };
        }
        return {
          patients: [
            {
              id: "patient-1",
              name: [{ given: ["Test"], family: "Patient" }],
              birthDate: "2000-01-01",
              gender: "male",
            },
          ],
          fhir_ready: true,
        };
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      // First call shows database initialising
      await waitFor(() => {
        expect(
          screen.getByText("Database is initialising"),
        ).toBeInTheDocument();
      });

      // Wait for second call and patients to appear
      await waitFor(
        () => {
          expect(screen.getByText("Test Patient")).toBeInTheDocument();
        },
        { timeout: 8000 },
      );

      expect(callCount).toBe(2);
    }, 10000); // 10 second test timeout
  });

  describe("Error handling", () => {
    it("displays error message when API call fails", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue(
        new Error("Failed to fetch patients"),
      );

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
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
    it("shows skeleton loaders while loading", () => {
      vi.spyOn(apiLib.api, "get").mockImplementation(
        () => new Promise(() => {}),
      );

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Navigation", () => {
    beforeEach(() => {
      mockNavigate.mockClear();
    });

    it("navigates to patient admin page when row clicked", async () => {
      const mockPatients = [
        {
          id: "patient-123",
          name: [{ given: ["John"], family: "Doe" }],
          birthDate: "1980-05-15",
          gender: "male",
        },
      ];

      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: mockPatients,
        fhir_ready: true,
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      });

      const row = screen.getByText("John Doe").closest("tr");
      if (row) {
        await userEvent.click(row);
      }

      expect(mockNavigate).toHaveBeenCalledWith("/admin/patients/patient-123");
    });

    it("navigates to new patient page when add button clicked", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({
        patients: [],
        fhir_ready: true,
      });

      renderWithRouter(<AdminPatientsPage />, {
        initialRoute: "/admin/patients",
      });

      await waitFor(() => {
        expect(screen.getByText("Add patient")).toBeInTheDocument();
      });

      const addButton = screen.getByText("Add patient");
      await userEvent.click(addButton);

      expect(mockNavigate).toHaveBeenCalledWith("/admin/patients/new");
    });
  });
});
