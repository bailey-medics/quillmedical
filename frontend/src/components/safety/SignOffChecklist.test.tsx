/**
 * SignOffChecklist Component Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine, renderWithRouter } from "@test/test-utils";
import SignOffChecklist from "./SignOffChecklist";
import { SAFETY_CASES } from "@lib/safety";

describe("SignOffChecklist", () => {
  it("lists every section with its signatory", () => {
    renderWithMantine(<SignOffChecklist items={SAFETY_CASES[0].sign_off} />);
    expect(
      screen.getByText("Clinical risk management plan"),
    ).toBeInTheDocument();
    expect(screen.getByText("Top management approval")).toBeInTheDocument();
    expect(screen.getByText("Dr Priya Nandakumar")).toBeInTheDocument();
  });

  it("says awaiting where nobody has signed", () => {
    renderWithMantine(<SignOffChecklist items={SAFETY_CASES[0].sign_off} />);
    expect(screen.getAllByText("Awaiting signature")).toHaveLength(2);
  });

  it("shows a date for every line once fully signed", () => {
    renderWithMantine(<SignOffChecklist items={SAFETY_CASES[1].sign_off} />);
    expect(screen.queryByText("Awaiting signature")).not.toBeInTheDocument();
    expect(screen.getAllByText(/^Signed/)).toHaveLength(
      SAFETY_CASES[1].sign_off.length,
    );
  });

  it("makes each card a link when told where its page is", () => {
    renderWithRouter(
      <SignOffChecklist
        items={SAFETY_CASES[0].sign_off}
        hrefFor={(item) => `/safety/sc-001/sign-off/${item.id}`}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Open Hazard log reviewed" }),
    ).toHaveAttribute("href", "/safety/sc-001/sign-off/hazard-log");
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("draws no links unless asked to", () => {
    renderWithMantine(<SignOffChecklist items={SAFETY_CASES[0].sign_off} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
