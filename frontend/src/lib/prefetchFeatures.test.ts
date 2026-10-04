import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  filesFor,
  mayPrefetch,
  MANIFEST_ADDRESS,
  prefetchNextFeature,
  readConnection,
  readManifest,
  resetPrefetchStateForTests,
  whenIdle,
  type BuildManifest,
  type PrefetchChunk,
  type PrefetchConditions,
  type PrefetchIo,
} from "./prefetchFeatures";

interface TestUser {
  features: string[];
}

function chunk(name: string): PrefetchChunk<TestUser> {
  return {
    name,
    source: `src/${name}Chunk.ts`,
    canOpen: (user) => user.features.includes(name),
  };
}

/** A build with two features that share one file. */
const manifest: BuildManifest = {
  "src/teachingChunk.ts": {
    file: "assets/teachingChunk-aaaa1111.js",
    imports: ["_shared.js"],
    css: ["assets/teachingChunk-aaaa1111.css"],
  },
  "src/passportChunk.ts": {
    file: "assets/passportChunk-bbbb2222.js",
    imports: ["_shared.js"],
  },
  "_shared.js": {
    file: "assets/shared-cccc3333.js",
    imports: ["_deep.js"],
    css: ["assets/shared-cccc3333.css"],
  },
  "_deep.js": { file: "assets/deep-dddd4444.js", imports: ["_shared.js"] },
};

function response(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 503,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Answers the manifest, and every other address with success, unless the
 * address is in `failing`.
 */
function makeIo(
  failing: string[] = [],
  served: unknown = manifest,
): PrefetchIo & { fetch: ReturnType<typeof vi.fn>; files: () => string[] } {
  const fetch = vi.fn((address: string) => {
    if (address === MANIFEST_ADDRESS) return Promise.resolve(response(served));
    if (failing.includes(address))
      return Promise.resolve(response(null, false));
    return Promise.resolve(response(null));
  });
  return {
    fetch,
    files: () =>
      fetch.mock.calls
        .map(([address]) => address as string)
        .filter((address) => address !== MANIFEST_ADDRESS),
  };
}

const everything: PrefetchConditions = {
  signedIn: true,
  routeIsSafe: true,
  navigationIdle: true,
  online: true,
  constrained: false,
};

beforeEach(() => {
  resetPrefetchStateForTests();
});

describe("mayPrefetch", () => {
  it("allows a fetch when every condition holds", () => {
    expect(mayPrefetch(everything)).toBe(true);
  });

  it.each<[string, Partial<PrefetchConditions>]>([
    ["nobody is signed in", { signedIn: false }],
    [
      "the route is not safe to reload, as an exam is not",
      { routeIsSafe: false },
    ],
    ["a navigation is under way", { navigationIdle: false }],
    ["the browser is offline", { online: false }],
    ["the connection is constrained", { constrained: true }],
  ])("refuses when %s", (_why, change) => {
    expect(mayPrefetch({ ...everything, ...change })).toBe(false);
  });
});

describe("readConnection", () => {
  it("treats a browser that says nothing as online and unconstrained", () => {
    expect(readConnection({})).toEqual({ online: true, constrained: false });
  });

  it("reports offline", () => {
    expect(readConnection({ onLine: false }).online).toBe(false);
  });

  it("reports data saver as constrained", () => {
    expect(readConnection({ connection: { saveData: true } }).constrained).toBe(
      true,
    );
  });

  it.each(["slow-2g", "2g"])("reports %s as constrained", (effectiveType) => {
    expect(readConnection({ connection: { effectiveType } }).constrained).toBe(
      true,
    );
  });

  it("does not treat 4g as constrained", () => {
    expect(
      readConnection({ connection: { effectiveType: "4g" } }).constrained,
    ).toBe(false);
  });
});

describe("filesFor", () => {
  it("lists a chunk's file, its stylesheets and everything it imports", () => {
    expect(filesFor(manifest, "src/teachingChunk.ts").sort()).toEqual([
      "/assets/deep-dddd4444.js",
      "/assets/shared-cccc3333.css",
      "/assets/shared-cccc3333.js",
      "/assets/teachingChunk-aaaa1111.css",
      "/assets/teachingChunk-aaaa1111.js",
    ]);
  });

  it("copes with files that import each other, and lists each once", () => {
    const files = filesFor(manifest, "_shared.js");

    expect(files).toHaveLength(new Set(files).size);
    expect(files).toContain("/assets/deep-dddd4444.js");
  });

  it("finds nothing for a chunk the manifest does not know", () => {
    expect(filesFor(manifest, "src/adminChunk.ts")).toEqual([]);
  });

  it("skips an entry that is not shaped like one", () => {
    const odd = { "src/x.ts": { imports: ["_shared.js"] } } as unknown;

    expect(filesFor(odd as BuildManifest, "src/x.ts")).toEqual([]);
  });
});

describe("readManifest", () => {
  it("reads the manifest, asking the browser to check it is current", async () => {
    const io = makeIo();

    await expect(readManifest(io)).resolves.toEqual(manifest);
    expect(io.fetch).toHaveBeenCalledWith(MANIFEST_ADDRESS, {
      cache: "no-cache",
    });
  });

  // The dev server, and any server with a fallback route, answers a file
  // that is not there with index.html.
  it("finds none when the answer is not JSON", async () => {
    const io: PrefetchIo = {
      fetch: () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new SyntaxError("Unexpected token <")),
        } as unknown as Response),
    };

    await expect(readManifest(io)).resolves.toBeNull();
  });

  it("finds none when the request fails or is refused", async () => {
    await expect(
      readManifest({ fetch: () => Promise.reject(new TypeError("offline")) }),
    ).resolves.toBeNull();
    await expect(
      readManifest({ fetch: () => Promise.resolve(response(null, false)) }),
    ).resolves.toBeNull();
  });

  it("finds none when the JSON is not an object", async () => {
    await expect(readManifest(makeIo([], "nope"))).resolves.toBeNull();
  });
});

describe("prefetchNextFeature", () => {
  const user: TestUser = { features: ["teaching", "passport"] };
  const chunks = [chunk("admin"), chunk("teaching"), chunk("passport")];

  it("fetches every file of the first feature the person can open", async () => {
    const io = makeIo();

    const outcome = await prefetchNextFeature(chunks, user, () => true, io);

    expect(outcome).toBe("fetched");
    expect(io.files().sort()).toEqual(
      filesFor(manifest, "src/teachingChunk.ts").sort(),
    );
  });

  it("asks at low priority, so it never competes with the page", async () => {
    const io = makeIo();

    await prefetchNextFeature(chunks, user, () => true, io);

    expect(io.fetch).toHaveBeenCalledWith("/assets/teachingChunk-aaaa1111.js", {
      priority: "low",
    });
  });

  it("never fetches a feature the person cannot open", async () => {
    const io = makeIo();

    const outcome = await prefetchNextFeature(
      [chunk("admin")],
      user,
      () => true,
      io,
    );

    expect(outcome).toBe("nothing-left");
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it("fetches one feature per call, in order, and each only once", async () => {
    const io = makeIo();

    expect(await prefetchNextFeature(chunks, user, () => true, io)).toBe(
      "fetched",
    );
    expect(io.files()).not.toContain("/assets/passportChunk-bbbb2222.js");
    expect(await prefetchNextFeature(chunks, user, () => true, io)).toBe(
      "fetched",
    );
    expect(await prefetchNextFeature(chunks, user, () => true, io)).toBe(
      "nothing-left",
    );

    expect(
      io.files().filter((file) => file.includes("passportChunk")),
    ).toHaveLength(1);
  });

  it("reads the manifest once, however many features there are", async () => {
    const io = makeIo();

    await prefetchNextFeature(chunks, user, () => true, io);
    await prefetchNextFeature(chunks, user, () => true, io);

    expect(
      io.fetch.mock.calls.filter(([address]) => address === MANIFEST_ADDRESS),
    ).toHaveLength(1);
  });

  // Guarantee one. The caller passes the conditions as they are at this
  // moment; on an exam route they say no, and nothing is fetched.
  it("starts nothing when now is not the moment, and can try again later", async () => {
    const io = makeIo();

    expect(await prefetchNextFeature(chunks, user, () => false, io)).toBe(
      "blocked",
    );
    expect(io.fetch).not.toHaveBeenCalled();

    expect(await prefetchNextFeature(chunks, user, () => true, io)).toBe(
      "fetched",
    );
  });

  // Reading the manifest takes a moment, and an exam can start in it.
  it("fetches no files if the moment has passed while the manifest was read", async () => {
    const io = makeIo();
    let asked = 0;
    const onlyTheFirstTime = (): boolean => (asked += 1) === 1;

    const outcome = await prefetchNextFeature(
      chunks,
      user,
      onlyTheFirstTime,
      io,
    );

    expect(outcome).toBe("blocked");
    expect(io.files()).toEqual([]);
    // Not counted as tried: it is fetched when the moment comes again.
    expect(await prefetchNextFeature(chunks, user, () => true, io)).toBe(
      "fetched",
    );
  });

  it("does nothing where there is no manifest, as in development", async () => {
    const io: PrefetchIo & { fetch: ReturnType<typeof vi.fn> } = {
      fetch: vi.fn(() => Promise.resolve(response(null, false))),
    };

    expect(await prefetchNextFeature(chunks, user, () => true, io)).toBe(
      "nothing-left",
    );
    expect(io.fetch).toHaveBeenCalledTimes(1);
  });

  it("swallows a file that fails, and does not try that feature again", async () => {
    const io = makeIo(["/assets/teachingChunk-aaaa1111.js"]);

    await expect(
      prefetchNextFeature(chunks, user, () => true, io),
    ).resolves.toBe("failed");
    await expect(
      prefetchNextFeature(chunks, user, () => true, io),
    ).resolves.toBe("fetched");

    expect(
      io.files().filter((file) => file.includes("teachingChunk-aaaa1111.js")),
    ).toHaveLength(1);
  });

  it("swallows a request that throws, as when the connection drops", async () => {
    const io: PrefetchIo = {
      fetch: (address) =>
        address === MANIFEST_ADDRESS
          ? Promise.resolve(response(manifest))
          : Promise.reject(new TypeError("Failed to fetch")),
    };

    await expect(
      prefetchNextFeature(chunks, user, () => true, io),
    ).resolves.toBe("failed");
  });

  it("counts a feature the manifest does not know as failed, and moves on", async () => {
    const io = makeIo();
    const both = [chunk("teaching"), chunk("passport")];
    const unknownFirst = [{ ...both[0]!, source: "src/gone.ts" }, both[1]!];

    expect(await prefetchNextFeature(unknownFirst, user, () => true, io)).toBe(
      "failed",
    );
    expect(await prefetchNextFeature(unknownFirst, user, () => true, io)).toBe(
      "fetched",
    );
  });
});

describe("whenIdle", () => {
  it("uses requestIdleCallback where the browser has it", () => {
    const callback = vi.fn();
    const win = {
      requestIdleCallback: vi.fn(() => 7),
      cancelIdleCallback: vi.fn(),
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
    };

    const cancel = whenIdle(callback, win);
    cancel();

    expect(win.requestIdleCallback).toHaveBeenCalledWith(callback, {
      timeout: 5000,
    });
    expect(win.cancelIdleCallback).toHaveBeenCalledWith(7);
    expect(win.setTimeout).not.toHaveBeenCalled();
  });

  it("falls back to a timer where it does not, as in Safari", () => {
    const callback = vi.fn();
    const win = { setTimeout: vi.fn(() => 3), clearTimeout: vi.fn() };

    const cancel = whenIdle(callback, win);
    cancel();

    expect(win.setTimeout).toHaveBeenCalledWith(callback, 2000);
    expect(win.clearTimeout).toHaveBeenCalledWith(3);
  });
});
