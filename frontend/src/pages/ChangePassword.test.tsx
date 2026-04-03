import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiModule from "@/lib/api";
import ChangePassword from "./ChangePassword";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
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
  };
});

describe("ChangePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form with all password fields", () => {
    renderWithRouter(<ChangePassword />);

    expect(
      screen.getByRole("heading", { name: /change password/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it("shows error when new passwords do not match", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ChangePassword />);

    await user.type(screen.getByLabelText(/current password/i), "OldPass123!");
    await user.type(screen.getByLabelText(/^new password/i), "NewPass123!");
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "Different123!",
    );
    await user.click(screen.getByRole("button", { name: /change password/i }));

    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
  });

  it("shows error when new password is too short", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ChangePassword />);

    await user.type(screen.getByLabelText(/current password/i), "OldPass123!");
    await user.type(screen.getByLabelText(/^new password/i), "short");
    await user.type(screen.getByLabelText(/confirm new password/i), "short");
    await user.click(screen.getByRole("button", { name: /change password/i }));

    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
  });

  it("calls API and shows success on valid submission", async () => {
    const mockPost = vi.fn().mockResolvedValue({ detail: "Password changed" });
    (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

    const user = userEvent.setup();
    renderWithRouter(<ChangePassword />);

    await user.type(screen.getByLabelText(/current password/i), "OldPass123!");
    await user.type(screen.getByLabelText(/^new password/i), "NewPass456!");
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "NewPass456!",
    );
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/auth/change-password", {
        current_password: "OldPass123!",
        new_password: "NewPass456!",
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    });
  });

  it("shows API error message on failure", async () => {
    const mockPost = vi
      .fn()
      .mockRejectedValue(new Error("Current password is incorrect"));
    (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

    const user = userEvent.setup();
    renderWithRouter(<ChangePassword />);

    await user.type(screen.getByLabelText(/current password/i), "WrongPass!");
    await user.type(screen.getByLabelText(/^new password/i), "NewPass456!");
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "NewPass456!",
    );
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/current password is incorrect/i),
      ).toBeInTheDocument();
    });
  });

  it("navigates to settings when cancel is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ChangePassword />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });

  it("navigates to settings from success screen", async () => {
    const mockPost = vi.fn().mockResolvedValue({ detail: "Password changed" });
    (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

    const user = userEvent.setup();
    renderWithRouter(<ChangePassword />);

    await user.type(screen.getByLabelText(/current password/i), "OldPass123!");
    await user.type(screen.getByLabelText(/^new password/i), "NewPass456!");
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      "NewPass456!",
    );
    await user.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /back to settings/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });
});
