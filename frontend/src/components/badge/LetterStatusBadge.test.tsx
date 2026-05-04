/**
 * LetterStatus Badge Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import LetterStatusBadge from "./LetterStatusBadge";

describe("LetterStatusBadge", () => {
  it("renders final status", () => {
    renderWithMantine(<LetterStatusBadge status="final" />);
    expect(screen.getByText("Final")).toBeInTheDocument();
  });

  it("renders draft status", () => {
    renderWithMantine(<LetterStatusBadge status="draft" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("renders amended status", () => {
    renderWithMantine(<LetterStatusBadge status="amended" />);
    expect(screen.getByText("Amended")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    const { container } = renderWithMantine(
      <LetterStatusBadge status="final" isLoading />,
    );
    expect(screen.queryByText("Final")).not.toBeInTheDocument();
    expect(
      container.querySelector(".mantine-Skeleton-root"),
    ).toBeInTheDocument();
  });
});
