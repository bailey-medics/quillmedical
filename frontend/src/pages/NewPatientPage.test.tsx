/**
 * NewPatientPage Component Tests
 *
 * Tests multi-step patient creation form:
 * - Step navigation
 * - Form validation
 * - Optional user account creation
 * - API submission
 * - Editing an existing patient, which the page does when its address
 *   carries the patient's id
 *
 * The Sex field is a Mantine Select, which is a combobox and not a textbox.
 * Eleven of these tests were skipped for months on the belief that a Select
 * could not be opened under JSDOM. It can: they were asking for the wrong
 * role, and typing the national number into the box beside it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiModule from "@/lib/api";
import NewPatientPage from "./NewPatientPage";

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: () => ({ state: "unblocked" }),
  };
});

describe("NewPatientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Step 1: Demographics", () => {
    it("renders step 1 with all required fields", () => {
      renderWithRouter(<NewPatientPage />);

      expect(screen.getByText("Create new patient")).toBeInTheDocument();
      expect(screen.getAllByLabelText(/first name/i)[0]).toBeInTheDocument();
      expect(screen.getAllByLabelText(/last name/i)[0]).toBeInTheDocument();
      expect(screen.getAllByLabelText(/date of birth/i)[0]).toBeInTheDocument();
      expect(screen.getAllByLabelText(/sex/i)[0]).toBeInTheDocument();
      expect(
        screen.getAllByLabelText(/national number system/i)[0],
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("1234567890")).toBeInTheDocument();
    });

    it("shows validation errors when trying to proceed with empty fields", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("First name is required")).toBeInTheDocument();
      });
      expect(screen.getByText("Last name is required")).toBeInTheDocument();
      expect(screen.getByText("Date of birth is required")).toBeInTheDocument();
      expect(screen.getByText("Sex is required")).toBeInTheDocument();
      expect(
        screen.getByText("National number is required"),
      ).toBeInTheDocument();
    });

    it("proceeds to step 2 when validation passes", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      // Fill all required fields
      await user.type(screen.getAllByLabelText(/first name/i)[0], "Jane");
      await user.type(screen.getAllByLabelText(/last name/i)[0], "Smith");
      await user.type(
        screen.getAllByLabelText(/date of birth/i)[0],
        "1980-05-12",
      );

      // A Mantine Select is a combobox, and opens when clicked.
      await user.click(screen.getByRole("combobox", { name: /sex/i }));
      await user.click(screen.getByRole("option", { name: /female/i }));

      await user.type(screen.getByPlaceholderText("1234567890"), "1234567890");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });
    });
  });

  describe("Step 2: User Account", () => {
    async function fillStep1AndProceed(
      user: ReturnType<typeof userEvent.setup>,
    ) {
      await user.type(screen.getAllByLabelText(/first name/i)[0], "Jane");
      await user.type(screen.getAllByLabelText(/last name/i)[0], "Smith");
      await user.type(
        screen.getAllByLabelText(/date of birth/i)[0],
        "1980-05-12",
      );

      await user.click(screen.getByRole("combobox", { name: /sex/i }));
      await user.click(screen.getByRole("option", { name: /female/i }));

      // Wait for the select value to be set
      await waitFor(() => {
        expect(
          screen.getByRole<HTMLInputElement>("combobox", { name: /sex/i })
            .value,
        ).toBe("Female");
      });

      await user.type(screen.getByPlaceholderText("1234567890"), "1234567890");

      await user.click(screen.getByRole("button", { name: /next/i }));
    }

    it("renders user account option checkbox", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });
      expect(
        screen.getByLabelText(/create user account for patient portal access/i),
      ).toBeInTheDocument();
    });

    it("shows user account fields when checkbox is enabled", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });

      // Enable checkbox
      await user.click(
        screen.getByLabelText(/create user account for patient portal access/i),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/initial password/i)).toBeInTheDocument();
    });

    it("validates user account fields when enabled", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });

      // Enable checkbox
      await user.click(
        screen.getByLabelText(/create user account for patient portal access/i),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      // Try to submit without filling fields
      await user.click(screen.getByRole("button", { name: /add patient/i }));

      await waitFor(() => {
        expect(screen.getByText("Email is required")).toBeInTheDocument();
      });
      expect(screen.getByText("Username is required")).toBeInTheDocument();
      expect(screen.getByText("Password is required")).toBeInTheDocument();
    });

    it("validates email format", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });

      await user.click(
        screen.getByLabelText(/create user account for patient portal access/i),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/email/i), "invalid-email");

      await user.click(screen.getByRole("button", { name: /add patient/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid email format")).toBeInTheDocument();
      });
    });

    it("validates password length", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });

      await user.click(
        screen.getByLabelText(/create user account for patient portal access/i),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/initial password/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/initial password/i), "short");

      await user.click(screen.getByRole("button", { name: /add patient/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Password must be at least 8 characters"),
        ).toBeInTheDocument();
      });
    });

    it("navigates back to step 1", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /back/i }));

      await waitFor(() => {
        expect(screen.getByText("Patient demographics")).toBeInTheDocument();
      });
    });
  });

  describe("Form submission", () => {
    it("submits patient data without user account", async () => {
      const mockPost = vi.fn().mockResolvedValue({ id: "patient-123" });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      // Fill demographics
      await user.type(screen.getAllByLabelText(/first name/i)[0], "Jane");
      await user.type(screen.getAllByLabelText(/last name/i)[0], "Smith");
      await user.type(
        screen.getAllByLabelText(/date of birth/i)[0],
        "1980-05-12",
      );

      await user.click(screen.getByRole("combobox", { name: /sex/i }));
      await user.click(screen.getByRole("option", { name: /female/i }));

      await user.type(screen.getByPlaceholderText("1234567890"), "1234567890");

      await user.click(screen.getByRole("button", { name: /next/i }));

      // Skip user account creation
      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /add patient/i }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/patients",
          expect.objectContaining({
            given_name: "Jane",
            family_name: "Smith",
            birth_date: "1980-05-12",
            nhs_number: "1234567890",
          }),
        );
      });
    });

    it("submits patient and user account when enabled", async () => {
      const mockPost = vi
        .fn()
        .mockResolvedValueOnce({ id: "patient-123" })
        .mockResolvedValueOnce({ id: 1 });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      // Fill demographics
      await user.type(screen.getAllByLabelText(/first name/i)[0], "Jane");
      await user.type(screen.getAllByLabelText(/last name/i)[0], "Smith");
      await user.type(
        screen.getAllByLabelText(/date of birth/i)[0],
        "1980-05-12",
      );

      await user.click(screen.getByRole("combobox", { name: /sex/i }));
      await user.click(screen.getByRole("option", { name: /female/i }));

      await user.type(screen.getByPlaceholderText("1234567890"), "1234567890");

      await user.click(screen.getByRole("button", { name: /next/i }));

      // Enable user account
      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });
      await user.click(
        screen.getByLabelText(/create user account for patient portal access/i),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      await user.click(screen.getByRole("button", { name: /add patient/i }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/patients",
          expect.objectContaining({
            given_name: "Jane",
            family_name: "Smith",
          }),
        );
      });

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith("/auth/register", {
          username: "janesmith",
          email: "jane.smith@example.com",
          password: "password123",
        });
      });
    });

    it("shows success confirmation after successful submission", async () => {
      const mockPost = vi.fn().mockResolvedValue({ id: "patient-123" });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      // Fill and submit
      await user.type(screen.getAllByLabelText(/first name/i)[0], "Jane");
      await user.type(screen.getAllByLabelText(/last name/i)[0], "Smith");
      await user.type(
        screen.getAllByLabelText(/date of birth/i)[0],
        "1980-05-12",
      );

      await user.click(screen.getByRole("combobox", { name: /sex/i }));
      await user.click(screen.getByRole("option", { name: /female/i }));

      await user.type(screen.getByPlaceholderText("1234567890"), "1234567890");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add patient/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Patient created successfully"),
        ).toBeInTheDocument();
      });
      expect(screen.getByText(/patient id: patient-123/i)).toBeInTheDocument();
    });
  });

  describe("Navigation", () => {
    it("navigates back to admin when cancel is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(mockNavigate).toHaveBeenCalledWith("/admin");
    });

    it("navigates back to admin from confirmation", async () => {
      const mockPost = vi.fn().mockResolvedValue({ id: "patient-123" });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      const user = userEvent.setup();
      renderWithRouter(<NewPatientPage />);

      // Complete form
      await user.type(screen.getAllByLabelText(/first name/i)[0], "Jane");
      await user.type(screen.getAllByLabelText(/last name/i)[0], "Smith");
      await user.type(
        screen.getAllByLabelText(/date of birth/i)[0],
        "1980-05-12",
      );

      await user.click(screen.getByRole("combobox", { name: /sex/i }));
      await user.click(screen.getByRole("option", { name: /female/i }));

      await user.type(screen.getByPlaceholderText("1234567890"), "1234567890");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("User account (optional)")).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /add patient/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Patient created successfully"),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /return to admin/i }),
      );

      expect(mockNavigate).toHaveBeenCalledWith("/admin");
    });
  });

  describe("Editing an existing patient", () => {
    const NHS_NUMBER_SYSTEM = "https://fhir.nhs.uk/Id/nhs-number";

    const patient = {
      name: [{ given: ["Jane"], family: "Smith" }],
      birthDate: "1980-05-12",
      gender: "female",
      identifier: [
        { system: "https://example.org/local-id", value: "LOCAL-1" },
        { system: NHS_NUMBER_SYSTEM, value: "1234567890" },
      ],
    };

    function renderEditing() {
      return renderWithRouter(<NewPatientPage />, {
        routePath: "/admin/patients/:id/edit",
        initialRoute: "/admin/patients/p-42/edit",
      });
    }

    function mockGet(value: unknown) {
      const get = vi.fn().mockResolvedValue(value);
      (apiModule.api.get as ReturnType<typeof vi.fn>) = get;

      return get;
    }

    function mockPatch() {
      const patch = vi.fn().mockResolvedValue({});
      (apiModule.api.patch as ReturnType<typeof vi.fn>) = patch;

      return patch;
    }

    it("fetches the patient named in the address", async () => {
      const get = mockGet(patient);

      renderEditing();

      await screen.findByDisplayValue("Jane");

      expect(get).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledWith("/patients/p-42");
    });

    it("says it is loading until the patient arrives", () => {
      (apiModule.api.get as ReturnType<typeof vi.fn>) = vi
        .fn()
        .mockReturnValue(new Promise(() => {}));

      renderEditing();

      expect(screen.getByText("Edit patient")).toBeInTheDocument();
      expect(screen.getByText("Loading patient data...")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Loading patient");
      expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    });

    it("fills the form with what the patient record holds", async () => {
      mockGet(patient);

      renderEditing();

      expect(await screen.findByDisplayValue("Jane")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Smith")).toBeInTheDocument();
      expect(screen.getByDisplayValue("1980-05-12")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /sex/i })).toHaveValue(
        "Female",
      );
      // The NHS number, and not the identifier of another kind before it.
      expect(screen.getByPlaceholderText("1234567890")).toHaveValue(
        "1234567890",
      );
    });

    it("is titled for editing and offers no user account step", async () => {
      mockGet(patient);

      renderEditing();

      await screen.findByDisplayValue("Jane");

      expect(screen.getByText("Edit patient")).toBeInTheDocument();
      expect(screen.queryByText("Create new patient")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /update patient/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /^next$/i }),
      ).not.toBeInTheDocument();
    });

    it("sends the changed record to that patient, and creates nothing", async () => {
      mockGet(patient);
      const patch = mockPatch();
      const post = vi.fn();
      (apiModule.api.post as ReturnType<typeof vi.fn>) = post;
      const user = userEvent.setup();

      renderEditing();

      const lastName = await screen.findByDisplayValue("Smith");
      await user.clear(lastName);
      await user.type(lastName, "Jones");
      await user.click(screen.getByRole("button", { name: /update patient/i }));

      await waitFor(() => {
        expect(patch).toHaveBeenCalledWith("/patients/p-42", {
          given_name: "Jane",
          family_name: "Jones",
          birth_date: "1980-05-12",
          gender: "female",
          nhs_number: "1234567890",
        });
      });
      expect(patch).toHaveBeenCalledTimes(1);
      expect(post).not.toHaveBeenCalled();
    });

    it("says the patient was updated, and which one", async () => {
      mockGet(patient);
      mockPatch();
      const user = userEvent.setup();

      renderEditing();

      await screen.findByDisplayValue("Jane");
      await user.click(screen.getByRole("button", { name: /update patient/i }));

      expect(
        await screen.findByText("Patient updated successfully"),
      ).toBeInTheDocument();
      expect(screen.getByText("Patient ID: p-42")).toBeInTheDocument();
      expect(
        screen.queryByText("Patient created successfully"),
      ).not.toBeInTheDocument();
    });

    it("says the update failed when the API refuses it", async () => {
      mockGet(patient);
      (apiModule.api.patch as ReturnType<typeof vi.fn>) = vi
        .fn()
        .mockRejectedValue(new Error("Forbidden"));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const user = userEvent.setup();

      renderEditing();

      await screen.findByDisplayValue("Jane");
      await user.click(screen.getByRole("button", { name: /update patient/i }));

      expect(
        await screen.findByText("Failed to update patient"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Patient updated successfully"),
      ).not.toBeInTheDocument();

      consoleError.mockRestore();
    });

    it("sends nothing while a required field is empty", async () => {
      mockGet(patient);
      const patch = mockPatch();
      const user = userEvent.setup();

      renderEditing();

      await user.clear(await screen.findByDisplayValue("Jane"));
      await user.click(screen.getByRole("button", { name: /update patient/i }));

      expect(
        await screen.findByText("First name is required"),
      ).toBeInTheDocument();
      expect(patch).not.toHaveBeenCalled();
    });

    it("leaves a field empty when the record does not hold it", async () => {
      mockGet({ name: [{ family: "Smith" }] });

      renderEditing();

      expect(await screen.findByDisplayValue("Smith")).toBeInTheDocument();
      expect(screen.getAllByLabelText(/first name/i)[0]).toHaveValue("");
      expect(screen.getByPlaceholderText("1234567890")).toHaveValue("");
    });

    it("shows the error, and a way back, when the patient cannot be fetched", async () => {
      (apiModule.api.get as ReturnType<typeof vi.fn>) = vi
        .fn()
        .mockRejectedValue(new Error("Patient not found"));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const user = userEvent.setup();

      renderEditing();

      expect(
        await screen.findByText("Error loading patient"),
      ).toBeInTheDocument();
      expect(screen.getByText("Patient not found")).toBeInTheDocument();
      expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: /return to admin/i }),
      );

      expect(mockNavigate).toHaveBeenCalledWith("/admin");

      consoleError.mockRestore();
    });
  });
});
