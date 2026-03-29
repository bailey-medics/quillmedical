import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ bankId: "test-bank" }),
  };
});

import { api } from "@/lib/api";
import AdminBankDetailPage from "./AdminBankDetailPage";

const mockBank = {
  bank_id: "test-bank",
  title: "Test Bank",
  version: 1,
  type: "uniform",
  item_count: 10,
  is_live: false,
  email_on_pass: true,
  coordinator_email_template: {
    subject: "Certificate: $exam_title",
    body: "Dear $recipient_name, $student_name has passed.",
    attach_certificate: true,
  },
  student_email_template: {
    subject: "Your certificate",
    body: "Dear $recipient_name, congratulations!",
    attach_certificate: true,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminBankDetailPage", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AdminBankDetailPage />);
    expect(document.querySelector(".mantine-Loader-root")).toBeTruthy();
  });

  it("shows error state on API failure", async () => {
    (api.get as Mock).mockRejectedValue(new Error("Not found"));
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Not found")).toBeTruthy();
    });
  });

  it("renders bank detail", async () => {
    (api.get as Mock).mockResolvedValue(mockBank);
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeTruthy();
    });
    expect(screen.getByText("uniform")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("shows closed badge when not live", async () => {
    (api.get as Mock).mockResolvedValue(mockBank);
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Closed")).toBeTruthy();
    });
  });

  it("shows live badge when live", async () => {
    (api.get as Mock).mockResolvedValue({ ...mockBank, is_live: true });
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Live")).toBeTruthy();
    });
  });

  it("shows email template previews when email_on_pass", async () => {
    (api.get as Mock).mockResolvedValue(mockBank);
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Email templates")).toBeTruthy();
    });
    expect(screen.getByText("Student email")).toBeTruthy();
    expect(screen.getByText("Coordinator email")).toBeTruthy();
  });

  it("hides email templates when email_on_pass is false", async () => {
    (api.get as Mock).mockResolvedValue({
      ...mockBank,
      email_on_pass: false,
    });
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeTruthy();
    });
    expect(screen.queryByText("Email templates")).toBeNull();
  });
});
