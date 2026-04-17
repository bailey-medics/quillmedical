/**
 * LetterStatus Badge Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import LetterStatus from "./LetterStatus";

describe("LetterStatus", () => {
  it("renders final status", () => {
    renderWithMantine(<LetterStatus status="final" />);
    expect(screen.getByText("Final")).toBeInTheDocument();
  });

  it("renders draft status", () => {
    renderWithMantine(<LetterStatus status="draft" />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("renders amended status", () => {
    renderWithMantine(<LetterStatus status="amended" />);
    expect(screen.getByText("Amended")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    const { container } = renderWithMantine(
      <LetterStatus status="final" isLoading />,
    );
    expect(screen.queryByText("Final")).not.toBeInTheDocument();
    expect(
      container.querySelector(".mantine-Skeleton-root"),
    ).toBeInTheDocument();
  });
});
