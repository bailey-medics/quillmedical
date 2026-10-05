/**
 * TeachingRegisterPage tests: what registering sends to the API.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { api } from "@/lib/api";
import TeachingRegisterPage from "./TeachingRegisterPage";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

vi.mock("@lib/connectivity", () => ({
  useConnectivity: () => ({ isOnline: true }),
}));

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
    renderWithRouter(<TeachingRegisterPage />);

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
    renderWithRouter(<TeachingRegisterPage />, {
      routePath: "/teaching/register/:module",
      initialRoute: "/teaching/register/colonoscopy-optical-diagnosis",
    });

    await fillIn(user);
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(
      "/auth/register",
      expect.objectContaining({
        teaching_module_id: "colonoscopy-optical-diagnosis",
      }),
    );
  });

  it("sends the refusal when the box is ticked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<TeachingRegisterPage />);

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
    renderWithRouter(<TeachingRegisterPage />);

    expect(
      screen.getByRole("link", { name: "How to join a course" }),
    ).toHaveAttribute("href", "/guides/join-a-course");
  });
});
