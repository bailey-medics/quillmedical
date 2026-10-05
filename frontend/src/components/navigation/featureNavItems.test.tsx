/**
 * The Guides entry of the shared navigation list. The other entries are
 * covered where they are rendered, in `SideNavContent.test.tsx` and
 * `navCoverage.test.tsx`.
 */

import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import { useFeatureNavItems } from "./featureNavItems";

function signInAs(user: Partial<User>): void {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: {
      status: "authenticated",
      user: { id: "1", username: "someone", email: "s@example.com", ...user },
    },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

function itemsAt(address: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[address]}>{children}</MemoryRouter>
  );
  return renderHook(() => useFeatureNavItems(), { wrapper }).result.current;
}

const teachingAdmin: Partial<User> = {
  competencies: ["manage_teaching"],
  enabled_features: ["teaching"],
};

describe("the Guides entry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is offered to somebody with a guide to read", () => {
    signInAs(teachingAdmin);

    const guides = itemsAt("/settings").find((item) => item.label === "Guides");

    expect(guides).toMatchObject({ href: "/guides", icon: "book" });
    expect(guides?.children).toBeUndefined();
  });

  it("is not offered to somebody with none", () => {
    signInAs({ competencies: ["manage_teaching"] });

    expect(itemsAt("/settings").map((item) => item.label)).not.toContain(
      "Guides",
    );
  });

  it("hangs the open guide beneath it, by its title", () => {
    signInAs(teachingAdmin);

    const guides = itemsAt("/guides/add-a-delegate-by-hand").find(
      (item) => item.label === "Guides",
    );

    expect(guides?.children).toEqual([
      {
        label: "Add a delegate by hand",
        href: "/guides/add-a-delegate-by-hand",
      },
    ]);
  });

  it("sits before Settings, so Settings and Admin stay last", () => {
    signInAs(teachingAdmin);

    const labels = itemsAt("/settings").map((item) => item.label);

    expect(labels.slice(-3)).toEqual(["Guides", "Settings", "Admin"]);
  });
});
