/**
 * TotpSetup Component Tests
 *
 * Tests the TOTP two-factor authentication setup page:
 * - QR code and provision URI display
 * - Verification form submission
 * - Success and error states
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiModule from "@/lib/api";
import TotpSetup from "./TotpSetup";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

vi.mock("qrcode", () => ({
  default: {
    toCanvas: vi.fn(),
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

describe("TotpSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiModule.api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      provision_uri: "otpauth://totp/Quill:testuser?secret=ABC123&issuer=Quill",
    });
  });

  it("renders the setup heading and instructions", async () => {
    renderWithRouter(<TotpSetup />);

    expect(
      screen.getByRole("heading", {
        name: /set up two-factor authentication/i,
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/scan the qr code/i)).toBeInTheDocument();
    });
  });

  it("displays the provision URI", async () => {
    renderWithRouter(<TotpSetup />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "otpauth://totp/Quill:testuser?secret=ABC123&issuer=Quill",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows error when setup API fails", async () => {
    (apiModule.api.post as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Server error"),
    );

    renderWithRouter(<TotpSetup />);

    await waitFor(() => {
      expect(
        screen.getByText(/failed to get provisioning uri/i),
      ).toBeInTheDocument();
    });
  });

  it("renders the 6-digit code input", async () => {
    renderWithRouter(<TotpSetup />);

    await waitFor(() => {
      expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    });
  });

  it("submits verification code and shows success", async () => {
    (apiModule.api.post as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        provision_uri:
          "otpauth://totp/Quill:testuser?secret=ABC123&issuer=Quill",
      })
      .mockResolvedValueOnce({});

    const user = userEvent.setup();
    renderWithRouter(<TotpSetup />);

    await waitFor(() => {
      expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByText(/two-factor enabled/i)).toBeInTheDocument();
    });
  });

  it("shows error on verification failure", async () => {
    (apiModule.api.post as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        provision_uri:
          "otpauth://totp/Quill:testuser?secret=ABC123&issuer=Quill",
      })
      .mockRejectedValueOnce(new Error("Invalid code"));

    const user = userEvent.setup();
    renderWithRouter(<TotpSetup />);

    await waitFor(() => {
      expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/6-digit code/i), "000000");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
    });
  });

  it("clears the code field after successful verification", async () => {
    (apiModule.api.post as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        provision_uri:
          "otpauth://totp/Quill:testuser?secret=ABC123&issuer=Quill",
      })
      .mockResolvedValueOnce({});

    const user = userEvent.setup();
    renderWithRouter(<TotpSetup />);

    await waitFor(() => {
      expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByText(/two-factor enabled/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/6-digit code/i)).toHaveValue("");
    });
  });

  it("navigates to settings when cancel is clicked", async () => {
    renderWithRouter(<TotpSetup />);

    await waitFor(() => {
      expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });
});
