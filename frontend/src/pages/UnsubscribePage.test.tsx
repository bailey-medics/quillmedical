/**
 * UnsubscribePage tests: what the page asks the server, and what it shows
 * for each answer.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { api } from "@/lib/api";
import UnsubscribePage from "./UnsubscribePage";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const SWITCH = "News and updates by email";
const PATH = "/marketing/unsubscribe?token=abc.def";

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

function open(route = "/unsubscribe?token=abc.def") {
  renderWithRouter(<UnsubscribePage />, {
    routePath: "/unsubscribe",
    initialRoute: route,
  });
}

describe("UnsubscribePage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.get).mockResolvedValue({
      email: "a***@e***.com",
      marketing_emails: true,
    });
  });

  it("reads the preference with the token from the link", async () => {
    open();

    expect(await screen.findByRole("switch", { name: SWITCH })).toBeChecked();
    expect(api.get).toHaveBeenCalledExactlyOnceWith(PATH);
    expect(
      screen.getByText(/sent to a\*\*\*@e\*\*\*\.com\./),
    ).toBeInTheDocument();
  });

  it("changes nothing by being opened", async () => {
    open();

    await screen.findByRole("switch", { name: SWITCH });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("escapes a token that holds characters with a meaning in a URL", async () => {
    open("/unsubscribe?token=a%2Bb%26c");

    await screen.findByRole("switch", { name: SWITCH });
    expect(api.get).toHaveBeenCalledExactlyOnceWith(
      "/marketing/unsubscribe?token=a%2Bb%26c",
    );
  });

  it("asks the server nothing when the link has no token", () => {
    open("/unsubscribe");

    expect(screen.getByText("This link does not work")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it.each([404, 422])(
    "says the link does not work when the server answers %i",
    async (status) => {
      vi.mocked(api.get).mockRejectedValue(httpError(status));
      open();

      expect(
        await screen.findByText("This link does not work"),
      ).toBeInTheDocument();
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    },
  );

  it("says the preferences could not be loaded when the request fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("Network error"));
    open();

    expect(
      await screen.findByText("We could not load your preferences"),
    ).toBeInTheDocument();
  });

  it("turns news off, and says so", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({
      email: "a***@e***.com",
      marketing_emails: false,
    });
    open();

    await user.click(await screen.findByRole("switch", { name: SWITCH }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledExactlyOnceWith(PATH, {
        wants_marketing: false,
      }),
    );
    expect(
      await screen.findByText("You will not be sent news and updates"),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: SWITCH })).not.toBeChecked();
  });

  it("turns news back on, and says so", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({
      email: "a***@e***.com",
      marketing_emails: false,
    });
    vi.mocked(api.post).mockResolvedValue({
      email: "a***@e***.com",
      marketing_emails: true,
    });
    open();

    await user.click(await screen.findByRole("switch", { name: SWITCH }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledExactlyOnceWith(PATH, {
        wants_marketing: true,
      }),
    );
    expect(
      await screen.findByText("You will be sent news and updates"),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: SWITCH })).toBeChecked();
  });

  it("puts the switch back and says why when a change is not saved", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("Network error"));
    open();

    await user.click(await screen.findByRole("switch", { name: SWITCH }));

    expect(
      await screen.findByText("We could not save that. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: SWITCH })).toBeChecked();
    expect(
      screen.queryByText("You will not be sent news and updates"),
    ).not.toBeInTheDocument();
  });

  it("says the link does not work if the server refuses it on a change", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(httpError(404));
    open();

    await user.click(await screen.findByRole("switch", { name: SWITCH }));

    expect(
      await screen.findByText("This link does not work"),
    ).toBeInTheDocument();
  });
});
