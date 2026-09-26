/**
 * Settings page — the page-view opt-out and the passport specialty card
 *
 * The rest of Settings — notifications, two-factor, dark mode — is
 * untested here and was before these changes too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { fetchMyPassport, setPassportSpecialties } from "@lib/passport";
import { hasOptedOut, setOptedOut } from "@/lib/page-views/optOut";
import Settings from "./Settings";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn(), get: vi.fn() } }));

// Mutable, so a test can give the user the passport feature. Everybody
// else sees the page as a user with neither.
const authUser = vi.hoisted(() => ({
  username: "testuser",
  clinical_services_enabled: false,
  enabled_features: [] as string[],
  competencies: [] as string[],
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: authUser },
  }),
}));

vi.mock("@lib/passport", () => ({
  fetchMyPassport: vi.fn(),
  setPassportSpecialties: vi.fn(),
}));

describe("the page-view opt-out", () => {
  beforeEach(() => {
    authUser.enabled_features = [];
    authUser.competencies = [];
    try {
      localStorage.clear();
    } catch {
      /* nothing stored */
    }
  });

  it("is on by default, since this is an opt-out", async () => {
    renderWithRouter(<Settings />);

    const toggle = screen.getByRole("switch", { name: /help improve quill/i });
    expect(toggle).toBeChecked();
  });

  it("records the opt-out when switched off", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Settings />);

    await user.click(
      screen.getByRole("switch", { name: /help improve quill/i }),
    );

    expect(hasOptedOut()).toBe(true);
  });

  it("reads as off when the user has already opted out", () => {
    // The preference is stored, so it survives a reload — which is the point
    // of storing it, and the difference from the session identifier.
    setOptedOut(true);

    renderWithRouter(<Settings />);

    expect(
      screen.getByRole("switch", { name: /help improve quill/i }),
    ).not.toBeChecked();
  });

  it("can be turned back on", async () => {
    const user = userEvent.setup();
    setOptedOut(true);
    renderWithRouter(<Settings />);

    await user.click(
      screen.getByRole("switch", { name: /help improve quill/i }),
    );

    expect(hasOptedOut()).toBe(false);
  });

  it("says that patient pages are never counted", () => {
    // The claim the guard in usePageViewTracking actually enforces. If one
    // changes without the other, this is where it shows.
    renderWithRouter(<Settings />);

    expect(
      screen.getByText(/patient pages are never counted/i),
    ).toBeInTheDocument();
  });
});

describe("the passport specialty card", () => {
  const detail = {
    passport: {
      passport_id: "3f2a8c1e",
      holder_user_id: "42",
      holder_name: "Dr Mark Bailey",
      registrations: [],
      specialties: [{ id: "oncology", name: "Oncology" }],
      created_at: "2026-09-10",
      head_commit: null,
    },
    competencies: [],
  };

  beforeEach(() => {
    vi.mocked(fetchMyPassport).mockReset();
    vi.mocked(setPassportSpecialties).mockReset();
    authUser.enabled_features = ["passport"];
    authUser.competencies = ["assess_clinician_passport", "passport_write"];
  });

  it("is shown to somebody with a passport", async () => {
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    renderWithRouter(<Settings />);

    expect(await screen.findByText("Passport specialty")).toBeInTheDocument();
  });

  it("is absent for somebody who has not created one", async () => {
    vi.mocked(fetchMyPassport).mockRejectedValue({ status: 404 });
    renderWithRouter(<Settings />);

    await screen.findByText("Account");
    expect(fetchMyPassport).toHaveBeenCalled();
    expect(screen.queryByText("Passport specialty")).not.toBeInTheDocument();
  });

  it("does not ask for a passport the user could never reach", () => {
    authUser.enabled_features = [];
    renderWithRouter(<Settings />);

    expect(fetchMyPassport).not.toHaveBeenCalled();
    expect(screen.queryByText("Passport specialty")).not.toBeInTheDocument();
  });

  it("saves a change to Generic", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    vi.mocked(setPassportSpecialties).mockResolvedValue(detail.passport);
    renderWithRouter(<Settings />);

    await screen.findByText("Passport specialty");
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", {
        name: "Generic (no specialty order)",
      }),
    );

    expect(setPassportSpecialties).toHaveBeenCalledWith("3f2a8c1e", []);
  });

  it("says so when a change could not be saved", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    vi.mocked(setPassportSpecialties).mockRejectedValue(new Error("network"));
    renderWithRouter(<Settings />);

    await screen.findByText("Passport specialty");
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "General surgery" }),
    );

    expect(await screen.findByText(/could not be saved/)).toBeInTheDocument();
  });

  it("is disabled while the passport is read-only", async () => {
    vi.mocked(fetchMyPassport).mockResolvedValue({
      ...detail,
      entitlement: { can_write: false },
    });
    renderWithRouter(<Settings />);

    await screen.findByText("Passport specialty");
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
