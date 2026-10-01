/**
 * RequirePassport Tests
 *
 * The guard lets somebody in for either of two reasons: the passport
 * feature reaches them, or they hold a passport of their own. The second
 * is what keeps a holder's record within reach after they have been
 * removed from the one org_unit that had the passport.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import * as authContext from "./AuthContext";
import type { User } from "./AuthContext";
import { RequirePassport } from "./RequirePassport";

function mockAuth(user: Partial<User> | null, status = "authenticated") {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state:
      status === "authenticated"
        ? {
            status: "authenticated",
            user: {
              id: "1",
              username: "someone",
              email: "someone@example.com",
              ...user,
            } as User,
          }
        : ({ status } as never),
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  } as never);
}

function renderGuard() {
  return renderWithRouter(
    <RequirePassport fallback={<div>Hidden</div>}>
      <div>Passport pages</div>
    </RequirePassport>,
  );
}

describe("RequirePassport", () => {
  it("lets in somebody the passport feature reaches", () => {
    mockAuth({ enabled_features: ["passport"] });

    renderGuard();

    expect(screen.getByText("Passport pages")).toBeInTheDocument();
  });

  it("lets in a holder the feature does not reach", () => {
    mockAuth({ enabled_features: [], owns_passport: true });

    renderGuard();

    expect(screen.getByText("Passport pages")).toBeInTheDocument();
  });

  it("hides the pages from somebody with neither", () => {
    mockAuth({ enabled_features: ["teaching"], owns_passport: false });

    renderGuard();

    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.queryByText("Passport pages")).not.toBeInTheDocument();
  });

  it("hides the pages from somebody who is not signed in", () => {
    mockAuth(null, "unauthenticated");

    renderGuard();

    expect(screen.getByText("Hidden")).toBeInTheDocument();
  });

  it("waits while sign-in is still being worked out", () => {
    mockAuth(null, "loading");

    renderGuard();

    expect(screen.queryByText("Passport pages")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });
});
