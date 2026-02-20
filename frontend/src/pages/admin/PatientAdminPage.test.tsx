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

/* eslint-disable no-restricted-syntax */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import PatientAdminPage from "./PatientAdminPage";
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
    mockNavigate.mockClear();

    // Mock auth context to return admin user (permission checking is done by RequirePermission HOC)
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

  describe("Patient details display", () => {
    it("displays patient name from API", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["John"], family: "Doe" }],
        birthDate: "1980-05-15",
        gender: "male",
      };

      vi.spyOn(apiLib.api, "get").mockResolvedValue(mockPatient);

      renderWithRouter(<PatientAdminPage />, {
        routePath: "/admin/patients/:patientId",
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        const names = screen.getAllByText("John Doe");
        expect(names.length).toBe(2); // Appears in title and details
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
        routePath: "/admin/patients/:patientId",
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
        routePath: "/admin/patients/:patientId",
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        expect(screen.getByText("other")).toBeInTheDocument();
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
        routePath: "/admin/patients/:patientId",
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
        routePath: "/admin/patients/:patientId",
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
        routePath: "/admin/patients/:patientId",
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
        routePath: "/admin/patients/:patientId",
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
        routePath: "/admin/patients/:patientId",
        initialRoute: "/admin/patients/patient-123",
      });

      const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Action cards", () => {
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

    it("displays deactivate patient action card", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["John"], family: "Doe" }],
        birthDate: "1980-05-15",
        gender: "male",
      };

      vi.spyOn(apiLib.api, "get")
        .mockResolvedValueOnce(mockPatient) // First call for patient data
        .mockResolvedValueOnce({ is_active: true }); // Second call for metadata

      renderWithRouter(<PatientAdminPage />, {
        routePath: "/admin/patients/:patientId",
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        const deactivateCards = screen.getAllByText("Deactivate patient");
        expect(deactivateCards.length).toBeGreaterThan(0);
        expect(
          screen.getByText("Deactivate this patient record"),
        ).toBeInTheDocument();
      });
    });

    it("displays activate patient action card when patient is inactive", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["John"], family: "Doe" }],
        birthDate: "1980-05-15",
        gender: "male",
      };

      vi.spyOn(apiLib.api, "get")
        .mockResolvedValueOnce(mockPatient) // First call for patient data
        .mockResolvedValueOnce({ is_active: false }); // Second call for metadata

      renderWithRouter(<PatientAdminPage />, {
        routePath: "/admin/patients/:patientId",
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        const activateCards = screen.getAllByText("Activate patient");
        expect(activateCards.length).toBeGreaterThan(0);
        expect(
          screen.getByText("Reactivate this patient record"),
        ).toBeInTheDocument();
      });
    });

    it("navigates to patient-specific edit page when edit icon clicked", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["John"], family: "Doe" }],
        birthDate: "1980-05-15",
        gender: "male",
      };

      vi.spyOn(apiLib.api, "get")
        .mockResolvedValueOnce(mockPatient) // First call for patient data
        .mockResolvedValueOnce({ is_active: true }); // Second call for metadata

      renderWithRouter(<PatientAdminPage />, {
        routePath: "/admin/patients/:patientId",
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        const patientNames = screen.getAllByText("John Doe");
        expect(patientNames.length).toBeGreaterThan(0);
      });

      const editButton = screen.getByRole("button", {
        name: /edit patient details/i,
      });

      fireEvent.click(editButton);

      expect(mockNavigate).toHaveBeenCalledWith(
        "/admin/patients/patient-123/edit",
        expect.objectContaining({
          state: expect.objectContaining({
            patient: mockPatient,
          }),
        }),
      );
    });

    it("navigates to patient-specific deactivate page when deactivate card clicked", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["John"], family: "Doe" }],
        birthDate: "1980-05-15",
        gender: "male",
      };

      vi.spyOn(apiLib.api, "get")
        .mockResolvedValueOnce(mockPatient) // First call for patient data
        .mockResolvedValueOnce({ is_active: true }); // Second call for metadata

      renderWithRouter(<PatientAdminPage />, {
        routePath: "/admin/patients/:patientId",
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        const patientNames = screen.getAllByText("John Doe");
        expect(patientNames.length).toBeGreaterThan(0);
      });

      const deactivateButtons = screen.getAllByRole("button", {
        name: /deactivate patient/i,
      });
      const deactivateButton = deactivateButtons[deactivateButtons.length - 1]; // Get the action card button

      fireEvent.click(deactivateButton);

      expect(mockNavigate).toHaveBeenCalledWith(
        "/admin/patients/patient-123/deactivate",
        expect.objectContaining({
          state: expect.objectContaining({
            patient: mockPatient,
          }),
        }),
      );
    });
  });

  describe("Gradient index extraction", () => {
    it("extracts gradientIndex from FHIR extension", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["John"], family: "Doe" }],
        birthDate: "1980-05-15",
        gender: "male",
        extension: [
          {
            url: "urn:quillmedical:avatar-gradient",
            valueInteger: 12,
          },
        ],
      };

      const mockSetPatient = vi.fn();

      // Mock outlet context with setPatient
      vi.spyOn(
        await import("react-router-dom"),
        "useOutletContext",
      ).mockReturnValue({
        setPatient: mockSetPatient,
      });

      vi.spyOn(apiLib.api, "get")
        .mockResolvedValueOnce(mockPatient) // First call for patient data
        .mockResolvedValueOnce({ is_active: true }); // Second call for metadata

      renderWithRouter(<PatientAdminPage />, {
        routePath: "/admin/patients/:patientId",
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        expect(mockSetPatient).toHaveBeenCalledWith(
          expect.objectContaining({
            gradientIndex: 12,
          }),
        );
      });
    });

    it("handles missing gradient extension gracefully", async () => {
      const mockPatient = {
        id: "patient-123",
        name: [{ given: ["Jane"], family: "Smith" }],
        birthDate: "1990-08-25",
        gender: "female",
      };

      const mockSetPatient = vi.fn();

      // Mock outlet context with setPatient
      vi.spyOn(
        await import("react-router-dom"),
        "useOutletContext",
      ).mockReturnValue({
        setPatient: mockSetPatient,
      });

      vi.spyOn(apiLib.api, "get")
        .mockResolvedValueOnce(mockPatient) // First call for patient data
        .mockResolvedValueOnce({ is_active: true }); // Second call for metadata

      renderWithRouter(<PatientAdminPage />, {
        routePath: "/admin/patients/:patientId",
        initialRoute: "/admin/patients/patient-123",
      });

      await waitFor(() => {
        expect(mockSetPatient).toHaveBeenCalledWith(
          expect.objectContaining({
            gradientIndex: undefined,
          }),
        );
      });
    });
  });
});
