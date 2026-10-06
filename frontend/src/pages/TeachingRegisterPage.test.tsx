/**
 * TeachingRegisterPage tests: what registering sends to the API.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { renderWithMantine } from "@/test/test-utils";
import { api } from "@/lib/api";
import TeachingRegisterPage from "./TeachingRegisterPage";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

vi.mock("@lib/connectivity", () => ({
  useConnectivity: () => ({ isOnline: true }),
}));

const MODULE = "colonoscopy-optical-diagnosis";

/**
 * Open the second step as the first leaves it: with the organisation and
 * site it found in the router's state. `state` set to null opens it as a
 * refresh or a bookmark would, with nothing.
 */
function renderStep(
  state: { organisationId?: number | null; siteId?: number | null } | null = {
    organisationId: 1,
    siteId: 2,
  },
) {
  const router = createMemoryRouter(
    [
      { path: "/teaching/register/:module", element: <TeachingRegisterPage /> },
      { path: "/register", element: <div>The first step</div> },
    ],
    {
      initialEntries: [{ pathname: `/teaching/register/${MODULE}`, state }],
    },
  );
  return renderWithMantine(<RouterProvider router={router} />);
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Full name *"), "Test User");
  await user.type(screen.getByLabelText("Username *"), "testuser");
  await user.type(screen.getByLabelText("Email *"), "test@example.com");
  await user.type(screen.getByLabelText(/^Password/), "pass1234");
  await user.type(screen.getByLabelText(/Confirm password/), "pass1234");
}

describe("TeachingRegisterPage", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({ detail: "created" });
  });

  it("sends the marketing box as not ticked, so the API knows it was shown", async () => {
    const user = userEvent.setup();
    renderStep();

    await fillIn(user);
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(
      "/auth/register",
      expect.objectContaining({
        username: "testuser",
        marketing_opt_out: false,
      }),
    );
  });

  it("sends the module its link names, so they are enrolled on it", async () => {
    const user = userEvent.setup();
    renderStep();

    await fillIn(user);
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(
      "/auth/register",
      expect.objectContaining({
        teaching_module_id: MODULE,
      }),
    );
  });

  it("sends the refusal when the box is ticked", async () => {
    const user = userEvent.setup();
    renderStep();

    await fillIn(user);
    await user.click(
      screen.getByRole("checkbox", {
        name: "I would rather not get news and updates",
      }),
    );
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(
      "/auth/register",
      expect.objectContaining({ marketing_opt_out: true }),
    );
  });

  it("links to the guide to joining", () => {
    renderStep();

    expect(
      screen.getByRole("link", { name: "How to join a course" }),
    ).toHaveAttribute("href", "/guides/join-a-course");
  });

  it("sends where they belong, as the first step found it", async () => {
    const user = userEvent.setup();
    renderStep({ organisationId: 7, siteId: 9 });

    await fillIn(user);
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(
      "/auth/register",
      expect.objectContaining({ org_unit_id: 7, site_id: 9 }),
    );
  });

  // A refresh, a bookmark or a link opened in a new tab loses what the
  // first step found. The form used to be shown anyway, and the API
  // refused it once it was filled in.
  describe("opened without the first step", () => {
    it.each([
      ["no state at all", null],
      ["state that names no organisation", { siteId: 2 }],
      ["an organisation that is null", { organisationId: null, siteId: 2 }],
    ])("goes back to the first step, given %s", (_name, state) => {
      renderStep(state);

      expect(screen.getByText("The first step")).toBeInTheDocument();
      expect(screen.queryByText("Create an account")).not.toBeInTheDocument();
    });

    it("says nothing about why", () => {
      renderStep(null);

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
