/**
 * SignOffDetail Component Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import SignOffDetail from "./SignOffDetail";
import { SAFETY_CASES } from "@lib/safety";

const safetyCase = SAFETY_CASES[0];
const href = (document: { id: string }) =>
  `/safety/sc-001/documentation/${document.id}`;

function render(sectionId: string) {
  const item = safetyCase.sign_off.find((s) => s.id === sectionId)!;
  return renderWithRouter(
    <SignOffDetail
      item={item}
      documents={safetyCase.documents.filter((d) =>
        item.reviews.includes(d.id),
      )}
      documentHref={href}
    />,
  );
}

describe("SignOffDetail", () => {
  it("shows a signed section with its signatory and date", () => {
    render("crmp");
    expect(screen.getByRole("heading", { name: "Signed" })).toBeInTheDocument();
    expect(screen.getByText("Dr Hannah Okafor")).toBeInTheDocument();
    expect(screen.getByText(/^Signed 14/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record signature" }),
    ).not.toBeInTheDocument();
  });

  it("offers a show-only Record signature button while awaiting", () => {
    render("approval");
    expect(
      screen.getByRole("heading", { name: "Awaiting signature" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record signature" }),
    ).toBeInTheDocument();
  });

  it("says what the signature attests and links the documents reviewed", () => {
    render("cscr");
    expect(
      screen.getByText(/as low as reasonably practicable/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Clinical safety case report" }),
    ).toHaveAttribute("href", "/safety/sc-001/documentation/cscr");
    expect(
      screen.getByRole("link", { name: "Hazard log" }),
    ).toBeInTheDocument();
  });
});
