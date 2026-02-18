/**
 * Admin Component Tests
 *
 * Tests for the administrative interface including user management,
 * patient management, linking, and permission management.
 */

import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import Admin from "./Admin";

const mockUsers = [
  { id: "1", username: "johndoe", email: "john.doe@hospital.com" },
  { id: "2", username: "janedoe", email: "jane.doe@hospital.com" },
  { id: "3", username: "drsmith", email: "dr.smith@hospital.com" },
];

const mockPatients = [
  { id: "p1", name: "Alice Johnson" },
  { id: "p2", name: "Bob Williams" },
  { id: "p3", name: "Carol Davis" },
];

describe("Admin", () => {
  describe("Basic rendering", () => {
    it("renders administration title", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("Administration")).toBeInTheDocument();
    });

    it("renders description text", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);
      expect(
        screen.getByText("Manage users, patients, and system permissions"),
      ).toBeInTheDocument();
    });

    it("renders permission badge for superadmin", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
    });

    it("renders permission badge for admin", () => {
      renderWithRouter(<Admin userPermissions="admin" />);
      expect(screen.getByText("ADMIN")).toBeInTheDocument();
    });

    it("renders permission badge for staff", () => {
      renderWithRouter(<Admin userPermissions="staff" />);
      expect(screen.getByText("STAFF")).toBeInTheDocument();
    });
  });

  describe("Statistics display", () => {
    it("displays total users count", () => {
      renderWithRouter(
        <Admin userPermissions="superadmin" existingUsers={mockUsers} />,
      );
      expect(screen.getByText("Total users")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("displays total patients count", () => {
      renderWithRouter(
        <Admin userPermissions="superadmin" existingPatients={mockPatients} />,
      );
      expect(screen.getByText("Total patients")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("displays zero counts when no data", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);
      expect(screen.getAllByText("0")).toHaveLength(2);
    });

    it("shows skeleton loaders when loading", () => {
      renderWithRouter(
        <Admin
          userPermissions="superadmin"
          usersLoading={true}
          patientsLoading={true}
          existingUsers={mockUsers}
        />,
      );
      const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("shows skeleton loader only for patients when FHIR is initializing", () => {
      renderWithRouter(
        <Admin
          userPermissions="superadmin"
          usersLoading={false}
          patientsLoading={true}
          existingUsers={mockUsers}
          existingPatients={[]}
        />,
      );
      // Should show Total Users value (3) but Total Patients as loading
      expect(screen.getByText("3")).toBeInTheDocument();
      const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Action cards", () => {
    // NOTE: Action cards have been moved to separate admin child pages
    it.skip("renders Add User card", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("Add user")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Create a new user account with competencies and permissions",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Add new user/i }),
      ).toBeInTheDocument();
    });

    it.skip("renders Add Patient card", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("Add patient")).toBeInTheDocument();
      expect(
        screen.getByText("Register a new patient record with demographics"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Add new patient/i }),
      ).toBeInTheDocument();
    });

    it.skip("renders Edit User card", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);
      expect(
        screen.getByRole("heading", { name: "Edit user" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Update user details, competencies, and permissions"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Edit user/i }),
      ).toBeInTheDocument();
    });

    it.skip("renders Edit Patient card", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);
      expect(
        screen.getByRole("heading", { name: "Edit patient" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Modify patient demographics and information"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Edit patient/i }),
      ).toBeInTheDocument();
    });

    it.skip("renders Link User to Patient card", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);
      expect(
        screen.getByRole("heading", { name: "Link user and patient" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Associate a user account with a patient record"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Create link/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Change System Permissions visibility", () => {
    // NOTE: Change System Permissions has been moved to AdminPermissionsPage
    it.skip("shows Change System Permissions card for superadmin", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("Change system permissions")).toBeInTheDocument();
      expect(
        screen.getByText(
          "View and edit user competencies and system permissions",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Change permissions/i }),
      ).toBeInTheDocument();
    });

    it.skip("does not show Change System Permissions card for admin", () => {
      renderWithRouter(<Admin userPermissions="admin" />);
      expect(
        screen.queryByText("Change system permissions"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Change permissions/i }),
      ).not.toBeInTheDocument();
    });

    it.skip("does not show Change System Permissions card for staff", () => {
      renderWithRouter(<Admin userPermissions="staff" />);
      expect(
        screen.queryByText("Change system permissions"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Change permissions/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Add User Navigation", () => {
    // NOTE: Add User functionality is now on AdminUsersPage
    it.skip("has correct link to create new user page", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);

      const addUserButton = screen.getByRole("link", {
        name: /Add New User/i,
      });
      expect(addUserButton).toHaveAttribute("href", "/admin/users/new");
    });
  });

  // Modal tests are now obsolete - modals replaced with dedicated pages
  describe.skip("Add User Modal (Obsolete)", () => {
    it("opens Add User modal when button clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<Admin userPermissions="superadmin" />);

      await user.click(screen.getByRole("button", { name: /Add New User/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New User/i }),
        ).toBeInTheDocument();
      });
    });

    it("closes Add User modal when cancel clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<Admin userPermissions="superadmin" />);

      await user.click(screen.getByRole("button", { name: /Add New User/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New User/i }),
        ).toBeInTheDocument();
      });

      const cancelButtons = screen.getAllByRole("button", { name: /Cancel/i });
      await user.click(cancelButtons[0]);

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: /Add New User/i }),
        ).not.toBeInTheDocument();
      });
    });

    // TODO: Fix - form fields don't render in test environment (Mantine Modal + Portal issue)
    it.skip("calls onAddUser when form submitted", async () => {
      const user = userEvent.setup();
      renderWithRouter(<Admin userPermissions="superadmin" />);

      await user.click(screen.getByRole("button", { name: /Add New User/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New User/i }),
        ).toBeInTheDocument();
      });

      // Wait for form fields to render
      await waitFor(
        () => {
          expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Fill form fields
      await user.type(screen.getByLabelText(/Full Name/i), "New User");
      await user.type(
        screen.getByLabelText(/^Email$/i),
        "new.user@hospital.com",
      );
      await user.type(screen.getByLabelText(/Username/i), "newuser");

      // Submit form
      const addButtons = screen.getAllByRole("button", { name: /^Add User$/i });
      await user.click(addButtons[addButtons.length - 1]);

      await waitFor(() => {
        // expect(onAddUser).toHaveBeenCalledWith(
        //   expect.objectContaining({
        //     name: "New User",
        //     email: "new.user@hospital.com",
        //     username: "newuser",
        //     systemPermissions: "staff",
        //   }),
        // );
      });
    });
  });

  describe("Add Patient Navigation", () => {
    // NOTE: Add Patient functionality is now on AdminPatientsPage
    it.skip("has correct link to create new patient page", () => {
      renderWithRouter(<Admin userPermissions="superadmin" />);

      const addPatientButton = screen.getByRole("link", {
        name: /Add New Patient/i,
      });
      expect(addPatientButton).toHaveAttribute("href", "/admin/patients/new");
    });
  });

  // Modal tests are now obsolete - modals replaced with dedicated pages
  describe.skip("Add Patient Modal (Obsolete)", () => {
    it("opens Add Patient modal when button clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<Admin userPermissions="superadmin" />);

      await user.click(
        screen.getByRole("button", { name: /Add New Patient/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New Patient/i }),
        ).toBeInTheDocument();
      });
    });

    it("closes Add Patient modal when cancel clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<Admin userPermissions="superadmin" />);

      await user.click(
        screen.getByRole("button", { name: /Add New Patient/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New Patient/i }),
        ).toBeInTheDocument();
      });

      const cancelButtons = screen.getAllByRole("button", { name: /Cancel/i });
      await user.click(cancelButtons[0]);

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: /Add New Patient/i }),
        ).not.toBeInTheDocument();
      });
    });

    it("calls onAddPatient when form submitted", async () => {
      const user = userEvent.setup();
      renderWithRouter(<Admin userPermissions="superadmin" />);

      await user.click(
        screen.getByRole("button", { name: /Add New Patient/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New Patient/i }),
        ).toBeInTheDocument();
      });

      // Fill form fields
      await user.type(screen.getByLabelText(/First Name/i), "Alice");
      await user.type(screen.getByLabelText(/Last Name/i), "Smith");
      await user.type(screen.getByLabelText(/Date of Birth/i), "1990-05-15");

      // Submit form
      const addButtons = screen.getAllByRole("button", {
        name: /Add Patient/i,
      });
      await user.click(addButtons[addButtons.length - 1]);

      await waitFor(() => {
        // expect(onAddPatient).toHaveBeenCalledWith(
        //   expect.objectContaining({
        //     firstName: "Alice",
        //     lastName: "Smith",
        //     dob: "1990-05-15",
        //   }),
        // );
      });
    });
  });

  describe("Link User to Patient Modal", () => {
    // TODO: Fix - form fields don't render in test environment (Mantine Modal + Portal issue)
    it.skip("opens Link modal when button clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <Admin
          userPermissions="superadmin"
          existingUsers={mockUsers}
          existingPatients={mockPatients}
        />,
      );

      await user.click(screen.getByRole("button", { name: /Create Link/i }));

      await waitFor(() => {
        expect(screen.getByText("Link User to Patient")).toBeInTheDocument();
      });
    });

    // TODO: Fix - form fields don't render in test environment (Mantine Modal + Portal issue)
    it.skip("closes Link modal when cancel clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <Admin
          userPermissions="superadmin"
          existingUsers={mockUsers}
          existingPatients={mockPatients}
        />,
      );

      await user.click(screen.getByRole("button", { name: /Create Link/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Link User to Patient/i }),
        ).toBeInTheDocument();
      });

      const cancelButtons = screen.getAllByRole("button", { name: /Cancel/i });
      await user.click(cancelButtons[0]);

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: /Add New Patient/i }),
        ).not.toBeInTheDocument();
      });
    });

    // TODO: Fix - form fields don't render in test environment (Mantine Modal + Portal issue)
    it.skip("displays existing users and patients in selects", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <Admin
          userPermissions="superadmin"
          existingUsers={mockUsers}
          existingPatients={mockPatients}
        />,
      );

      await user.click(screen.getByRole("button", { name: /Create Link/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Link User to Patient/i }),
        ).toBeInTheDocument();
      });

      // Wait for form fields to render
      await waitFor(
        () => {
          expect(screen.getByLabelText(/Select User/i)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      expect(screen.getByLabelText(/Select Patient/i)).toBeInTheDocument();
    });
  });

  describe("Change Permissions Modal", () => {
    // NOTE: Change Permissions modal has been moved to AdminPermissionsPage
    it.skip("opens Change Permissions modal for superadmin", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <Admin userPermissions="superadmin" existingUsers={mockUsers} />,
      );

      await user.click(
        screen.getByRole("button", { name: /Change Permissions/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Manage user permissions")).toBeInTheDocument();
      });
    });

    it.skip("closes Change Permissions modal when cancel clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <Admin userPermissions="superadmin" existingUsers={mockUsers} />,
      );

      await user.click(
        screen.getByRole("button", { name: /Change Permissions/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Manage user permissions")).toBeInTheDocument();
      });

      const cancelButtons = screen.getAllByRole("button", { name: /Cancel/i });
      await user.click(cancelButtons[0]);

      await waitFor(() => {
        expect(
          screen.queryByText("Manage user permissions"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Callbacks", () => {
    // TODO: Fix - form fields don't render in test environment (Mantine Modal + Portal issue)
    it.skip("calls callbacks with correct data types", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <Admin
          userPermissions="superadmin"
          existingUsers={mockUsers}
          existingPatients={mockPatients}
        />,
      );

      // Test Add User callback
      await user.click(screen.getByRole("button", { name: /Add New User/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New User/i }),
        ).toBeInTheDocument();
      });

      // Wait for form fields to render
      await waitFor(
        () => {
          expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      await user.type(screen.getByLabelText(/Full Name/i), "Test User");
      await user.type(screen.getByLabelText(/^Email$/i), "test@test.com");
      await user.type(screen.getByLabelText(/Username/i), "testuser");
      const addUserButtons = screen.getAllByRole("button", {
        name: /^Add User$/i,
      });
      await user.click(addUserButtons[addUserButtons.length - 1]);

      await waitFor(() => {
        // expect(onAddUser).toHaveBeenCalled();
      });
    });
  });

  describe("Edge cases", () => {
    it("handles empty users array", () => {
      renderWithRouter(
        <Admin userPermissions="superadmin" existingUsers={[]} />,
      );
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThan(0);
    });

    it("handles empty patients array", () => {
      renderWithRouter(
        <Admin userPermissions="superadmin" existingPatients={[]} />,
      );
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThan(0);
    });

    // Test is obsolete - modal callbacks replaced with navigation to dedicated pages
    it.skip("handles undefined callbacks gracefully", async () => {
      const user = userEvent.setup();
      renderWithRouter(<Admin userPermissions="superadmin" />);

      await user.click(screen.getByRole("button", { name: /Add New User/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New User/i }),
        ).toBeInTheDocument();
      });

      // Should not throw error even without callback
      const addButtons = screen.getAllByRole("button", { name: /^Add User$/i });
      await user.click(addButtons[addButtons.length - 1]);

      // Modal should close after submission
      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: /Add New User/i }),
        ).not.toBeInTheDocument();
      });
    });

    it("renders with patient permission level", () => {
      renderWithRouter(<Admin userPermissions="patient" />);
      expect(screen.getByText("PATIENT")).toBeInTheDocument();
    });
  });

  describe("Form reset", () => {
    // TODO: Fix - form fields don't render in test environment (Mantine Modal + Portal issue)
    it.skip("resets user form after successful submission", async () => {
      const user = userEvent.setup();
      renderWithRouter(<Admin userPermissions="superadmin" />);

      // Open modal and fill form
      await user.click(screen.getByRole("button", { name: /Add New User/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New User/i }),
        ).toBeInTheDocument();
      });

      // Wait for form fields to render
      await waitFor(
        () => {
          expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      await user.type(screen.getByLabelText(/Full Name/i), "Test User");
      await user.type(screen.getByLabelText(/^Email$/i), "test@test.com");
      await user.type(screen.getByLabelText(/Username/i), "testuser");

      // Submit
      const addButtons = screen.getAllByRole("button", { name: /^Add User$/i });
      await user.click(addButtons[addButtons.length - 1]);

      await waitFor(() => {
        // expect(onAddUser).toHaveBeenCalled();
      });

      // Modal should close
      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: /Add New User/i }),
        ).not.toBeInTheDocument();
      });

      // Open modal again and check form is reset
      await user.click(screen.getByRole("button", { name: /Add New User/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New User/i }),
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/Full Name/i) as HTMLInputElement;
      expect(nameInput.value).toBe("");
    });
  });
});
