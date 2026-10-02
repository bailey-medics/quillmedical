/**
 * DocumentTable Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import DocumentTable from "./DocumentTable";
import { SAFETY_CASES } from "@lib/safety";

describe("DocumentTable", () => {
  it("lists every document with its version", () => {
    renderWithMantine(<DocumentTable documents={SAFETY_CASES[1].documents} />);
    expect(screen.getByText("Hazard log")).toBeInTheDocument();
    expect(screen.getByText("Clinical safety case report")).toBeInTheDocument();
    expect(screen.getAllByText("2.0").length).toBeGreaterThan(0);
  });

  it("badges approved and draft documents", () => {
    renderWithMantine(<DocumentTable documents={SAFETY_CASES[0].documents} />);
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
  });

  it("says so when the file is empty", () => {
    renderWithMantine(<DocumentTable documents={[]} />);
    expect(
      screen.getByText("No documents in this case file"),
    ).toBeInTheDocument();
  });

  it("reports the document chosen", async () => {
    const onSelect = vi.fn();
    renderWithMantine(
      <DocumentTable
        documents={SAFETY_CASES[0].documents}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByText("Hazard log"));
    expect(onSelect).toHaveBeenCalledWith(SAFETY_CASES[0].documents[1]);
  });
});
