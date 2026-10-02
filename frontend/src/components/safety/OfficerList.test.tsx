/**
 * OfficerList Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
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

  it("draws no edit icon unless asked to", () => {
    renderWithMantine(<OfficerList officers={SAFETY_CASES[0].officers} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reports the officer whose edit icon is pressed", async () => {
    const onEdit = vi.fn();
    renderWithMantine(
      <OfficerList officers={SAFETY_CASES[0].officers} onEdit={onEdit} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Edit product owner" }),
    );
    expect(onEdit).toHaveBeenCalledWith(SAFETY_CASES[0].officers[2]);
  });
});
