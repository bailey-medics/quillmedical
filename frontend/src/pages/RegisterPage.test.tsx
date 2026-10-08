/**
 * RegisterPage tests
 *
 * Joining, on one page: choose a module and name a clinical lead, choose
 * a site where the lead holds several, then create the account. Only a
 * teaching deployment lets somebody register for themselves.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { api } from "@/lib/api";
import RegisterPage from "./RegisterPage";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

vi.mock("@lib/connectivity", () => ({
  useConnectivity: () => ({ isOnline: true }),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

const VALIDATE = "/teaching/public/validate-clinical-lead";
const REGISTER = "/auth/register";

type User = ReturnType<typeof userEvent.setup>;

/** What the clinical lead check answers. Registration always succeeds. */
function leadCheckAnswers(answer: {
  valid: boolean;
  org_unit_id?: number | null;
  site_id?: number | null;
  sites?: { site_id: number; site_name: string; org_unit_id: number }[];
}) {
  vi.mocked(api.post).mockImplementation(async (url: string) =>
    url === VALIDATE
      ? {
          site_name: "Test Hospital",
          org_unit_id: null,
          site_id: null,
          ...answer,
        }
      : { detail: "created" },
  );
}

/** The first view: choose the module, name the lead, press Continue. */
async function nameClinicalLead(user: User) {
  await user.click(
    await screen.findByRole("combobox", { name: /teaching module/i }),
  );
  await user.click(await screen.findByRole("option", { name: "Module one" }));
  await user.type(
    screen.getByLabelText(/Clinical lead email address/),
    "lead@example.com",
  );
  await user.click(screen.getByTestId("submit-button"));
}

/** The second view: the account form, filled in. */
async function fillInAccount(user: User) {
  await user.type(await screen.findByLabelText("Full name *"), "Test User");
  await user.type(screen.getByLabelText("Username *"), "testuser");
  await user.type(screen.getByLabelText("Email *"), "test@example.com");
  await user.type(screen.getByLabelText(/^Password/), "pass1234");
  await user.type(screen.getByLabelText(/Confirm password/), "pass1234");
}

function registration(): Record<string, unknown> {
  const call = vi.mocked(api.post).mock.calls.find(([url]) => url === REGISTER);
  expect(call).toBeDefined();
  return call![1] as Record<string, unknown>;
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue({
      modules: [{ value: "bank-1", label: "Module one" }],
    });
    vi.mocked(api.post).mockReset();
    leadCheckAnswers({ valid: true, org_unit_id: 7, site_id: 9 });
    navigate.mockReset();
    vi.stubEnv("VITE_CLINICAL_SERVICES_ENABLED", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("the first view", () => {
    it("asks for a module and a clinical lead", async () => {
      renderWithRouter(<RegisterPage />);

      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: "Register for Quill Teaching",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Clinical lead email address"),
      ).toBeInTheDocument();
    });

    it("links to the guide to joining", async () => {
      renderWithRouter(<RegisterPage />);

      expect(
        await screen.findByRole("link", { name: "How to join a course" }),
      ).toHaveAttribute("href", "/guides/join-a-course");
    });

    it("checks the clinical lead against the module chosen", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(VALIDATE, {
          email: "lead@example.com",
          bank_id: "bank-1",
        }),
      );
    });

    it("stays put and says so when the clinical lead is not found", async () => {
      leadCheckAnswers({ valid: false });
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);

      expect(
        await screen.findByText("Clinical lead not found"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Create an account")).not.toBeInTheDocument();
    });

    // The API would refuse the registration once the whole account form
    // was filled in, so the first view refuses it instead.
    it("treats a lead whose organisation does not offer the module as not found", async () => {
      leadCheckAnswers({ valid: true, org_unit_id: null, site_id: 9 });
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);

      expect(
        await screen.findByText("Clinical lead not found"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Create an account")).not.toBeInTheDocument();
    });
  });

  describe("the second view", () => {
    it("is the account form, on the same page", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);

      expect(await screen.findByText("Create an account")).toBeInTheDocument();
      expect(navigate).not.toHaveBeenCalled();
      expect(
        screen.getByRole("link", { name: "How to join a course" }),
      ).toHaveAttribute("href", "/guides/join-a-course");
    });

    // The API works the organisation out from the lead and takes none on
    // trust, so none is sent. The site is sent, and the API checks it is
    // the lead's: with a lead at several sites it is the delegate's choice.
    it("registers with the module, the clinical lead and the site", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);
      await fillInAccount(user);
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => expect(navigate).toHaveBeenCalled());
      const sent = registration();
      expect(sent).toMatchObject({
        username: "testuser",
        full_name: "Test User",
        email: "test@example.com",
        teaching_module_id: "bank-1",
        clinical_lead_email: "lead@example.com",
        site_id: 9,
      });
      expect(sent).not.toHaveProperty("org_unit_id");
    });

    it("names the site being joined in a heading", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);

      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Joining Test Hospital",
        }),
      ).toBeInTheDocument();
    });

    it("goes back to the first view with the module and the lead as they were", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);
      await user.click(await screen.findByRole("button", { name: "Back" }));

      expect(
        await screen.findByLabelText(/Clinical lead email address/),
      ).toHaveValue("lead@example.com");
      expect(
        screen.getByRole("combobox", { name: /teaching module/i }),
      ).toHaveValue("Module one");
      expect(screen.queryByText("Create an account")).not.toBeInTheDocument();
    });

    it("sends the marketing box as not ticked, so the API knows it was shown", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);
      await fillInAccount(user);
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => expect(navigate).toHaveBeenCalled());
      expect(registration()).toMatchObject({ marketing_opt_out: false });
    });

    it("sends the refusal when the box is ticked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);
      await fillInAccount(user);
      await user.click(
        screen.getByRole("checkbox", {
          name: "I would rather not get news and updates",
        }),
      );
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => expect(navigate).toHaveBeenCalled());
      expect(registration()).toMatchObject({ marketing_opt_out: true });
    });

    it("goes on to the page about the verification email", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);
      await fillInAccount(user);
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith("/verify-email-pending", {
          state: { email: "test@example.com" },
        }),
      );
    });
  });

  describe("a clinical lead at several sites", () => {
    const TWO_SITES = [
      { site_id: 9, site_name: "North Hospital", org_unit_id: 7 },
      { site_id: 11, site_name: "South Hospital", org_unit_id: 7 },
    ];

    beforeEach(() => {
      leadCheckAnswers({ valid: true, sites: TWO_SITES });
    });

    it("asks which site, and does not show the account form yet", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);

      expect(
        await screen.findByRole("radiogroup", {
          name: /Which site are you joining\?/,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "North Hospital" }),
      ).not.toBeChecked();
      expect(
        screen.getByRole("radio", { name: "South Hospital" }),
      ).not.toBeChecked();
      expect(screen.queryByText("Create an account")).not.toBeInTheDocument();
    });

    it("names the site chosen, and registers with it", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);
      await user.click(
        await screen.findByRole("radio", { name: "South Hospital" }),
      );
      await user.click(screen.getByTestId("submit-button"));

      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Joining South Hospital",
        }),
      ).toBeInTheDocument();

      await fillInAccount(user);
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => expect(navigate).toHaveBeenCalled());
      expect(registration()).toMatchObject({ site_id: 11 });
    });

    it("goes back from the account form to the choice, and from there to the first view", async () => {
      const user = userEvent.setup();
      renderWithRouter(<RegisterPage />);

      await nameClinicalLead(user);
      await user.click(
        await screen.findByRole("radio", { name: "North Hospital" }),
      );
      await user.click(screen.getByTestId("submit-button"));
      await screen.findByText("Create an account");

      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(
        await screen.findByRole("radiogroup", {
          name: /Which site are you joining\?/,
        }),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(
        await screen.findByLabelText(/Clinical lead email address/),
      ).toHaveValue("lead@example.com");
    });
  });

  // One site listed is the answer: no question is asked.
  it("skips the choice for a lead whose list holds one site", async () => {
    leadCheckAnswers({
      valid: true,
      sites: [{ site_id: 9, site_name: "Only Hospital", org_unit_id: 7 }],
    });
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage />);

    await nameClinicalLead(user);

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Joining Only Hospital",
      }),
    ).toBeInTheDocument();
  });

  it("treats a valid lead with an empty list of sites as not found", async () => {
    leadCheckAnswers({ valid: true, sites: [] });
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage />);

    await nameClinicalLead(user);

    expect(
      await screen.findByText("Clinical lead not found"),
    ).toBeInTheDocument();
  });

  it("offers no registration on a clinical deployment", () => {
    vi.stubEnv("VITE_CLINICAL_SERVICES_ENABLED", "true");

    renderWithRouter(<RegisterPage />);

    expect(
      screen.queryByRole("heading", { name: "Register for Quill Teaching" }),
    ).not.toBeInTheDocument();
  });
});
