/**
 * RegisterPage tests
 *
 * Joining, on one page with two views: choose a module and name a
 * clinical lead, then create the account. Only a teaching deployment lets
 * somebody register for themselves.
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

    // The API works the site out from these two and takes no id on trust,
    // so none is sent.
    it("registers with the module and the clinical lead, and names no site", async () => {
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
      });
      expect(sent).not.toHaveProperty("org_unit_id");
      expect(sent).not.toHaveProperty("site_id");
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

  it("offers no registration on a clinical deployment", () => {
    vi.stubEnv("VITE_CLINICAL_SERVICES_ENABLED", "true");

    renderWithRouter(<RegisterPage />);

    expect(
      screen.queryByRole("heading", { name: "Register for Quill Teaching" }),
    ).not.toBeInTheDocument();
  });
});
