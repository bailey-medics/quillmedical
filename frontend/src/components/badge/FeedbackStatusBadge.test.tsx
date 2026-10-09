/**
 * FeedbackStatus Badge Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import FeedbackStatusBadge from "./FeedbackStatusBadge";

describe("FeedbackStatusBadge", () => {
  it.each([
    ["new", "New"],
    ["acknowledged", "Acknowledged"],
    ["resolved", "Resolved"],
    ["wont_fix", "Won't fix"],
  ] as const)("renders %s as %s", (status, label) => {
    renderWithMantine(<FeedbackStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("never shows the stored value", () => {
    renderWithMantine(<FeedbackStatusBadge status="wont_fix" />);
    expect(screen.queryByText("wont_fix")).not.toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    const { container } = renderWithMantine(
      <FeedbackStatusBadge status="new" isLoading />,
    );
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(
      container.querySelector(".mantine-Skeleton-root"),
    ).toBeInTheDocument();
  });
});
