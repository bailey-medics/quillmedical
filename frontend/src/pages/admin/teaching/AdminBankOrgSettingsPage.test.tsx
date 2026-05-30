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
    useParams: () => ({ bankId: "test-bank", orgId: "1" }),
  };
});

import { api } from "@/lib/api";
import AdminBankOrgSettingsPage from "./AdminBankOrgSettingsPage";

const mockBank = {
  bank_id: "test-bank",
  title: "Test Bank",
  version: 1,
  type: "uniform",
  item_count: 10,
  email_student_on_pass: false,
  email_coordinator_on_pass: true,
  coordinator_email_template: null,
  student_email_template: null,
};

const mockOrgs = [
  {
    organisation_id: 1,
    organisation_name: "Test Hospital",
    is_live: false,
  },
  {
    organisation_id: 2,
    organisation_name: "Another Clinic",
    is_live: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

function mockApiCalls() {
  (api.get as Mock).mockImplementation((url: string) => {
    if (url.includes("/organisations")) return Promise.resolve(mockOrgs);
    return Promise.resolve(mockBank);
  });
}

describe("AdminBankOrgSettingsPage", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AdminBankOrgSettingsPage />);
    expect(document.querySelector(".mantine-Skeleton-root")).toBeTruthy();
  });

  it("shows error state on API failure", async () => {
    (api.get as Mock).mockRejectedValue(new Error("Server error"));
    renderWithRouter(<AdminBankOrgSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeTruthy();
    });
  });

  it("renders org name and exam status", async () => {
    mockApiCalls();
    renderWithRouter(<AdminBankOrgSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Hospital – Test Bank")).toBeTruthy();
    });
    expect(screen.getByText("Exam status")).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
  });

  it("save button is disabled when form is not dirty", async () => {
    mockApiCalls();
    renderWithRouter(<AdminBankOrgSettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Hospital – Test Bank")).toBeTruthy();
    });
    expect(screen.getByTestId("submit-button")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
