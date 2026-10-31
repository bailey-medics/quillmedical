/**
 * Settings page: the page-view opt-out, the passport frameworks card, the
 * install app card and the two-factor card.
 *
 * The rest of Settings (notifications, dark mode) is untested here and
 * was before these changes too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import {
  fetchMyPassport,
  setPassportFrameworks,
  setPassportLandingView,
} from "@lib/passport";
import { hasOptedOut, setOptedOut } from "@/lib/page-views/optOut";
import type { FrameworkOption } from "@lib/passport/frameworks";
import { api } from "@/lib/api";
import Settings from "./Settings";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn(), get: vi.fn(), put: vi.fn() },
}));

// Mutable, so a test can give the user the passport feature. Everybody
// else sees the page as a user with neither.
import type * as frameworkChoicesLib from "@lib/passport/useFrameworkChoices";
const authUser = vi.hoisted(() => ({
  username: "testuser",
  clinical_services_enabled: false,
  enabled_features: [] as string[],
  competencies: [] as string[],
  marketing_emails: false,
  totp_enabled: false,
}));
const reload = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: authUser },
    reload,
  }),
}));

// Mutable, so a test can put the page on any install route.
const installRouteState = vi.hoisted(() => ({
  route: "chromium-manual",
  install: vi.fn(),
}));

vi.mock("@lib/pwa/useInstallRoute", () => ({
  useInstallRoute: () => installRouteState,
}));

// The framework order comes from the API through this hook; each test
// sets what it returns.
const { frameworkChoices } = vi.hoisted(() => ({
  frameworkChoices: vi.fn<typeof frameworkChoicesLib.useFrameworkChoices>(),
}));
vi.mock("@lib/passport/useFrameworkChoices", () => ({
  useFrameworkChoices: frameworkChoices,
}));

vi.mock("@lib/passport", () => ({
  fetchMyPassport: vi.fn(),
  setPassportFrameworks: vi.fn(),
  setPassportLandingView: vi.fn(),
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

describe("the dark mode switch", () => {
  beforeEach(() => {
    authUser.enabled_features = [];
    authUser.competencies = [];
  });

  it("is named for what it switches, not for its state", () => {
    renderWithRouter(<Settings />);

    expect(
      screen.getByRole("switch", { name: "Dark mode" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: /^(Yes|No)$/ }),
    ).not.toBeInTheDocument();
  });
});

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
    vi.mocked(setPassportLandingView).mockReset();
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

  it("opens the passport By competency when the holder has not chosen", async () => {
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    renderWithRouter(<Settings />);

    expect(
      await screen.findByRole("radio", { name: "By competency" }),
    ).toBeChecked();
  });

  it("saves the passport home page choice as soon as it is made", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    vi.mocked(setPassportLandingView).mockResolvedValue({
      ...detail.passport,
      landing_view: "by_record",
    });
    renderWithRouter(<Settings />);

    await user.click(await screen.findByRole("radio", { name: "By record" }));

    expect(setPassportLandingView).toHaveBeenCalledWith(
      "3f2a8c1e",
      "by_record",
    );
    expect(screen.getByRole("radio", { name: "By record" })).toBeChecked();
  });

  it("puts the choice back when it could not be saved", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMyPassport).mockResolvedValue(detail);
    vi.mocked(setPassportLandingView).mockRejectedValue(new Error("network"));
    renderWithRouter(<Settings />);

    await user.click(await screen.findByRole("radio", { name: "By record" }));

    expect(
      await screen.findByText(
        "Your choice could not be saved. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "By competency" })).toBeChecked();
  });

  it("keeps the home page choice open while the passport is read-only", async () => {
    vi.mocked(fetchMyPassport).mockResolvedValue({
      ...detail,
      entitlement: { can_write: false },
    });
    renderWithRouter(<Settings />);

    expect(
      await screen.findByRole("radio", { name: "By record" }),
    ).toBeEnabled();
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
  beforeEach(() => {
    authUser.totp_enabled = false;
    reload.mockReset();
    reload.mockResolvedValue(undefined);
    vi.mocked(api.post).mockReset();
  });

  afterEach(() => {
    authUser.totp_enabled = false;
  });

  /** The switch, by its name. */
  function totpSwitch(): HTMLElement {
    return screen.getByRole("switch", { name: /two-factor authentication/i });
  }

  it("shows two-factor on when the account has it", () => {
    authUser.totp_enabled = true;
    renderWithRouter(<Settings />);

    expect(totpSwitch()).toBeChecked();
    expect(
      screen.getByRole("button", { name: /configure totp/i }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("asks for the password to turn two-factor off, then turns it off", async () => {
    const user = userEvent.setup();
    authUser.totp_enabled = true;
    vi.mocked(api.post).mockResolvedValue({ detail: "disabled" });
    renderWithRouter(<Settings />);

    await user.click(totpSwitch());
    const dialog = await screen.findByRole("dialog", {
      name: "Turn off two-factor authentication",
    });
    await user.type(within(dialog).getByLabelText("Password"), "secret123");
    await user.click(within(dialog).getByRole("button", { name: "Turn off" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/auth/totp/disable", {
        password: "secret123",
      }),
    );
    // The account is read again, which is what turns the switch off.
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("says a wrong password is wrong, and leaves two-factor on", async () => {
    const user = userEvent.setup();
    authUser.totp_enabled = true;
    vi.mocked(api.post).mockRejectedValue(new Error("Incorrect password"));
    renderWithRouter(<Settings />);

    await user.click(totpSwitch());
    const dialog = await screen.findByRole("dialog", {
      name: "Turn off two-factor authentication",
    });
    await user.type(within(dialog).getByLabelText("Password"), "wrong");
    await user.click(within(dialog).getByRole("button", { name: "Turn off" }));

    expect(
      await within(dialog).findByText("Incorrect password"),
    ).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(totpSwitch()).toBeChecked();
  });

  it("leaves two-factor on, and sends nothing, when turning off is cancelled", async () => {
    const user = userEvent.setup();
    authUser.totp_enabled = true;
    renderWithRouter(<Settings />);

    await user.click(totpSwitch());
    const dialog = await screen.findByRole("dialog", {
      name: "Turn off two-factor authentication",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(api.post).not.toHaveBeenCalled();
    expect(totpSwitch()).toBeChecked();
  });

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
