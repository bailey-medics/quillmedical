/**
 * SafetyStatusBadge Component Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import SafetyStatusBadge from "./SafetyStatusBadge";

describe("SafetyStatusBadge", () => {
  it.each([
    ["draft", "Draft"],
    ["in_review", "In review"],
    ["signed_off", "Signed off"],
  ] as const)("renders %s as %s", (status, label) => {
    renderWithMantine(<SafetyStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows one label only", () => {
    renderWithMantine(<SafetyStatusBadge status="draft" />);
    expect(screen.queryByText("In review")).not.toBeInTheDocument();
    expect(screen.queryByText("Signed off")).not.toBeInTheDocument();
  });
});
