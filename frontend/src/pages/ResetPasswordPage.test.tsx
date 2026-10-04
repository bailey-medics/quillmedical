/**
 * ResetPasswordPage tests: when the marketing question is asked, and what
 * the page then sends.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { api } from "@/lib/api";
import ResetPasswordPage from "./ResetPasswordPage";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

const BOX = "I would rather not get news and updates";

async function setPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("New password *"), "NewSecurePass1!");
  await user.type(
    screen.getByLabelText("Confirm password *"),
    "NewSecurePass1!",
  );
  await user.click(screen.getByTestId("submit-button"));
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({ detail: "ok" });
  });

  it("asks nothing about marketing on a forgotten-password link", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ResetPasswordPage />, {
      routePath: "/reset-password",
      initialRoute: "/reset-password?token=abc",
    });

    expect(
      screen.queryByRole("checkbox", { name: BOX }),
    ).not.toBeInTheDocument();
    await setPassword(user);

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/auth/reset-password", {
      token: "abc",
      new_password: "NewSecurePass1!",
    });
  });

  it("asks on an invite link, and sends the box as not ticked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ResetPasswordPage />, {
      routePath: "/reset-password",
      initialRoute: "/reset-password?token=abc&invite=1",
    });

    expect(screen.getByRole("checkbox", { name: BOX })).not.toBeChecked();
    await setPassword(user);

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/auth/reset-password", {
      token: "abc",
      new_password: "NewSecurePass1!",
      marketing_opt_out: false,
    });
  });

  it("sends the refusal when the box is ticked on an invite", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ResetPasswordPage />, {
      routePath: "/reset-password",
      initialRoute: "/reset-password?token=abc&invite=1",
    });

    await user.click(screen.getByRole("checkbox", { name: BOX }));
    await setPassword(user);

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(
      "/auth/reset-password",
      expect.objectContaining({ marketing_opt_out: true }),
    );
  });
});
