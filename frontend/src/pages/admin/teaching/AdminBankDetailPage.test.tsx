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
  email_student_on_pass: true,
  email_coordinator_on_pass: true,
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

const mockOrgs = [
  {
    organisation_id: 1,
    organisation_name: "Test Hospital",
    is_live: true,
    coordinator_email: "coord@test.com",
  },
  {
    organisation_id: 2,
    organisation_name: "Another Clinic",
    is_live: false,
    coordinator_email: null,
  },
];

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

  it("renders bank detail and organisations table", async () => {
    (api.get as Mock).mockImplementation((url: string) => {
      if (url.includes("/organisations")) return Promise.resolve(mockOrgs);
      return Promise.resolve(mockBank);
    });
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeTruthy();
    });
    expect(screen.getByText("uniform")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("Organisations")).toBeTruthy();
    expect(screen.getByText("Test Hospital")).toBeTruthy();
    expect(screen.getByText("Another Clinic")).toBeTruthy();
  });

  it("shows Active/Deactivated badges per org", async () => {
    (api.get as Mock).mockImplementation((url: string) => {
      if (url.includes("/organisations")) return Promise.resolve(mockOrgs);
      return Promise.resolve(mockBank);
    });
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeTruthy();
    });
    expect(screen.getByText("Deactivated")).toBeTruthy();
  });

  it("shows coordinator email column when email_coordinator_on_pass", async () => {
    (api.get as Mock).mockImplementation((url: string) => {
      if (url.includes("/organisations")) return Promise.resolve(mockOrgs);
      return Promise.resolve(mockBank);
    });
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("coord@test.com")).toBeTruthy();
    });
    expect(screen.getByText("Not set")).toBeTruthy();
  });

  it("shows email template previews when email flags enabled", async () => {
    (api.get as Mock).mockImplementation((url: string) => {
      if (url.includes("/organisations")) return Promise.resolve(mockOrgs);
      return Promise.resolve(mockBank);
    });
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Email templates")).toBeTruthy();
    });
    expect(screen.getByText("Student email")).toBeTruthy();
    expect(screen.getByText("Coordinator email")).toBeTruthy();
  });

  it("hides email templates when email flags are false", async () => {
    (api.get as Mock).mockImplementation((url: string) => {
      if (url.includes("/organisations")) return Promise.resolve(mockOrgs);
      return Promise.resolve({
        ...mockBank,
        email_student_on_pass: false,
        email_coordinator_on_pass: false,
      });
    });
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeTruthy();
    });
    expect(screen.queryByText("Email templates")).toBeNull();
  });
});
