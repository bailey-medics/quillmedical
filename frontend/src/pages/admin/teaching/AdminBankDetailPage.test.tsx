import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import type { BlockerFunction, Location } from "react-router-dom";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

// `useBlocker` needs a data router, which `renderWithRouter` does not
// set up. Stubbed to capture the predicate instead, so the decision
// the page makes — block while a file is going up, not otherwise — is
// what gets asserted.
let blockerPredicate: BlockerFunction | null = null;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ bankId: "test-bank" }),
    useBlocker: (fn: BlockerFunction) => {
      blockerPredicate = fn;
      return {
        state: "unblocked" as const,
        reset: undefined,
        proceed: undefined,
        location: undefined,
      };
    },
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
    org_unit_id: 11,
    organisation_name: "Test Hospital",
    is_live: true,
  },
  {
    org_unit_id: 12,
    organisation_name: "Another Clinic",
    is_live: false,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  blockerPredicate = null;
});

const here: Location = {
  pathname: "/admin/teaching/modules/test-bank",
  search: "",
  hash: "",
  state: null,
  key: "default",
};
const elsewhere: Location = { ...here, pathname: "/admin/teaching" };

/** Ask the page's own predicate whether it would block leaving. */
function wouldBlock(): boolean {
  if (!blockerPredicate) throw new Error("useBlocker was never called");
  // Typed from the predicate's own parameter rather than a literal:
  // React Router 7 no longer exports the `Action` enum those values
  // come from.
  const args: Parameters<BlockerFunction>[0] = {
    currentLocation: here,
    nextLocation: elsewhere,
    historyAction: "PUSH" as Parameters<BlockerFunction>[0]["historyAction"],
  };
  return blockerPredicate(args);
}

/**
 * Stub XMLHttpRequest so the bytes never finish going up.
 *
 * The opening POST answers at once and the PUT carrying the file is
 * held open, which is the state the guards exist for.
 */
function holdUploadOpen() {
  class HeldXhr {
    status = 200;
    upload = { addEventListener: vi.fn() };
    listeners: Record<string, () => void> = {};
    method = "";
    open(method: string) {
      this.method = method;
    }
    setRequestHeader = vi.fn();
    getResponseHeader = (name: string) =>
      name === "Location" && this.method === "POST"
        ? "https://storage.example/session-42"
        : null;
    addEventListener(name: string, cb: () => void) {
      this.listeners[name] = cb;
    }
    send() {
      if (this.method === "POST") this.listeners.load?.();
    }
  }
  vi.stubGlobal("XMLHttpRequest", HeldXhr);
}

/**
 * Whether the browser would warn before unloading the page.
 *
 * A cancelled `beforeunload` is what produces the browser's own "leave
 * site?" prompt, so this asks the question the admin would face.
 */
function firesUnloadWarning(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** Drop a video on the card's dropzone and let the upload start. */
async function startUpload() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no dropzone on the page");
  await userEvent.upload(
    input,
    new File(["x"], "lecture.mp4", { type: "video/mp4" }),
  );
}

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
    // The gate hides such a module, and this line is the only org_unit an
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

  it("does not block navigation when nothing is uploading", async () => {
    routeGets();
    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeTruthy();
    });

    expect(wouldBlock()).toBe(false);
  });

  it("blocks navigation while a video is still going up", async () => {
    // Leaving mid-upload loses the file: the bytes go straight to the
    // bucket, and the call that records the asset never runs.
    holdUploadOpen();
    routeGets({
      module_id: "test-bank",
      references: [{ key: "lecture-01", asset: null }],
      unattached: [],
      is_complete: false,
    });
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeTruthy();
    });

    await startUpload();
    await waitFor(() => expect(wouldBlock()).toBe(true));
  });

  it("warns before a reload while a video is still going up", async () => {
    // The blocker only sees route changes. A tab close or refresh kills
    // the transfer outright, so it needs its own guard.
    //
    // Asserted by firing the event and reading whether anything
    // cancelled it, rather than by spying on the listener: what matters
    // is that the browser would be stopped, not how.
    holdUploadOpen();
    routeGets({
      module_id: "test-bank",
      references: [{ key: "lecture-01", asset: null }],
      unattached: [],
      is_complete: false,
    });
    (api.post as Mock).mockResolvedValue({
      upload_url: "https://storage.example/upload",
      asset_id: "asset-1",
    });

    renderWithRouter(<AdminBankDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Bank")).toBeTruthy();
    });
    expect(firesUnloadWarning()).toBe(false);

    await startUpload();
    await waitFor(() => expect(firesUnloadWarning()).toBe(true));
  });
});
