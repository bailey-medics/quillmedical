/**
 * AuthContext Tests
 *
 * What happens when a session ends part-way through. The API client only
 * says so, by firing `UNAUTHENTICATED_EVENT`; the provider marks the
 * session as ended, and the guard on the route decides where the browser
 * goes. These tests run the three together, with the real provider and
 * the real `RequireAuth`.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, UNAUTHENTICATED_EVENT } from "@lib/api";
import { theme, cssVariablesResolver } from "@/theme";
import { AuthProvider, RETRY_UNREACHABLE_MS, useAuth } from "./AuthContext";
import RequireAuth from "./RequireAuth";

// eslint-disable-next-line no-restricted-imports
import { MantineProvider } from "@mantine/core";

const USER = { id: 1, username: "sam", email: "sam@example.nhs.uk" };

/** Shows the auth state, and a button that logs out. */
function Status() {
  const { state, logout, reload } = useAuth();
  const [signOutFailed, setSignOutFailed] = useState(false);

  return (
    <div>
      <span>status: {state.status}</span>
      <span>logged out: {String(state.loggedOut ?? false)}</span>
      <span>sign out failed: {String(signOutFailed)}</span>
      <button
        type="button"
        onClick={() => void logout().catch(() => setSignOutFailed(true))}
      >
        Log out
      </button>
      <button type="button" onClick={() => void reload()}>
        Ask again
      </button>
    </div>
  );
}

/** The login page, showing what it was told about where they came from. */
function Login() {
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from
    ?.pathname;

  return <div>Login page, from: {from ?? "nowhere"}</div>;
}

function renderApp(initialRoute: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/patients/:id",
        element: (
          <RequireAuth>
            <div>A guarded page</div>
            <Status />
          </RequireAuth>
        ),
      },
      {
        path: "/guides/:slug",
        element: (
          <>
            <div>A public page</div>
            <Status />
          </>
        ),
      },
      { path: "/login", element: <Login /> },
    ],
    { initialEntries: [initialRoute] },
  );

  render(
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      env="test"
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </MantineProvider>,
  );
}

/** What the API client does when a 401 survives the silent refresh. */
function sessionEnds() {
  act(() => {
    window.dispatchEvent(new CustomEvent(UNAUTHENTICATED_EVENT));
  });
}

describe("AuthProvider, when a session ends", () => {
  beforeEach(() => {
    vi.spyOn(api, "get").mockResolvedValue(USER);
    vi.spyOn(api, "post").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends somebody on a guarded page to login, remembering the page", async () => {
    renderApp("/patients/42");
    await screen.findByText("A guarded page");

    sessionEnds();

    expect(
      await screen.findByText("Login page, from: /patients/42"),
    ).toBeInTheDocument();
  });

  it("leaves somebody on a public page where they are", async () => {
    renderApp("/guides/join-a-course");
    await screen.findByText("status: authenticated");

    sessionEnds();

    expect(
      await screen.findByText("status: unauthenticated"),
    ).toBeInTheDocument();
    expect(screen.getByText("A public page")).toBeInTheDocument();
    expect(screen.queryByText(/Login page/)).not.toBeInTheDocument();
  });

  it("leaves a visitor who was never signed in on a public page", async () => {
    // The ordinary case for a public page: `/api/auth/me` answers 401,
    // which is an answer and not a fault.
    vi.spyOn(api, "get").mockImplementation(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHENTICATED_EVENT));

      // As the real client throws it: the status is on the error, and
      // is how `AuthProvider` tells "nobody is signed in" from "could
      // not ask".
      return Promise.reject(
        Object.assign(new Error("Not authenticated"), { status: 401 }),
      );
    });

    renderApp("/guides/join-a-course");

    expect(
      await screen.findByText("status: unauthenticated"),
    ).toBeInTheDocument();
    expect(screen.getByText("A public page")).toBeInTheDocument();
  });

  it("does not forget an explicit logout when a late 401 arrives", async () => {
    // After logging out, the next person on this tab must not be sent
    // to the page the last person was on. `loggedOut` is what stops
    // that, so a stray 401 afterwards must not wipe it.
    renderApp("/guides/join-a-course");
    await screen.findByText("status: authenticated");

    await act(async () => {
      screen.getByRole("button", { name: "Log out" }).click();
    });
    await screen.findByText("logged out: true");

    sessionEnds();

    await waitFor(() => {
      expect(screen.getByText("logged out: true")).toBeInTheDocument();
    });
  });

  it("stops listening when it unmounts", async () => {
    const removed = vi.spyOn(window, "removeEventListener");
    const router = createMemoryRouter([{ path: "/", element: <Status /> }]);
    const { unmount } = render(
      <MantineProvider
        theme={theme}
        cssVariablesResolver={cssVariablesResolver}
        env="test"
      >
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </MantineProvider>,
    );
    await screen.findByText("status: authenticated");

    unmount();

    expect(removed).toHaveBeenCalledWith(
      UNAUTHENTICATED_EVENT,
      expect.any(Function),
    );
  });
});

describe("AuthProvider, signing out", () => {
  beforeEach(() => {
    vi.spyOn(api, "get").mockResolvedValue(USER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function refusal(status: number) {
    return Object.assign(new Error(`HTTP ${status}`), { status });
  }

  it("shows the login page once the server has ended the session", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ detail: "logged out" });
    renderApp("/patients/7");

    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByText(/^Login page/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/auth/logout");
  });

  it("keeps somebody signed in, and says so, when the call fails", async () => {
    // The cookies are the server's to clear. If it was never reached
    // they are still in the browser, and a login page here would hide
    // that the next person to reload is signed in.
    vi.spyOn(api, "post").mockRejectedValue(new Error("Failed to fetch"));
    renderApp("/patients/7");

    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByText("sign out failed: true")).toBeVisible();
    expect(screen.getByText("status: authenticated")).toBeVisible();
    expect(screen.getByText("A guarded page")).toBeVisible();
    expect(screen.queryByText(/^Login page/)).not.toBeInTheDocument();
  });

  it("keeps somebody signed in when the server answers with an error", async () => {
    vi.spyOn(api, "post").mockRejectedValue(refusal(502));
    renderApp("/patients/7");

    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByText("sign out failed: true")).toBeVisible();
    expect(screen.getByText("status: authenticated")).toBeVisible();
  });

  it("counts a session that was already over as signed out", async () => {
    vi.spyOn(api, "post").mockRejectedValue(refusal(401));
    renderApp("/patients/7");

    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByText(/^Login page/)).toBeInTheDocument();
    expect(screen.queryByText("sign out failed: true")).not.toBeInTheDocument();
  });
});

describe("AuthProvider, when the server cannot be asked who is signed in", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function refusal(status: number) {
    return Object.assign(new Error(`HTTP ${status}`), { status });
  }

  it("sends somebody to login when the server says nobody is signed in", async () => {
    vi.spyOn(api, "get").mockRejectedValue(refusal(401));
    renderApp("/patients/7");

    expect(await screen.findByText(/^Login page/)).toBeInTheDocument();
  });

  it.each([
    ["a 502, as during a deploy", refusal(502)],
    ["no network at all", new TypeError("Failed to fetch")],
  ])("does not send somebody to login on %s", async (_name, failure) => {
    vi.spyOn(api, "get").mockRejectedValue(failure);
    renderApp("/patients/7");

    expect(await screen.findByText(/could not reach quill/i)).toBeVisible();
    expect(screen.queryByText(/^Login page/)).not.toBeInTheDocument();
    expect(screen.queryByText("A guarded page")).not.toBeInTheDocument();
  });

  it("shows the page on Try again, once the server answers", async () => {
    vi.spyOn(api, "get")
      .mockRejectedValueOnce(refusal(502))
      .mockResolvedValue(USER);
    renderApp("/patients/7");

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByText("A guarded page")).toBeVisible();
    expect(
      screen.queryByText(/could not reach quill/i),
    ).not.toBeInTheDocument();
  });

  it("asks again by itself, and shows the page when the server answers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(refusal(502))
      .mockResolvedValue(USER);
    renderApp("/patients/7");
    await screen.findByText(/could not reach quill/i);

    await act(() => vi.advanceTimersByTimeAsync(RETRY_UNREACHABLE_MS));

    expect(await screen.findByText("A guarded page")).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("stops asking once the server has answered", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(refusal(502))
      .mockResolvedValue(USER);
    renderApp("/patients/7");
    await screen.findByText(/could not reach quill/i);
    await act(() => vi.advanceTimersByTimeAsync(RETRY_UNREACHABLE_MS));
    await screen.findByText("A guarded page");

    await act(() => vi.advanceTimersByTimeAsync(RETRY_UNREACHABLE_MS * 3));

    expect(get).toHaveBeenCalledTimes(2);
  });

  it("asks again at once when the browser says the connection is back", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(USER);
    renderApp("/patients/7");
    await screen.findByText(/could not reach quill/i);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(await screen.findByText("A guarded page")).toBeVisible();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("keeps somebody signed in when a later check cannot be made", async () => {
    // Known to be signed in, then the profile is asked for again and
    // the server is out of reach. That says nothing about the session.
    vi.spyOn(api, "get")
      .mockResolvedValueOnce(USER)
      .mockRejectedValue(refusal(502));
    renderApp("/patients/7");

    fireEvent.click(await screen.findByRole("button", { name: "Ask again" }));

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.getByText("status: authenticated")).toBeVisible();
    expect(screen.getByText("A guarded page")).toBeVisible();
  });

  it("leaves a public page showing", async () => {
    vi.spyOn(api, "get").mockRejectedValue(refusal(502));
    renderApp("/guides/getting-started");

    expect(await screen.findByText("status: unreachable")).toBeVisible();
    expect(screen.getByText("A public page")).toBeVisible();
    expect(screen.queryByText(/^Login page/)).not.toBeInTheDocument();
  });
});
