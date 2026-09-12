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

const mockMedia = {
  module_id: "test-bank",
  references: [
    {
      key: "lecture-01",
      asset: {
        asset_id: "asset-1",
        original_filename: "lecture.mp4",
        content_type: "video/mp4",
        size_bytes: 1024,
        uploaded_at: "2026-09-02T09:14:00Z",
      },
    },
  ],
  unattached: [],
  is_complete: true,
};

/** Route each GET the page makes. Media last, so /media/ wins over /banks/. */
function routeGets(media: unknown = mockMedia) {
  (api.get as Mock).mockImplementation((url: string) => {
    if (url.includes("/media")) return Promise.resolve(media);
    if (url.includes("/organisations")) return Promise.resolve(mockOrgs);
    return Promise.resolve(mockBank);
  });
}

const mockOrgs = [
  {
    organisation_id: 1,
    organisation_name: "Test Hospital",
    is_live: true,
  },
  {
    organisation_id: 2,
    organisation_name: "Another Clinic",
    is_live: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminBankDetailPage", () => {
  it("shows loading state initially", () => {
    (api.get as Mock).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<AdminBankDetailPage />);
    expect(document.querySelector(".mantine-Skeleton-root")).toBeTruthy();
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
    expect(screen.getByText("Inactive")).toBeTruthy();
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

describe("AdminBankDetailPage media card", () => {
  it("shows the card when the content references media", async () => {
    routeGets();
    renderWithRouter(<AdminBankDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Videos")).toBeTruthy();
    });
    expect(screen.getByText("lecture-01")).toBeTruthy();
  });

  it("hides the card for a module of pure text", async () => {
    // Derived from the MDX references, never a flag: a module with
    // nothing to upload should not be asked to upload anything.
    routeGets({
      module_id: "test-bank",
      references: [],
      unattached: [],
      is_complete: true,
    });
    renderWithRouter(<AdminBankDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeTruthy();
    });
    expect(screen.queryByText("Videos")).toBeNull();
  });

  it("warns that an incomplete module is hidden from learners", async () => {
    // The gate hides such a module, and this line is the only place an
    // admin finds out. Asserted through the page so the wiring is
    // covered, not just the card in isolation.
    routeGets({
      module_id: "test-bank",
      references: [{ key: "lecture-01", asset: null }],
      unattached: [],
      is_complete: false,
    });
    renderWithRouter(<AdminBankDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("1 video is missing")).toBeTruthy();
    });
  });

  it("still renders the page when the media call fails", async () => {
    // The card is one part of the page. A media failure should not take
    // the organisations table down with it.
    (api.get as Mock).mockImplementation((url: string) => {
      if (url.includes("/media")) return Promise.reject(new Error("nope"));
      if (url.includes("/organisations")) return Promise.resolve(mockOrgs);
      return Promise.resolve(mockBank);
    });
    renderWithRouter(<AdminBankDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeTruthy();
    });
    expect(screen.queryByText("Videos")).toBeNull();
  });
});
