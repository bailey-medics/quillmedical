/**
 * Tests for CBAC permission hooks.
 */

import { describe, expect, it, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import { screen } from "@testing-library/react";

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

import {
  useHasCompetency,
  useHasAnyCompetency,
  useHasAllCompetencies,
} from "./hooks";
import type { CompetencyId } from "@/types/cbac";

/** Helper component to display single competency check */
function SingleCheck({ competency }: { competency: CompetencyId }) {
  const has = useHasCompetency(competency);
  return <div data-testid="result">{has ? "yes" : "no"}</div>;
}

/** Helper component to display any-competency check */
function AnyCheck({ competencies }: { competencies: CompetencyId[] }) {
  const has = useHasAnyCompetency(...competencies);
  return <div data-testid="result">{has ? "yes" : "no"}</div>;
}

/** Helper component to display all-competencies check */
function AllCheck({ competencies }: { competencies: CompetencyId[] }) {
  const has = useHasAllCompetencies(...competencies);
  return <div data-testid="result">{has ? "yes" : "no"}</div>;
}

const authenticatedUser = {
  id: "1",
  username: "testuser",
  email: "test@example.com",
  competencies: ["manage_teaching_content", "prescribe_non_controlled"],
};

describe("useHasCompetency", () => {
  it("returns false when unauthenticated", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "unauthenticated", user: null },
    });
    renderWithMantine(<SingleCheck competency="manage_teaching_content" />);
    expect(screen.getByTestId("result").textContent).toBe("no");
  });

  it("returns false when loading", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "loading", user: null },
    });
    renderWithMantine(<SingleCheck competency="manage_teaching_content" />);
    expect(screen.getByTestId("result").textContent).toBe("no");
  });

  it("returns true when user has the competency", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "authenticated", user: authenticatedUser },
    });
    renderWithMantine(<SingleCheck competency="manage_teaching_content" />);
    expect(screen.getByTestId("result").textContent).toBe("yes");
  });

  it("returns false when user lacks the competency", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "authenticated", user: authenticatedUser },
    });
    renderWithMantine(
      <SingleCheck competency="prescribe_controlled_schedule_2" />,
    );
    expect(screen.getByTestId("result").textContent).toBe("no");
  });

  it("returns false when competencies is undefined", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: { ...authenticatedUser, competencies: undefined },
      },
    });
    renderWithMantine(<SingleCheck competency="manage_teaching_content" />);
    expect(screen.getByTestId("result").textContent).toBe("no");
  });
});

describe("useHasAnyCompetency", () => {
  it("returns true when user has one of the competencies", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "authenticated", user: authenticatedUser },
    });
    renderWithMantine(
      <AnyCheck
        competencies={[
          "manage_teaching_content",
          "prescribe_controlled_schedule_2",
        ]}
      />,
    );
    expect(screen.getByTestId("result").textContent).toBe("yes");
  });

  it("returns false when user has none of the competencies", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "authenticated", user: authenticatedUser },
    });
    renderWithMantine(
      <AnyCheck
        competencies={[
          "prescribe_controlled_schedule_2",
          "prescribe_controlled_schedule_3_4_5",
        ]}
      />,
    );
    expect(screen.getByTestId("result").textContent).toBe("no");
  });

  it("returns false when unauthenticated", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "unauthenticated", user: null },
    });
    renderWithMantine(<AnyCheck competencies={["manage_teaching_content"]} />);
    expect(screen.getByTestId("result").textContent).toBe("no");
  });
});

describe("useHasAllCompetencies", () => {
  it("returns true when user has all competencies", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "authenticated", user: authenticatedUser },
    });
    renderWithMantine(
      <AllCheck
        competencies={["manage_teaching_content", "prescribe_non_controlled"]}
      />,
    );
    expect(screen.getByTestId("result").textContent).toBe("yes");
  });

  it("returns false when user lacks one competency", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "authenticated", user: authenticatedUser },
    });
    renderWithMantine(
      <AllCheck
        competencies={[
          "manage_teaching_content",
          "prescribe_controlled_schedule_2",
        ]}
      />,
    );
    expect(screen.getByTestId("result").textContent).toBe("no");
  });

  it("returns false when unauthenticated", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "unauthenticated", user: null },
    });
    renderWithMantine(
      <AllCheck
        competencies={["manage_teaching_content", "prescribe_non_controlled"]}
      />,
    );
    expect(screen.getByTestId("result").textContent).toBe("no");
  });
});
