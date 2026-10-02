/**
 * DocumentTable Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import DocumentTable from "./DocumentTable";
import { SAFETY_CASES } from "@lib/safety";

describe("DocumentTable", () => {
  it("lists every document with its version", () => {
    renderWithRouter(<DocumentTable documents={SAFETY_CASES[1].documents} />);
    expect(screen.getByText("Hazard log")).toBeInTheDocument();
    expect(screen.getByText("Clinical safety case report")).toBeInTheDocument();
    expect(screen.getAllByText("2.0").length).toBeGreaterThan(0);
  });

  it("badges approved and draft documents", () => {
    renderWithRouter(<DocumentTable documents={SAFETY_CASES[0].documents} />);
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
  });

  it("says so when the file is empty", () => {
    renderWithRouter(<DocumentTable documents={[]} />);
    expect(
      screen.getByText("No documents in this case file"),
    ).toBeInTheDocument();
  });

  it("reports the document chosen", async () => {
    const onSelect = vi.fn();
    renderWithRouter(
      <DocumentTable
        documents={SAFETY_CASES[0].documents}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByText("Hazard log"));
    expect(onSelect).toHaveBeenCalledWith(SAFETY_CASES[0].documents[1]);
  });

  it("shows the action given in the row above the table", () => {
    renderWithRouter(
      <DocumentTable
        documents={SAFETY_CASES[0].documents}
        action={<button type="button">Add document</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add document" }),
    ).toBeInTheDocument();
  });

  it("narrows the rows to a search", async () => {
    renderWithRouter(<DocumentTable documents={SAFETY_CASES[0].documents} />);
    await userEvent.click(screen.getByLabelText("Open search"));
    await userEvent.type(screen.getByLabelText("Search"), "hazard");
    expect(screen.getByText("Hazard log")).toBeInTheDocument();
    expect(
      screen.queryByText("Clinical safety case report"),
    ).not.toBeInTheDocument();
  });
});
