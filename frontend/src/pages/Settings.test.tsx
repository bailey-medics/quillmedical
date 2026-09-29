/**
 * Settings page – the page-view opt-out, the passport specialty card, the
 * install app card and the two-factor card
 *
 * The rest of Settings – notifications, dark mode – is untested here and
 * was before these changes too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { fetchMyPassport, setPassportSpecialties } from "@lib/passport";
import { hasOptedOut, setOptedOut } from "@/lib/page-views/optOut";
import { PASSPORT_SPECIALTIES } from "@lib/passport/specialties";
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

// Mutable, so a test can put the page on any install route.
const installRouteState = vi.hoisted(() => ({
  route: "chromium-manual" as string,
  install: vi.fn(),
}));

vi.mock("@lib/pwa/useInstallRoute", () => ({
  useInstallRoute: () => installRouteState,
}));

// The specialty order comes from the API through this hook; each test
// sets what it returns, and useSpecialtyChoices.test.ts covers the fetch.
const specialtyChoices = vi.fn();
vi.mock("@lib/passport/useSpecialtyChoices", () => ({
  useSpecialtyChoices: (enabled: boolean) => specialtyChoices(enabled),
}));

vi.mock("@lib/passport", () => ({
  fetchMyPassport: vi.fn(),
  setPassportSpecialties: vi.fn(),
}));

const ONCOLOGY_FIRST = [
  { id: "oncology", display_name: "Oncology" },
  { id: "general_medicine", display_name: "General medicine" },
  { id: "general_surgery", display_name: "General surgery" },
];

beforeEach(() => {
  specialtyChoices.mockReturnValue(PASSPORT_SPECIALTIES);
});

/** What the specialty options read, top to bottom, once open. */
function optionLabels(): string[] {
  return screen.getAllByRole("option").map((o) => o.textContent ?? "");
}

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
    // The preference is stored, so it survives a reload – which is the point
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

    expect(
      await screen.findByRole("heading", { name: "Passport specialities" }),
    ).toBeInTheDocument();
  });

  it("offers the specialties in the order the API gives", async () => {
    const user = userEvent.setup();
    specialtyChoices.mockReturnValue(ONCOLOGY_FIRST);
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    renderWithRouter(<Settings />);

    await screen.findByRole("heading", { name: "Passport specialities" });
    await user.click(screen.getByRole("combobox"));

    expect(optionLabels()).toEqual([
      "Oncology",
      "General medicine",
      "General surgery",
      "Generic",
    ]);
  });

  it("asks for the order only once the card is showing", async () => {
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    renderWithRouter(<Settings />);

    expect(specialtyChoices).toHaveBeenCalledWith(false);
    await screen.findByRole("heading", { name: "Passport specialities" });
    expect(specialtyChoices).toHaveBeenLastCalledWith(true);
  });

  it("comes last, after the cards everybody sees", async () => {
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    renderWithRouter(<Settings />);

    const card = await screen.findByRole("heading", {
      name: "Passport specialities",
    });
    const lastEverybodyCard = screen.getByText(
      "Two-factor authentication (TOTP)",
    );

    expect(
      lastEverybodyCard.compareDocumentPosition(card) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is absent for somebody who has not created one", async () => {
    vi.mocked(fetchMyPassport).mockRejectedValue({ status: 404 });
    renderWithRouter(<Settings />);

    await screen.findByText("Account");
    expect(fetchMyPassport).toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Passport specialities" }),
    ).not.toBeInTheDocument();
  });

  it("does not ask for a passport the user could never reach", () => {
    authUser.enabled_features = [];
    renderWithRouter(<Settings />);

    expect(fetchMyPassport).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Passport specialities" }),
    ).not.toBeInTheDocument();
  });

  it("saves a change to Generic", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    vi.mocked(setPassportSpecialties).mockResolvedValue(detail.passport);
    renderWithRouter(<Settings />);

    await screen.findByRole("heading", { name: "Passport specialities" });
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", {
        name: "Generic",
      }),
    );

    expect(setPassportSpecialties).toHaveBeenCalledWith("3f2a8c1e", []);
  });

  it("says so when a change could not be saved", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    vi.mocked(setPassportSpecialties).mockRejectedValue(new Error("network"));
    renderWithRouter(<Settings />);

    await screen.findByRole("heading", { name: "Passport specialities" });
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

    await screen.findByRole("heading", { name: "Passport specialities" });
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});

describe("the install app card", () => {
  beforeEach(() => {
    installRouteState.route = "chromium-manual";
    installRouteState.install = vi.fn(() => Promise.resolve("accepted"));
  });

  const card = () => screen.queryByRole("button", { name: "Install app" });

  it("is hidden once Quill is installed", () => {
    installRouteState.route = "installed";
    renderWithRouter(<Settings />);
    expect(card()).not.toBeInTheDocument();
  });

  it("is shown wherever Quill is not installed", () => {
    renderWithRouter(<Settings />);
    expect(card()).toBeInTheDocument();
  });

  it("starts the browser's install straight away when it can", async () => {
    const user = userEvent.setup();
    installRouteState.route = "prompt";
    renderWithRouter(<Settings />);

    await user.click(screen.getByRole("button", { name: "Install app" }));

    expect(installRouteState.install).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Install Quill on this device?"),
    ).not.toBeInTheDocument();
  });

  it("opens the steps for this platform when it cannot", async () => {
    const user = userEvent.setup();
    installRouteState.route = "ios";
    renderWithRouter(<Settings />);

    await user.click(screen.getByRole("button", { name: "Install app" }));

    expect(
      await screen.findByText("Scroll down and tap Add to Home Screen."),
    ).toBeInTheDocument();
    expect(installRouteState.install).not.toHaveBeenCalled();
  });

  it("explains an unsupported browser rather than showing nothing", async () => {
    const user = userEvent.setup();
    installRouteState.route = "unsupported";
    renderWithRouter(<Settings />);

    await user.click(screen.getByRole("button", { name: "Install app" }));

    expect(
      await screen.findByText("This browser cannot install Quill"),
    ).toBeInTheDocument();
  });
});

describe("the two-factor card", () => {
  it("keeps configuring shut until the switch is on", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Settings />);

    const configure = screen.getByRole("button", { name: /configure totp/i });
    // IconTextButton disables through aria-disabled, which keeps it focusable
    expect(configure).toHaveAttribute("aria-disabled", "true");

    await user.click(
      screen.getByRole("switch", { name: /two-factor authentication/i }),
    );

    expect(configure).not.toHaveAttribute("aria-disabled", "true");
  });
});
