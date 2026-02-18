/**
 * PatientAdminPage Component Tests
 *
 * Tests for the patient admin page including:
 * - Loading states
 * - Patient details display
 * - Linked user display
 * - Error handling
 * - Permission checking
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import PatientAdminPage from "./PatientAdminPage";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import * as apiLib from "@/lib/api";

// Mock users with different permission levels
const mockUsers: Record<string, User> = {
  staff: {
    id: "2",
    username: "staff.user",
    email: "staff@example.com",
    system_permissions: "staff",
  },
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

describe("PatientAdminPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Permission checking", () => {
    it("redirects non-admin users to home", async () => {
      const navigate = vi.fn();
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.staff,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });

      // Mock useNavigate
      vi.mock("react-router-dom", async () => {
        const actual = await vi.importActual("react-router-dom");
        return {
          ...actual,
          useNavigate: () => navigate,
          useParams: () => ({ patientId: "patient-123" }),
        };
      });

      renderWithRouter(<PatientAdminPage />, {
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        expect(navigate).toHaveBeenCalledWith("/");
      });
    });
  });

  describe("Patient details display", () => {
    beforeEach(() => {
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

    it("displays patient name from API", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["John"], family: "Doe" }],
        birthDate: "1980-05-15",
        gender: "male",
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockPatient);

      renderWithRouter(<PatientAdminPage />, {
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      });
    });

    it("displays birth date", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["Jane"], family: "Smith" }],
        birthDate: "1990-10-20",
        gender: "female",
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockPatient);

      renderWithRouter(<PatientAdminPage />, {
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        expect(screen.getByText("1990-10-20")).toBeInTheDocument();
      });
    });

    it("displays gender", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["Alex"], family: "Johnson" }],
        birthDate: "1985-03-10",
        gender: "other",
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockPatient);

      renderWithRouter(<PatientAdminPage />, {
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        expect(screen.getByText("Other")).toBeInTheDocument();
      });
    });

    it("displays NHS number when available", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["Sarah"], family: "Williams" }],
        birthDate: "1975-12-05",
        gender: "female",
        identifier: [
          {
            system: "https://fhir.nhs.uk/Id/nhs-number",
            value: "1234567890",
          },
        ],
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockPatient);

      renderWithRouter(<PatientAdminPage />, {
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        expect(screen.getByText("NHS Number")).toBeInTheDocument();
        expect(screen.getByText("1234567890")).toBeInTheDocument();
      });
    });

    it("displays patient ID", async () => {
      const mockPatient = {
        id: "patient-456",
        name: [{ given: ["Michael"], family: "Brown" }],
        birthDate: "2000-01-01",
        gender: "male",
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockPatient);

      renderWithRouter(<PatientAdminPage />, {
        initialRoute: "/admin/patients/patient-456",
      });

      await waitFor(() => {
        expect(screen.getByText("patient-456")).toBeInTheDocument();
      });
    });
  });

  describe("Linked user display", () => {
    beforeEach(() => {
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

    it("shows no linked user message when none exists", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["Emma"], family: "Davis" }],
        birthDate: "1995-07-18",
        gender: "female",
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockPatient);

      renderWithRouter(<PatientAdminPage />, {
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        expect(
          screen.getByText("No user account linked to this patient"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      vi.spyOn(authContext, "useAuth").mockReturnValue({
        state: {
          status: "authenticated",
          user: mockUsers.superadmin,
        },
        login: vi.fn(),
        logout: vi.fn(),
        reload: vi.fn(),
      });
    });

    it("displays error message when API call fails", async () => {
      vi.spyOn(apiLib.api, "get").mockRejectedValue(
        new Error("Failed to fetch patient"),
      );

      renderWithRouter(<PatientAdminPage />, {
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        expect(screen.getByText("Error loading patient")).toBeInTheDocument();
      });
    });
  });

  describe("Loading state", () => {
    beforeEach(() => {
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

    it("shows skeleton loaders while loading", () => {
      vi.spyOn(apiLib.api, "get").mockImplementation(
        () => new Promise(() => {}),
      );

      renderWithRouter(<PatientAdminPage />, {
        initialRoute: "/admin/patients/patient-123",
      });

      const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });
});
