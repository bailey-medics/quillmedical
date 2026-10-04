import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import * as apiLib from "@/lib/api";
import { INBOX_REFRESH_MS, inboxChanged } from "@/lib/inbox/inbox";
import RibbonInbox from "./RibbonInbox";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const user: User = {
  id: "1",
  username: "operator",
  email: "operator@example.com",
  competencies: [],
};

function signedIn() {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: { status: "authenticated", user },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

describe("RibbonInbox", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
    signedIn();
  });

  it("asks what is waiting and shows the total", async () => {
    const get = vi.spyOn(apiLib.api, "get").mockResolvedValue({
      items: [{ source: "feedback_new", count: 2 }],
      total: 2,
    });

    renderWithRouter(<RibbonInbox />);

    expect(await screen.findByTestId("inbox-count")).toHaveTextContent("2");
    expect(get).toHaveBeenCalledWith("/inbox");
  });

  it("opens the inbox page when pressed", async () => {
    const pointer = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      items: [{ source: "feedback_new", count: 2 }],
      total: 2,
    });

    renderWithRouter(<RibbonInbox />);
    await screen.findByTestId("inbox-count");
    await pointer.click(
      screen.getByRole("button", { name: "Inbox (2 waiting)" }),
    );

    expect(mockNavigate).toHaveBeenCalledWith("/inbox");
  });

  it("draws the envelope with no count when the fetch fails", async () => {
    const get = vi
      .spyOn(apiLib.api, "get")
      .mockRejectedValue(new Error("HTTP 500"));

    renderWithRouter(<RibbonInbox />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Inbox" })).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-count")).not.toBeInTheDocument();
  });

  it("asks again when a page says something has been dealt with", async () => {
    const get = vi
      .spyOn(apiLib.api, "get")
      .mockResolvedValueOnce({
        items: [{ source: "feedback_new", count: 2 }],
        total: 2,
      })
      .mockResolvedValueOnce({
        items: [{ source: "feedback_new", count: 1 }],
        total: 1,
      });

    renderWithRouter(<RibbonInbox />);
    expect(await screen.findByTestId("inbox-count")).toHaveTextContent("2");

    act(() => inboxChanged());

    await waitFor(() =>
      expect(screen.getByTestId("inbox-count")).toHaveTextContent("1"),
    );
    expect(get).toHaveBeenCalledTimes(2);
  });

  describe("while the page is left open", () => {
    /** Say whether the tab can be seen, and tell whoever is listening. */
    function setVisible(visible: boolean) {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (visible ? "visible" : "hidden"),
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      setVisible(true);
      vi.useRealTimers();
    });

    it("asks again each minute", async () => {
      const get = vi
        .spyOn(apiLib.api, "get")
        .mockResolvedValue({ items: [], total: 0 });

      renderWithRouter(<RibbonInbox />);
      expect(get).toHaveBeenCalledTimes(1);

      await act(() => vi.advanceTimersByTimeAsync(INBOX_REFRESH_MS));
      expect(get).toHaveBeenCalledTimes(2);

      await act(() => vi.advanceTimersByTimeAsync(INBOX_REFRESH_MS));
      expect(get).toHaveBeenCalledTimes(3);
    });

    it("asks nothing while the tab is hidden", async () => {
      const get = vi
        .spyOn(apiLib.api, "get")
        .mockResolvedValue({ items: [], total: 0 });

      renderWithRouter(<RibbonInbox />);
      setVisible(false);
      await act(() => vi.advanceTimersByTimeAsync(INBOX_REFRESH_MS * 3));

      // The one from mounting, and none since.
      expect(get).toHaveBeenCalledTimes(1);
    });

    it("asks at once when the tab comes back into view", async () => {
      const get = vi
        .spyOn(apiLib.api, "get")
        .mockResolvedValue({ items: [], total: 0 });

      renderWithRouter(<RibbonInbox />);
      setVisible(false);
      await act(() => vi.advanceTimersByTimeAsync(INBOX_REFRESH_MS * 3));
      expect(get).toHaveBeenCalledTimes(1);

      setVisible(true);

      expect(get).toHaveBeenCalledTimes(2);
    });

    it("stops asking once it is gone", async () => {
      const get = vi
        .spyOn(apiLib.api, "get")
        .mockResolvedValue({ items: [], total: 0 });

      const { unmount } = renderWithRouter(<RibbonInbox />);
      unmount();
      await act(() => vi.advanceTimersByTimeAsync(INBOX_REFRESH_MS * 2));

      expect(get).toHaveBeenCalledTimes(1);
    });
  });

  it("asks nothing of somebody who is not signed in", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      state: { status: "unauthenticated", user: null },
      login: vi.fn(),
      logout: vi.fn(),
      reload: vi.fn(),
    });
    const get = vi.spyOn(apiLib.api, "get");

    renderWithRouter(<RibbonInbox />);

    expect(get).not.toHaveBeenCalled();
  });
});
