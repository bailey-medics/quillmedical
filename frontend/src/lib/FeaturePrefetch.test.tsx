import { act, waitFor } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth, type User } from "@/auth/AuthContext";
import { renderWithMantine } from "@test/test-utils";
import FeaturePrefetch from "./FeaturePrefetch";
import {
  MANIFEST_ADDRESS,
  resetPrefetchStateForTests,
  type PrefetchChunk,
  type PrefetchIo,
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

function chunk(name: string): PrefetchChunk<User> {
  return {
    name,
    source: `src/${name}Chunk.ts`,
    canOpen: (user: User) => user.enabled_features?.includes(name) ?? false,
  };
}

/** One file per feature, named after it: `/assets/teaching.js`. */
function fileOf(name: string): string {
  return `/assets/${name}.js`;
}

/** Serves a manifest for the given features; `failing` files answer 503. */
function makeIo(names: string[], failing: string[] = []) {
  const manifest = Object.fromEntries(
    names.map((name) => [`src/${name}Chunk.ts`, { file: `assets/${name}.js` }]),
  );
  const fetch = vi.fn((address: string) =>
    Promise.resolve({
      ok: !failing.includes(address),
      status: failing.includes(address) ? 503 : 200,
      json: () => Promise.resolve(manifest),
    } as unknown as Response),
  );
  const io: PrefetchIo = { fetch };
  return {
    io,
    /** The files asked for, the manifest aside. */
    fetched: () =>
      fetch.mock.calls
        .map(([address]) => address)
        .filter((address) => address !== MANIFEST_ADDRESS),
  };
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
        // The manifest is read, then the files: several turns.
        for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
      });
    },
    waiting,
  };
}

function renderAt(
  path: string,
  chunks: PrefetchChunk<User>[],
  schedule: (callback: () => void) => () => void,
  io: PrefetchIo,
) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <FeaturePrefetch chunks={chunks} schedule={schedule} io={io} />
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
  const all = ["teaching", "passport", "admin"];

  it("fetches, one at a time, the features the person can open", async () => {
    signIn(learner);
    const { io, fetched } = makeIo(all);
    const { schedule, idle } = makeSchedule();

    renderAt("/teaching", all.map(chunk), schedule, io);
    expect(fetched()).toEqual([]);

    await idle();
    expect(fetched()).toEqual([fileOf("teaching")]);

    await idle();
    expect(fetched()).toEqual([fileOf("teaching"), fileOf("passport")]);

    await idle();
    expect(fetched()).not.toContain(fileOf("admin"));
  });

  it("starts nothing when nobody is signed in", async () => {
    signIn(null);
    const { io } = makeIo(all);
    const { schedule, idle } = makeSchedule();

    renderAt("/teaching", [chunk("teaching")], schedule, io);
    await idle();

    expect(schedule).not.toHaveBeenCalled();
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it("starts nothing during an exam, not even reading the manifest", async () => {
    signIn(learner);
    const { io } = makeIo(all);
    const { schedule, idle } = makeSchedule();

    renderAt("/teaching/assessment/1", [chunk("passport")], schedule, io);
    await idle();

    expect(schedule).not.toHaveBeenCalled();
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it("drops what was waiting when the exam starts", async () => {
    signIn(learner);
    const { io } = makeIo(all);
    const { schedule, cancel, idle, waiting } = makeSchedule();

    const router = renderAt("/teaching", [chunk("passport")], schedule, io);
    expect(waiting).toHaveLength(1);

    await act(() => router.navigate("/teaching/assessment/1"));

    expect(cancel).toHaveBeenCalled();
    expect(waiting).toHaveLength(0);
    await idle();
    expect(io.fetch).not.toHaveBeenCalled();
  });

  // The browser may run an idle callback it was asked to cancel a moment
  // too late. Being cancelled must be enough on its own.
  it("starts nothing if the idle moment comes after the exam began", async () => {
    signIn(learner);
    const { io } = makeIo(all);
    const late: Array<() => void> = [];
    const schedule = (callback: () => void) => {
      late.push(callback);
      return () => {};
    };

    const router = renderAt("/teaching", [chunk("passport")], schedule, io);
    await act(() => router.navigate("/teaching/assessment/1"));
    await act(async () => {
      late.forEach((callback) => callback());
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    });

    expect(io.fetch).not.toHaveBeenCalled();
  });

  it("picks up again once back on a safe page", async () => {
    signIn(learner);
    const { io, fetched } = makeIo(all);
    const { schedule, idle } = makeSchedule();

    const router = renderAt(
      "/teaching/assessment/1",
      [chunk("passport")],
      schedule,
      io,
    );
    await act(() => router.navigate("/teaching"));
    await idle();

    await waitFor(() => expect(fetched()).toEqual([fileOf("passport")]));
  });

  it("carries on to the next feature when one fails", async () => {
    signIn(learner);
    const { io, fetched } = makeIo(all, [fileOf("teaching")]);
    const { schedule, idle } = makeSchedule();

    renderAt("/teaching", [chunk("teaching"), chunk("passport")], schedule, io);
    await idle();
    await idle();

    expect(fetched()).toContain(fileOf("passport"));
  });
});
