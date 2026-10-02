/**
 * OfficerList Component Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import OfficerList from "./OfficerList";
import { SAFETY_CASES } from "@lib/safety";

describe("OfficerList", () => {
  it("names each officer with their role and email", () => {
    renderWithMantine(<OfficerList officers={SAFETY_CASES[0].officers} />);
    expect(screen.getByText("Clinical safety officer")).toBeInTheDocument();
    expect(screen.getByText("Dr Hannah Okafor")).toBeInTheDocument();
    expect(screen.getByText("hannah.okafor@example.org")).toBeInTheDocument();
  });

  it("renders one card per officer", () => {
    renderWithMantine(<OfficerList officers={SAFETY_CASES[0].officers} />);
    expect(screen.getAllByText(/@example\.org$/)).toHaveLength(
      SAFETY_CASES[0].officers.length,
    );
  });

  it("renders nothing for an empty list", () => {
    const { container } = renderWithMantine(<OfficerList officers={[]} />);
    expect(container.querySelectorAll(".mantine-Card-root")).toHaveLength(0);
  });
});
