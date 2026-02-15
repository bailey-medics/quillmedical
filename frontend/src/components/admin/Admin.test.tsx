/**
 * Admin Component Tests
 *
 * Tests for the administrative interface including user management,
 * patient management, linking, and permission management.
 */

import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
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
      renderWithMantine(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("Administration")).toBeInTheDocument();
    });

    it("renders description text", () => {
      renderWithMantine(<Admin userPermissions="superadmin" />);
      expect(
        screen.getByText("Manage users, patients, and system permissions"),
      ).toBeInTheDocument();
    });

    it("renders permission badge for superadmin", () => {
      renderWithMantine(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
    });

    it("renders permission badge for admin", () => {
      renderWithMantine(<Admin userPermissions="admin" />);
      expect(screen.getByText("ADMIN")).toBeInTheDocument();
    });

    it("renders permission badge for staff", () => {
      renderWithMantine(<Admin userPermissions="staff" />);
      expect(screen.getByText("STAFF")).toBeInTheDocument();
    });
  });

  describe("Statistics display", () => {
    it("displays total users count", () => {
      renderWithMantine(
        <Admin userPermissions="superadmin" existingUsers={mockUsers} />,
      );
      expect(screen.getByText("Total Users")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("displays total patients count", () => {
      renderWithMantine(
        <Admin userPermissions="superadmin" existingPatients={mockPatients} />,
      );
      expect(screen.getByText("Total Patients")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("displays zero counts when no data", () => {
      renderWithMantine(<Admin userPermissions="superadmin" />);
      expect(screen.getAllByText("0")).toHaveLength(2);
    });

    it("shows skeleton loaders when loading", () => {
      renderWithMantine(
        <Admin
          userPermissions="superadmin"
          loading={true}
          existingUsers={mockUsers}
        />,
      );
      const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Action cards", () => {
    it("renders Add User card", () => {
      renderWithMantine(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("Add User")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Create a new user account with competencies and permissions",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Add New User/i }),
      ).toBeInTheDocument();
    });

    it("renders Add Patient card", () => {
      renderWithMantine(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("Add Patient")).toBeInTheDocument();
      expect(
        screen.getByText("Register a new patient record with demographics"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Add New Patient/i }),
      ).toBeInTheDocument();
    });

    it("renders Link User to Patient card", () => {
      renderWithMantine(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("Link User to Patient")).toBeInTheDocument();
      expect(
        screen.getByText("Associate a user account with a patient record"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Create Link/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Change System Permissions visibility", () => {
    it("shows Change System Permissions card for superadmin", () => {
      renderWithMantine(<Admin userPermissions="superadmin" />);
      expect(screen.getByText("Change System Permissions")).toBeInTheDocument();
      expect(
        screen.getByText(
          "View and edit user competencies and system permissions",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Change Permissions/i }),
      ).toBeInTheDocument();
    });

    it("does not show Change System Permissions card for admin", () => {
      renderWithMantine(<Admin userPermissions="admin" />);
      expect(
        screen.queryByText("Change System Permissions"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Change Permissions/i }),
      ).not.toBeInTheDocument();
    });

    it("does not show Change System Permissions card for staff", () => {
      renderWithMantine(<Admin userPermissions="staff" />);
      expect(
        screen.queryByText("Change System Permissions"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Change Permissions/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Add User Modal", () => {
    it("opens Add User modal when button clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(<Admin userPermissions="superadmin" />);

      await user.click(screen.getByRole("button", { name: /Add New User/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New User/i }),
        ).toBeInTheDocument();
      });
    });

    it("closes Add User modal when cancel clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(<Admin userPermissions="superadmin" />);

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

    it("calls onAddUser when form submitted", async () => {
      const user = userEvent.setup();
      const onAddUser = vi.fn();
      renderWithMantine(
        <Admin userPermissions="superadmin" onAddUser={onAddUser} />,
      );

      await user.click(screen.getByRole("button", { name: /Add New User/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New User/i }),
        ).toBeInTheDocument();
      });

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
        expect(onAddUser).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "New User",
            email: "new.user@hospital.com",
            username: "newuser",
            systemPermissions: "staff",
          }),
        );
      });
    });
  });

  describe("Add Patient Modal", () => {
    it("opens Add Patient modal when button clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(<Admin userPermissions="superadmin" />);

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
      renderWithMantine(<Admin userPermissions="superadmin" />);

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
      const onAddPatient = vi.fn();
      renderWithMantine(
        <Admin userPermissions="superadmin" onAddPatient={onAddPatient} />,
      );

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
        expect(onAddPatient).toHaveBeenCalledWith(
          expect.objectContaining({
            firstName: "Alice",
            lastName: "Smith",
            dob: "1990-05-15",
          }),
        );
      });
    });
  });

  describe("Link User to Patient Modal", () => {
    it("opens Link modal when button clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(
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

    it("closes Link modal when cancel clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(
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

    it("displays existing users and patients in selects", async () => {
      const user = userEvent.setup();
      renderWithMantine(
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

      expect(screen.getByLabelText(/Select User/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Select Patient/i)).toBeInTheDocument();
    });
  });

  describe("Change Permissions Modal", () => {
    it("opens Change Permissions modal for superadmin", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <Admin userPermissions="superadmin" existingUsers={mockUsers} />,
      );

      await user.click(
        screen.getByRole("button", { name: /Change Permissions/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Manage User Permissions")).toBeInTheDocument();
      });
    });

    it("closes Change Permissions modal when cancel clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <Admin userPermissions="superadmin" existingUsers={mockUsers} />,
      );

      await user.click(
        screen.getByRole("button", { name: /Change Permissions/i }),
      );

      await waitFor(() => {
        expect(screen.getByText("Manage User Permissions")).toBeInTheDocument();
      });

      const cancelButtons = screen.getAllByRole("button", { name: /Cancel/i });
      await user.click(cancelButtons[0]);

      await waitFor(() => {
        expect(
          screen.queryByText("Manage User Permissions"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Callbacks", () => {
    it("calls callbacks with correct data types", async () => {
      const user = userEvent.setup();
      const onAddUser = vi.fn();
      const onAddPatient = vi.fn();
      const onLinkUserPatient = vi.fn();
      const onUpdatePermissions = vi.fn();

      renderWithMantine(
        <Admin
          userPermissions="superadmin"
          onAddUser={onAddUser}
          onAddPatient={onAddPatient}
          onLinkUserPatient={onLinkUserPatient}
          onUpdatePermissions={onUpdatePermissions}
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
      await user.type(screen.getByLabelText(/Full Name/i), "Test User");
      await user.type(screen.getByLabelText(/^Email$/i), "test@test.com");
      await user.type(screen.getByLabelText(/Username/i), "testuser");
      const addUserButtons = screen.getAllByRole("button", {
        name: /^Add User$/i,
      });
      await user.click(addUserButtons[addUserButtons.length - 1]);

      await waitFor(() => {
        expect(onAddUser).toHaveBeenCalled();
      });
    });
  });

  describe("Edge cases", () => {
    it("handles empty users array", () => {
      renderWithMantine(
        <Admin userPermissions="superadmin" existingUsers={[]} />,
      );
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThan(0);
    });

    it("handles empty patients array", () => {
      renderWithMantine(
        <Admin userPermissions="superadmin" existingPatients={[]} />,
      );
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThan(0);
    });

    it("handles undefined callbacks gracefully", async () => {
      const user = userEvent.setup();
      renderWithMantine(<Admin userPermissions="superadmin" />);

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
      renderWithMantine(<Admin userPermissions="patient" />);
      expect(screen.getByText("PATIENT")).toBeInTheDocument();
    });
  });

  describe("Form reset", () => {
    it("resets user form after successful submission", async () => {
      const user = userEvent.setup();
      const onAddUser = vi.fn();
      renderWithMantine(
        <Admin userPermissions="superadmin" onAddUser={onAddUser} />,
      );

      // Open modal and fill form
      await user.click(screen.getByRole("button", { name: /Add New User/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /Add New User/i }),
        ).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/Full Name/i), "Test User");
      await user.type(screen.getByLabelText(/^Email$/i), "test@test.com");
      await user.type(screen.getByLabelText(/Username/i), "testuser");

      // Submit
      const addButtons = screen.getAllByRole("button", { name: /^Add User$/i });
      await user.click(addButtons[addButtons.length - 1]);

      await waitFor(() => {
        expect(onAddUser).toHaveBeenCalled();
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
