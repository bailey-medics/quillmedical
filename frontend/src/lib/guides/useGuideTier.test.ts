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
  useGuideTier,
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
    audience: "delegate",
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
    expect(guideTierOf(someone())).toBe("delegate");
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
    ).toBe("delegate");
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
      "delegate",
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
