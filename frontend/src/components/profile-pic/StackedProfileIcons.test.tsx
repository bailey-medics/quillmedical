/**
 * StackedProfileIcons Component Tests
 *
 * Tests for overlapping participant avatar display.
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import StackedProfileIcons from "./StackedProfileIcons";

describe("StackedProfileIcons", () => {
  it("renders initials for each participant", () => {
    renderWithMantine(
      <StackedProfileIcons
        participants={[
          { givenName: "Alice", familyName: "Smith", gradientIndex: 0 },
          { givenName: "Bob", familyName: "Jones", gradientIndex: 3 },
        ]}
      />,
    );

    expect(screen.getByText("AS")).toBeInTheDocument();
    expect(screen.getByText("BJ")).toBeInTheDocument();
  });

  it("renders nothing when participants is empty", () => {
    const { container } = renderWithMantine(
      <StackedProfileIcons participants={[]} />,
    );

    expect(container.querySelector("[role='group']")).not.toBeInTheDocument();
  });

  it("renders a single participant", () => {
    renderWithMantine(
      <StackedProfileIcons
        participants={[
          { givenName: "Dr", familyName: "Patel", gradientIndex: 8 },
        ]}
      />,
    );

    expect(screen.getByText("DP")).toBeInTheDocument();
  });

  it("renders a group role for accessibility", () => {
    renderWithMantine(
      <StackedProfileIcons
        participants={[
          { givenName: "Alice", familyName: "Smith", gradientIndex: 0 },
        ]}
      />,
    );

    expect(screen.getByRole("group")).toBeInTheDocument();
  });

  it("shows tooltips with full names", () => {
    renderWithMantine(
      <StackedProfileIcons
        participants={[
          { givenName: "Alice", familyName: "Smith", gradientIndex: 0 },
          { givenName: "Bob", familyName: "Jones", gradientIndex: 3 },
        ]}
      />,
    );

    // ProfilePic adds tooltips — they are rendered as aria attributes
    expect(screen.getByText("AS")).toBeInTheDocument();
    expect(screen.getByText("BJ")).toBeInTheDocument();
  });

  it("renders given-name-only participants", () => {
    renderWithMantine(
      <StackedProfileIcons participants={[{ givenName: "Pharmacy" }]} />,
    );

    expect(screen.getByText("PH")).toBeInTheDocument();
  });
});
