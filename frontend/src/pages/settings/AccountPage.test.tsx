import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiModule from "@/lib/api";
import AccountPage from "./AccountPage";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockReload = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: {
        id: "1",
        username: "testuser",
        email: "test@example.com",
        name: "Test User",
      },
    },
    reload: mockReload,
  }),
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
  };
});

describe("AccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form with profile and password fields", () => {
    renderWithRouter(<AccountPage />);

    expect(
      screen.getByRole("heading", { name: /account/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it("populates profile fields from auth state", () => {
    renderWithRouter(<AccountPage />);

    expect(screen.getByLabelText(/full name/i)).toHaveValue("Test User");
    expect(screen.getByLabelText(/email/i)).toHaveValue("test@example.com");
  });

  it("shows username as disabled", () => {
    renderWithRouter(<AccountPage />);

    expect(screen.getByLabelText(/username/i)).toBeDisabled();
    expect(screen.getByLabelText(/username/i)).toHaveValue("testuser");
  });

  it("calls profile API when name is changed", async () => {
    const mockPatch = vi.fn().mockResolvedValue({ detail: "Profile updated" });
    (apiModule.api.patch as ReturnType<typeof vi.fn>) = mockPatch;

    const user = userEvent.setup();
    renderWithRouter(<AccountPage />);

    const nameField = screen.getByLabelText(/full name/i);
    await user.clear(nameField);
    await user.type(nameField, "New Name");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/auth/profile", {
        full_name: "New Name",
      });
    });

    await waitFor(() => {
      expect(mockReload).toHaveBeenCalled();
    });
  });

  it("calls profile API when email is changed", async () => {
    const mockPatch = vi.fn().mockResolvedValue({ detail: "Profile updated" });
    (apiModule.api.patch as ReturnType<typeof vi.fn>) = mockPatch;

    const user = userEvent.setup();
    renderWithRouter(<AccountPage />);

    const emailField = screen.getByLabelText(/email/i);
    await user.clear(emailField);
    await user.type(emailField, "new@example.com");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/auth/profile", {
        email: "new@example.com",
      });
    });
  });

  it("calls password API when password fields are filled", async () => {
    const mockPost = vi.fn().mockResolvedValue({ detail: "Password changed" });
    (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

    const user = userEvent.setup();
    renderWithRouter(<AccountPage />);

    await user.type(screen.getByLabelText(/current password/i), "OldPass123!");
    await user.type(screen.getByLabelText(/^new password/i), "NewPass456!");
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "NewPass456!",
    );
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/auth/change-password", {
        current_password: "OldPass123!",
        new_password: "NewPass456!",
      });
    });
  });

  it("shows error when new passwords do not match", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AccountPage />);

    await user.type(screen.getByLabelText(/current password/i), "OldPass123!");
    await user.type(screen.getByLabelText(/^new password/i), "NewPass123!");
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "Different123!",
    );
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    });
  });

  it("disables save button when no changes are made", () => {
    renderWithRouter(<AccountPage />);

    expect(screen.getByTestId("submit-button")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("navigates to settings when cancel is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AccountPage />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("clears password fields after successful submission", async () => {
    const mockPatch = vi.fn().mockResolvedValue({ detail: "Profile updated" });
    (apiModule.api.patch as ReturnType<typeof vi.fn>) = mockPatch;

    const user = userEvent.setup();
    renderWithRouter(<AccountPage />);

    const nameField = screen.getByLabelText(/full name/i);
    await user.clear(nameField);
    await user.type(nameField, "Updated Name");
    await user.type(screen.getByLabelText(/current password/i), "OldPass123!");
    await user.type(screen.getByLabelText(/^new password/i), "NewPass456!");
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "NewPass456!",
    );

    const mockPost = vi.fn().mockResolvedValue({ detail: "Password changed" });
    (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByLabelText(/current password/i)).toHaveValue("");
      expect(screen.getByLabelText(/^new password/i)).toHaveValue("");
      expect(screen.getByLabelText(/confirm new password/i)).toHaveValue("");
    });
  });
});
