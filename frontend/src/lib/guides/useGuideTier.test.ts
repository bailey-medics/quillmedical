/**
 * Which guides somebody is shown: their own tier and every tier below,
 * less the guides of a feature they do not have.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import type { Guide } from "@/guides/registry";
import { SCOPED_MANAGER_IDS } from "@/types/cbac";
import {
  guidesVisibleTo,
  guideTierOf,
  publicGuides,
  useGuideTier,
  useReadableGuide,
  useVisibleGuides,
} from "./useGuideTier";

function someone(user: Partial<User> = {}): User {
  return { id: "1", username: "someone", email: "s@example.com", ...user };
}

function guide(slug: string, extra: Partial<Guide> = {}): Guide {
  return {
    slug,
    title: slug,
    summary: "",
    audience: "everyone",
    public: false,
    ...extra,
  };
}

const SAMPLE: readonly Guide[] = [
  guide("for-delegates"),
  guide("for-admins", { audience: "admin" }),
  guide("for-operators", { audience: "superadmin" }),
  guide("teaching-only", { feature: "teaching" }),
];

function slugs(user: User): string[] {
  return guidesVisibleTo(user, SAMPLE).map((item) => item.slug);
}

function signInAs(user: User | null | "loading"): void {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state:
      user === "loading"
        ? { status: "loading", user: null }
        : user
          ? { status: "authenticated", user }
          : { status: "unauthenticated", user: null },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

describe("guideTierOf", () => {
  it("reads somebody with nothing as a delegate", () => {
    expect(guideTierOf(someone())).toBe("everyone");
  });

  it("reads a holder of manage_users as an admin", () => {
    expect(guideTierOf(someone({ competencies: ["manage_users"] }))).toBe(
      "admin",
    );
  });

  it.each(SCOPED_MANAGER_IDS)("reads a holder of %s as an admin", (id) => {
    expect(guideTierOf(someone({ competencies: [id] }))).toBe("admin");
  });

  it("does not read an unrelated competency as an admin", () => {
    expect(
      guideTierOf(someone({ competencies: ["take_teaching_modules"] })),
    ).toBe("everyone");
  });

  // The reason the ladder is the guides' own: an operator may hold no
  // competency at all, and still reads everything.
  it("reads an operator with no competencies as a superadmin", () => {
    expect(guideTierOf(someone({ platform_role: "superadmin" }))).toBe(
      "superadmin",
    );
  });

  it("does not read any other platform role as a superadmin", () => {
    expect(guideTierOf(someone({ platform_role: "standard" }))).toBe(
      "everyone",
    );
  });
});

describe("guidesVisibleTo", () => {
  it("shows a delegate the delegate guides only", () => {
    expect(slugs(someone())).toEqual(["for-delegates"]);
  });

  it("shows an admin their own guides and a delegate's", () => {
    expect(slugs(someone({ competencies: ["manage_users"] }))).toEqual([
      "for-delegates",
      "for-admins",
    ]);
  });

  it("shows an operator every tier, with no competency held", () => {
    expect(slugs(someone({ platform_role: "superadmin" }))).toEqual([
      "for-delegates",
      "for-admins",
      "for-operators",
    ]);
  });

  it("shows a feature's guide only where the feature is on", () => {
    expect(slugs(someone({ enabled_features: ["teaching"] }))).toEqual([
      "for-delegates",
      "teaching-only",
    ]);
    expect(slugs(someone({ enabled_features: ["passport"] }))).toEqual([
      "for-delegates",
    ]);
  });

  it("hides a feature's guide from an operator without the feature", () => {
    expect(slugs(someone({ platform_role: "superadmin" }))).not.toContain(
      "teaching-only",
    );
  });

  it("reads the real registry when given no list", () => {
    const all = guidesVisibleTo(
      someone({ platform_role: "superadmin", enabled_features: ["teaching"] }),
    );

    expect(all.map((item) => item.slug)).toContain("add-a-delegate-by-hand");
  });
});

describe("a guide that asks for a competency", () => {
  const ASSESSORS: readonly Guide[] = [
    guide("for-assessors", {
      feature: "passport",
      competency: "assess_clinician_passport",
    }),
  ];

  function shown(user: User): string[] {
    return guidesVisibleTo(user, ASSESSORS).map((item) => item.slug);
  }

  it("is shown to somebody who holds it", () => {
    expect(
      shown(
        someone({
          enabled_features: ["passport"],
          competencies: ["assess_clinician_passport"],
        }),
      ),
    ).toEqual(["for-assessors"]);
  });

  it("is hidden from somebody who does not", () => {
    expect(
      shown(
        someone({
          enabled_features: ["passport"],
          competencies: ["passport_write"],
        }),
      ),
    ).toEqual([]);
  });

  it("is hidden from an admin who does not hold it", () => {
    expect(
      shown(
        someone({
          enabled_features: ["passport"],
          competencies: ["manage_teaching"],
        }),
      ),
    ).toEqual([]);
  });

  it("is shown to an operator whatever they hold", () => {
    expect(
      shown(
        someone({
          platform_role: "superadmin",
          enabled_features: ["passport"],
        }),
      ),
    ).toEqual(["for-assessors"]);
  });

  it("still needs its feature, even for an operator", () => {
    expect(shown(someone({ platform_role: "superadmin" }))).toEqual([]);
  });
});

describe("the passport's guides", () => {
  const PASSPORT: readonly Guide[] = [guide("mine", { feature: "passport" })];

  // Reading and exporting your own passport come from owning it, never
  // from where you work, so its guides follow the holder too.
  it("reach a holder at an organisation without the passport", () => {
    expect(
      guidesVisibleTo(someone({ owns_passport: true }), PASSPORT),
    ).toHaveLength(1);
  });

  it("do not reach somebody with neither the feature nor a passport", () => {
    expect(guidesVisibleTo(someone(), PASSPORT)).toEqual([]);
  });

  it("owning a passport opens no other feature's guides", () => {
    const teaching = [guide("teach", { feature: "teaching" })];

    expect(guidesVisibleTo(someone({ owns_passport: true }), teaching)).toEqual(
      [],
    );
  });
});

describe("the hooks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("give the signed-in reader's tier and guides", () => {
    signInAs(
      someone({
        competencies: ["manage_teaching"],
        enabled_features: ["teaching"],
      }),
    );

    expect(renderHook(() => useGuideTier()).result.current).toBe("admin");
    expect(
      renderHook(() => useVisibleGuides()).result.current.map((g) => g.slug),
    ).toContain("add-a-delegate-by-hand");
  });

  it("give nothing to somebody who is not signed in", () => {
    signInAs(null);

    expect(renderHook(() => useGuideTier()).result.current).toBeNull();
    expect(renderHook(() => useVisibleGuides()).result.current).toEqual([]);
  });
});

describe("publicGuides", () => {
  it("gives only the guides marked public", () => {
    const sample = [guide("open", { public: true }), guide("closed")];

    expect(publicGuides(sample).map((item) => item.slug)).toEqual(["open"]);
  });

  // Nobody signed out has a feature, so a public guide is public whatever
  // feature it belongs to.
  it("does not ask for the guide's feature", () => {
    const sample = [guide("open", { public: true, feature: "teaching" })];

    expect(publicGuides(sample)).toHaveLength(1);
  });
});

describe("useReadableGuide", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function read(slug: string | undefined) {
    return renderHook(() => useReadableGuide(slug)).result.current?.slug;
  }

  it("gives somebody signed out a public guide and no other", () => {
    signInAs(null);

    expect(read("join-a-course")).toBe("join-a-course");
    expect(read("add-a-delegate-by-hand")).toBeUndefined();
  });

  it("gives somebody signed in the guides of their tier", () => {
    signInAs(
      someone({
        competencies: ["manage_teaching"],
        enabled_features: ["teaching"],
      }),
    );

    expect(read("add-a-delegate-by-hand")).toBe("add-a-delegate-by-hand");
    expect(read("join-a-course")).toBe("join-a-course");
  });

  // A delegate who is signed in has joined already. The guide is public
  // for the reader with no account, and an admin's once signed in.
  it("keeps the joining guide from a signed-in delegate", () => {
    signInAs(someone({ enabled_features: ["teaching"] }));

    expect(read("join-a-course")).toBeUndefined();
    expect(read("take-a-module-and-its-assessment")).toBe(
      "take-a-module-and-its-assessment",
    );
  });

  // Signed in, a public guide is one of theirs like any other, so it
  // still needs its feature: a clinical deployment shows no joining guide.
  it("holds a signed-in reader to the guide's feature, public or not", () => {
    signInAs(someone());

    expect(read("join-a-course")).toBeUndefined();
  });

  it("gives nothing while the session is being checked", () => {
    signInAs("loading");

    expect(read("join-a-course")).toBeUndefined();
  });

  it("gives nothing for an unknown slug or none", () => {
    signInAs(null);

    expect(read("no-such-guide")).toBeUndefined();
    expect(read(undefined)).toBeUndefined();
  });
});
