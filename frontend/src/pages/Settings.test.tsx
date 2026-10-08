/**
 * Settings page: the page-view opt-out, the passport frameworks card, the
 * install app card and the two-factor card.
 *
 * The rest of Settings (notifications, dark mode) is untested here and
 * was before these changes too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { fetchMyPassport, setPassportFrameworks } from "@lib/passport";
import { hasOptedOut, setOptedOut } from "@/lib/page-views/optOut";
import type { FrameworkOption } from "@lib/passport/frameworks";
import { api } from "@/lib/api";
import Settings from "./Settings";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn(), get: vi.fn(), put: vi.fn() },
}));

// Mutable, so a test can give the user the passport feature. Everybody
// else sees the page as a user with neither.
const authUser = vi.hoisted(() => ({
  username: "testuser",
  clinical_services_enabled: false,
  enabled_features: [] as string[],
  competencies: [] as string[],
  marketing_emails: false,
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

// The framework order comes from the API through this hook; each test
// sets what it returns.
const frameworkChoices = vi.fn();
vi.mock("@lib/passport/useFrameworkChoices", () => ({
  useFrameworkChoices: (enabled: boolean) => frameworkChoices(enabled),
}));

vi.mock("@lib/passport", () => ({
  fetchMyPassport: vi.fn(),
  setPassportFrameworks: vi.fn(),
}));

const FRAMEWORKS: FrameworkOption[] = [
  {
    id: "clinical",
    name: "General clinical skills",
    publisher: "Quill Medical",
    version: "2026",
    specialties: [],
  },
  {
    id: "oncology",
    name: "Oncology (proof of concept)",
    publisher: "Quill Medical",
    version: "2026",
    specialties: ["oncology"],
  },
];

const ONCOLOGY_FIRST: FrameworkOption[] = [FRAMEWORKS[1], FRAMEWORKS[0]];

const ONCOLOGY_LABEL = "Oncology (proof of concept) (Quill Medical, 2026)";
const GENERAL_LABEL = "General clinical skills (Quill Medical, 2026)";

/** The field on the passport card that the frameworks are chosen in. */
function frameworksField(): HTMLElement {
  return screen.getByRole("combobox", { name: /Frameworks you work to/ });
}

beforeEach(() => {
  frameworkChoices.mockReturnValue(FRAMEWORKS);
});

/** What the framework options read, top to bottom, once open. */
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
    // The preference is stored, so it survives a reload - which is the point
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

  it("says the tracking is anonymous and can be opted out of", () => {
    // The page used to say "Patient pages are never counted" as well, and
    // this test tied that sentence to the guard in usePageViewTracking
    // that enforces it. The sentence was taken off the page on purpose;
    // the guard is unchanged and has its own tests.
    renderWithRouter(<Settings />);

    expect(
      screen.getByText(
        "We use anonymous page view tracking to improve Quill. If you wish to not help with this improvement, you can opt out below.",
      ),
    ).toBeInTheDocument();
  });
});

describe("news and updates by email", () => {
  const toggle = () =>
    screen.getByRole("switch", { name: "News and updates by email" });

  beforeEach(() => {
    authUser.marketing_emails = false;
    vi.mocked(api.put).mockReset();
  });

  it("reads as off for somebody who is not sent them", () => {
    renderWithRouter(<Settings />);

    expect(toggle()).not.toBeChecked();
  });

  it("reads as on for somebody who is", () => {
    authUser.marketing_emails = true;

    renderWithRouter(<Settings />);

    expect(toggle()).toBeChecked();
  });

  it("says that account emails are always sent", () => {
    renderWithRouter(<Settings />);

    expect(
      screen.getByText(/password resets and certificates, are always sent/i),
    ).toBeInTheDocument();
  });

  it("saves switching on", async () => {
    vi.mocked(api.put).mockResolvedValue({ marketing_emails: true });
    const user = userEvent.setup();
    renderWithRouter(<Settings />);

    await user.click(toggle());

    expect(api.put).toHaveBeenCalledWith("/marketing/preference", {
      wants_marketing: true,
    });
    await waitFor(() => expect(toggle()).toBeChecked());
  });

  it("saves switching off", async () => {
    authUser.marketing_emails = true;
    vi.mocked(api.put).mockResolvedValue({ marketing_emails: false });
    const user = userEvent.setup();
    renderWithRouter(<Settings />);

    await user.click(toggle());

    expect(api.put).toHaveBeenCalledWith("/marketing/preference", {
      wants_marketing: false,
    });
    await waitFor(() => expect(toggle()).not.toBeChecked());
  });

  it("stays enabled while saving, and drops a second press", async () => {
    let finish: (value: { marketing_emails: boolean }) => void = () => {};
    vi.mocked(api.put).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<Settings />);

    await user.click(toggle());

    // Not disabled, so no "not allowed" pointer; it says it is busy.
    expect(toggle()).toBeEnabled();
    expect(toggle()).toHaveAttribute("aria-busy", "true");
    expect(toggle()).toBeChecked();

    await user.click(toggle());

    expect(api.put).toHaveBeenCalledTimes(1);
    expect(toggle()).toBeChecked();

    finish({ marketing_emails: true });
    await waitFor(() => expect(toggle()).toHaveAttribute("aria-busy", "false"));
    expect(toggle()).toBeChecked();
  });

  it("puts the switch back and says why when the save fails", async () => {
    authUser.marketing_emails = true;
    vi.mocked(api.put).mockRejectedValue(
      new Error(
        "We could not update your email preferences. Please try again.",
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<Settings />);

    await user.click(toggle());

    expect(
      await screen.findByText(
        "We could not update your email preferences. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(toggle()).toBeChecked();
    expect(toggle()).toBeEnabled();
  });
});

describe("the clinician passport card", () => {
  const detail = {
    passport: {
      passport_id: "3f2a8c1e",
      holder_user_id: "42",
      holder_name: "Dr Mark Bailey",
      registrations: [],
      frameworks: [{ id: "oncology", name: "Oncology (proof of concept)" }],
      created_at: "2026-09-10",
      head_commit: null,
    },
    competencies: [],
  };

  beforeEach(() => {
    vi.mocked(fetchMyPassport).mockReset();
    vi.mocked(setPassportFrameworks).mockReset();
    authUser.enabled_features = ["passport"];
    authUser.competencies = ["assess_clinician_passport", "passport_write"];
  });

  it("is shown to somebody with a passport", async () => {
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    renderWithRouter(<Settings />);

    expect(
      await screen.findByRole("heading", { name: "Clinician passport" }),
    ).toBeInTheDocument();
  });

  it("offers the frameworks in the order the API gives", async () => {
    const user = userEvent.setup();
    frameworkChoices.mockReturnValue(ONCOLOGY_FIRST);
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    renderWithRouter(<Settings />);

    await screen.findByRole("heading", { name: "Clinician passport" });
    await user.click(frameworksField());

    expect(optionLabels()).toEqual([ONCOLOGY_LABEL, GENERAL_LABEL]);
  });

  it("asks for the order only once the card is showing", async () => {
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    renderWithRouter(<Settings />);

    expect(frameworkChoices).toHaveBeenCalledWith(false);
    await screen.findByRole("heading", { name: "Clinician passport" });
    expect(frameworkChoices).toHaveBeenLastCalledWith(true);
  });

  it("comes last, after the cards everybody sees", async () => {
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    renderWithRouter(<Settings />);

    const card = await screen.findByRole("heading", {
      name: "Clinician passport",
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
      screen.queryByRole("heading", { name: "Clinician passport" }),
    ).not.toBeInTheDocument();
  });

  it("does not ask for a passport the user could never reach", () => {
    authUser.enabled_features = [];
    renderWithRouter(<Settings />);

    expect(fetchMyPassport).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Clinician passport" }),
    ).not.toBeInTheDocument();
  });

  it("saves a framework as soon as it is added", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    vi.mocked(setPassportFrameworks).mockResolvedValue(detail.passport);
    renderWithRouter(<Settings />);

    await screen.findByRole("heading", { name: "Clinician passport" });
    await user.click(frameworksField());
    await user.click(
      await screen.findByRole("option", { name: GENERAL_LABEL }),
    );

    expect(setPassportFrameworks).toHaveBeenCalledWith("3f2a8c1e", [
      "oncology",
      "clinical",
    ]);
  });

  it("says so when a change could not be saved", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    vi.mocked(setPassportFrameworks).mockRejectedValue(new Error("network"));
    renderWithRouter(<Settings />);

    await screen.findByRole("heading", { name: "Clinician passport" });
    await user.click(frameworksField());
    await user.click(
      await screen.findByRole("option", { name: GENERAL_LABEL }),
    );

    expect(await screen.findByText(/could not be saved/)).toBeInTheDocument();
  });

  it("is disabled while the passport is read-only", async () => {
    vi.mocked(fetchMyPassport).mockResolvedValue({
      ...detail,
      entitlement: { can_write: false },
    });
    renderWithRouter(<Settings />);

    await screen.findByRole("heading", { name: "Clinician passport" });
    expect(frameworksField()).toBeDisabled();
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
