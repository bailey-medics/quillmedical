import { act, waitFor } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth, type User } from "@/auth/AuthContext";
import { renderWithMantine } from "@test/test-utils";
import FeaturePrefetch from "./FeaturePrefetch";
import {
  resetPrefetchStateForTests,
  type PrefetchChunk,
} from "./prefetchFeatures";

vi.mock("@/auth/AuthContext", () => ({ useAuth: vi.fn() }));

const learner = { enabled_features: ["teaching", "passport"] } as User;

function signIn(user: User | null): void {
  vi.mocked(useAuth).mockReturnValue(
    (user === null
      ? { state: { status: "unauthenticated", user: null } }
      : { state: { status: "authenticated", user } }) as ReturnType<
      typeof useAuth
    >,
  );
}

function chunk(name: string, load = () => Promise.resolve({})) {
  return {
    name,
    load: vi.fn(load),
    canOpen: (user: User) => user.enabled_features?.includes(name) ?? false,
  } satisfies PrefetchChunk<User>;
}

/** Stands in for the browser's idle moment: nothing runs until `idle()`. */
function makeSchedule() {
  const waiting: Array<() => void> = [];
  const cancel = vi.fn();
  return {
    schedule: vi.fn((callback: () => void) => {
      waiting.push(callback);
      return () => {
        cancel();
        const at = waiting.indexOf(callback);
        if (at !== -1) waiting.splice(at, 1);
      };
    }),
    cancel,
    /** Runs whatever is waiting, as the browser would when idle. */
    idle: async () => {
      const due = waiting.splice(0);
      await act(async () => {
        due.forEach((callback) => callback());
        await Promise.resolve();
      });
    },
    waiting,
  };
}

function renderAt(
  path: string,
  chunks: PrefetchChunk<User>[],
  schedule: (callback: () => void) => () => void,
) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <FeaturePrefetch chunks={chunks} schedule={schedule} />
            <Outlet />
          </>
        ),
        children: [
          {
            path: "/teaching",
            element: <p>Dashboard</p>,
            handle: { safeForReload: true },
          },
          // As in main.tsx: the exam has no `safeForReload`.
          { path: "/teaching/assessment/1", element: <p>Exam</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  renderWithMantine(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  resetPrefetchStateForTests();
  vi.mocked(useAuth).mockReset();
});

describe("FeaturePrefetch", () => {
  it("fetches, one at a time, the features the person can open", async () => {
    signIn(learner);
    const teaching = chunk("teaching");
    const passport = chunk("passport");
    const admin = chunk("admin");
    const { schedule, idle } = makeSchedule();

    renderAt("/teaching", [teaching, passport, admin], schedule);
    expect(teaching.load).not.toHaveBeenCalled();

    await idle();
    expect(teaching.load).toHaveBeenCalledTimes(1);
    expect(passport.load).not.toHaveBeenCalled();

    await idle();
    expect(passport.load).toHaveBeenCalledTimes(1);

    await idle();
    expect(admin.load).not.toHaveBeenCalled();
  });

  it("starts nothing when nobody is signed in", async () => {
    signIn(null);
    const teaching = chunk("teaching");
    const { schedule, idle } = makeSchedule();

    renderAt("/teaching", [teaching], schedule);
    await idle();

    expect(schedule).not.toHaveBeenCalled();
    expect(teaching.load).not.toHaveBeenCalled();
  });

  it("starts nothing during an exam", async () => {
    signIn(learner);
    const passport = chunk("passport");
    const { schedule, idle } = makeSchedule();

    renderAt("/teaching/assessment/1", [passport], schedule);
    await idle();

    expect(schedule).not.toHaveBeenCalled();
    expect(passport.load).not.toHaveBeenCalled();
  });

  it("drops what was waiting when the exam starts", async () => {
    signIn(learner);
    const passport = chunk("passport");
    const { schedule, cancel, idle, waiting } = makeSchedule();

    const router = renderAt("/teaching", [passport], schedule);
    expect(waiting).toHaveLength(1);

    await act(() => router.navigate("/teaching/assessment/1"));

    expect(cancel).toHaveBeenCalled();
    expect(waiting).toHaveLength(0);
    await idle();
    expect(passport.load).not.toHaveBeenCalled();
  });

  // The browser may run an idle callback it was asked to cancel a moment
  // too late. Being cancelled must be enough on its own.
  it("starts nothing if the idle moment comes after the exam began", async () => {
    signIn(learner);
    const passport = chunk("passport");
    const late: Array<() => void> = [];
    const schedule = (callback: () => void) => {
      late.push(callback);
      return () => {};
    };

    const router = renderAt("/teaching", [passport], schedule);
    await act(() => router.navigate("/teaching/assessment/1"));
    await act(async () => {
      late.forEach((callback) => callback());
      await Promise.resolve();
    });

    expect(passport.load).not.toHaveBeenCalled();
  });

  it("picks up again once back on a safe page", async () => {
    signIn(learner);
    const passport = chunk("passport");
    const { schedule, idle } = makeSchedule();

    const router = renderAt("/teaching/assessment/1", [passport], schedule);
    await act(() => router.navigate("/teaching"));
    await idle();

    await waitFor(() => expect(passport.load).toHaveBeenCalledTimes(1));
  });

  it("carries on to the next feature when one fails", async () => {
    signIn(learner);
    const teaching = chunk("teaching", () =>
      Promise.reject(new Error("chunk gone")),
    );
    const passport = chunk("passport");
    const { schedule, idle } = makeSchedule();

    renderAt("/teaching", [teaching, passport], schedule);
    await idle();
    await idle();

    expect(passport.load).toHaveBeenCalledTimes(1);
  });
});
