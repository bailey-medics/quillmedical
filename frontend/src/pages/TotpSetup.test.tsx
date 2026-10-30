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

const reload = vi.fn<() => Promise<void>>();
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ reload }),
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
    reload.mockResolvedValue(undefined);
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

  it("names the QR code, so a screen reader says what it is", async () => {
    renderWithRouter(<TotpSetup />);

    expect(
      await screen.findByRole("img", {
        name: "QR code for your authenticator app",
      }),
    ).toBeInTheDocument();
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

  it("stops the code at the length the backend takes", async () => {
    renderWithRouter(<TotpSetup />);

    const code = await screen.findByLabelText(/6-digit code/i);

    expect(code).toHaveAttribute("maxlength", "16");
  });

  it("sends a code pasted with a space as the digits alone", async () => {
    // An authenticator shows "123 456", and that is what gets pasted.
    (apiModule.api.post as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        provision_uri:
          "otpauth://totp/Quill:testuser?secret=ABC123&issuer=Quill",
      })
      .mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderWithRouter(<TotpSetup />);
    const code = await screen.findByLabelText(/6-digit code/i);

    await user.click(code);
    await user.paste(" 123 456 ");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(apiModule.api.post).toHaveBeenLastCalledWith("/auth/totp/verify", {
        code: "123456",
      });
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
    // So settings shows two-factor on without a page load.
    expect(reload).toHaveBeenCalled();
  });

  it("still says two-factor is on when the account will not refresh", async () => {
    (apiModule.api.post as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        provision_uri:
          "otpauth://totp/Quill:testuser?secret=ABC123&issuer=Quill",
      })
      .mockResolvedValueOnce({});
    reload.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderWithRouter(<TotpSetup />);

    await user.type(await screen.findByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByTestId("submit-button"));

    expect(await screen.findByText(/two-factor enabled/i)).toBeInTheDocument();
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

  it("says to turn two-factor off first when it is already on", async () => {
    vi.mocked(apiModule.api.post).mockRejectedValue(
      Object.assign(
        new Error(
          "Two-factor is already on. Turn it off first to set up a new authenticator.",
        ),
        { error_code: "totp_already_enabled" },
      ),
    );

    renderWithRouter(<TotpSetup />);

    expect(
      await screen.findByText(
        "Two-factor is already on. Turn it off first to set up a new authenticator.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Failed to get provisioning URI"),
    ).not.toBeInTheDocument();
  });
});
