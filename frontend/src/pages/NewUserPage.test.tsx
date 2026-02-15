/**
 * NewUserPage Component Tests
 *
 * Tests multi-step user creation form:
 * - Step navigation
 * - Form validation
 * - Data persistence across steps
 * - API submission
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiModule from "@/lib/api";
import NewUserPage from "./NewUserPage";

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
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

describe("NewUserPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Step 1: Basic Details", () => {
    it("renders step 1 with all required fields", () => {
      renderWithRouter(<NewUserPage />);

      expect(screen.getByText("Create New User")).toBeInTheDocument();
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/initial password/i)).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: /base profession/i }),
      ).toBeInTheDocument();
    });

    it("shows validation errors when trying to proceed with empty fields", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("Name is required")).toBeInTheDocument();
      });
      expect(screen.getByText("Email is required")).toBeInTheDocument();
      expect(screen.getByText("Username is required")).toBeInTheDocument();
      expect(screen.getByText("Password is required")).toBeInTheDocument();
      expect(
        screen.getByText("Base profession is required"),
      ).toBeInTheDocument();
    });

    it("validates email format", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      const emailInput = screen.getByLabelText(/email/i);
      await user.type(emailInput, "invalid-email");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid email format")).toBeInTheDocument();
      });
    });

    it("validates password length", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      const passwordInput = screen.getByLabelText(/initial password/i);
      await user.type(passwordInput, "short");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Password must be at least 8 characters"),
        ).toBeInTheDocument();
      });
    });

    it("proceeds to step 2 when validation passes", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      // Fill all required fields
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      // Select base profession
      const professionSelect = screen.getByRole("textbox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Competency Configuration"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Step 2: Competencies", () => {
    async function fillStep1AndProceed(
      user: ReturnType<typeof userEvent.setup>,
    ) {
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      const professionSelect = screen.getByRole("textbox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));
    }

    it("renders competency configuration fields", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(
          screen.getByText("Competency Configuration"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByLabelText(/additional competencies/i),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/removed competencies/i),
      ).toBeInTheDocument();
    });

    it("shows base profession information", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(screen.getByText(/base profession:/i)).toBeInTheDocument();
      });
    });

    it("navigates back to step 1", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(
          screen.getByText("Competency Configuration"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /back/i }));

      await waitFor(() => {
        expect(screen.getByText("Basic Details")).toBeInTheDocument();
      });
    });

    it("proceeds to step 3 permissions", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(
          screen.getByText("Competency Configuration"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(
          screen.getByText("System Permissions & Review"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Step 3: Permissions & Review", () => {
    async function fillStepsAndProceed(
      user: ReturnType<typeof userEvent.setup>,
    ) {
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      const professionSelect = screen.getByRole("textbox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Competency Configuration"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /next/i }));
    }

    it("renders permissions selection and review", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      await fillStepsAndProceed(user);

      await waitFor(() => {
        expect(
          screen.getByText("System Permissions & Review"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByLabelText(/system permission level/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/review/i)).toBeInTheDocument();
    });

    it("displays review information correctly", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      await fillStepsAndProceed(user);

      await waitFor(() => {
        expect(screen.getByText("Dr Jane Smith")).toBeInTheDocument();
      });
      expect(screen.getByText("jane.smith@example.com")).toBeInTheDocument();
      expect(screen.getByText("janesmith")).toBeInTheDocument();
    });
  });

  describe("Form submission", () => {
    it("submits form data to API when create user is clicked", async () => {
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      // Fill step 1
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      const professionSelect = screen.getByRole("textbox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));

      // Skip step 2
      await waitFor(() => {
        expect(
          screen.getByText("Competency Configuration"),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));

      // Step 3 - submit
      await waitFor(() => {
        expect(
          screen.getByText("System Permissions & Review"),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /create user/i }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/users",
          expect.objectContaining({
            name: "Dr Jane Smith",
            email: "jane.smith@example.com",
            username: "janesmith",
            password: "password123",
          }),
        );
      });
    });

    it("shows success confirmation after successful submission", async () => {
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      // Fill and submit
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      const professionSelect = screen.getByRole("textbox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Competency Configuration"),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByText("System Permissions & Review"),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /create user/i }));

      await waitFor(() => {
        expect(
          screen.getByText("User Created Successfully"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Navigation", () => {
    it("navigates back to admin when cancel is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(mockNavigate).toHaveBeenCalledWith("/admin");
    });

    it("navigates back to admin from confirmation", async () => {
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      const user = userEvent.setup();
      renderWithRouter(<NewUserPage />);

      // Complete form
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      const professionSelect = screen.getByRole("textbox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Competency Configuration"),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByText("System Permissions & Review"),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /create user/i }));

      await waitFor(() => {
        expect(
          screen.getByText("User Created Successfully"),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /return to admin/i }),
      );

      expect(mockNavigate).toHaveBeenCalledWith("/admin");
    });
  });
});
