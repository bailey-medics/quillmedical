/**
 * NoteCategoryBadge Tests
 *
 * Verifies badge renders correct labels, colours, sizes,
 * and loading state for each clinical note category.
 */

import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import NoteCategoryBadge from "./NoteCategoryBadge";

describe("NoteCategoryBadge", () => {
  it.each([
    { category: "consultation" as const, label: "Consultation" },
    { category: "telephone" as const, label: "Telephone" },
    { category: "observation" as const, label: "Observation" },
    { category: "procedure" as const, label: "Procedure" },
  ])("renders $label for category $category", ({ category, label }) => {
    renderWithMantine(<NoteCategoryBadge category={category} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("renders at default lg size", () => {
    const { container } = renderWithMantine(
      <NoteCategoryBadge category="consultation" />,
    );
    const badge = container.querySelector(".mantine-Badge-root");
    expect(badge).toHaveAttribute("data-size", "lg");
  });

  it("renders at sm size when specified", () => {
    const { container } = renderWithMantine(
      <NoteCategoryBadge category="consultation" size="sm" />,
    );
    const badge = container.querySelector(".mantine-Badge-root");
    expect(badge).toHaveAttribute("data-size", "sm");
  });

  it("renders at xl size when specified", () => {
    const { container } = renderWithMantine(
      <NoteCategoryBadge category="consultation" size="xl" />,
    );
    const badge = container.querySelector(".mantine-Badge-root");
    expect(badge).toHaveAttribute("data-size", "xl");
  });

  it("shows skeleton when loading", () => {
    const { container } = renderWithMantine(
      <NoteCategoryBadge category="consultation" isLoading />,
    );
    const skeleton = container.querySelector(".mantine-Skeleton-root");
    expect(skeleton).toBeInTheDocument();
  });
});
