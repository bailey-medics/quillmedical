/**
 * PlaceholderTable Component Tests
 */

import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import PlaceholderTable from "./PlaceholderTable";
import { SAFETY_CASES } from "@lib/safety";

describe("PlaceholderTable", () => {
  it("shows each key, bare, with its value", () => {
    renderWithRouter(
      <PlaceholderTable placeholders={SAFETY_CASES[0].placeholders} />,
    );
    expect(screen.getByText("product_name")).toBeInTheDocument();
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
    expect(screen.getByText("MedScribe EPMA")).toBeInTheDocument();
  });

  it("lists the documents each is used in", () => {
    renderWithRouter(
      <PlaceholderTable placeholders={[SAFETY_CASES[0].placeholders[1]]} />,
    );
    expect(screen.getByText("Clinical safety case report")).toBeInTheDocument();
  });

  it("says so when there are none", () => {
    renderWithRouter(<PlaceholderTable placeholders={[]} />);
    expect(screen.getByText("No placeholders defined")).toBeInTheDocument();
  });

  it("shows the action given in the row above the table", () => {
    renderWithRouter(
      <PlaceholderTable
        placeholders={SAFETY_CASES[0].placeholders}
        action={<button type="button">Add placeholder</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add placeholder" }),
    ).toBeInTheDocument();
  });

  it("narrows the rows to a search", async () => {
    renderWithRouter(
      <PlaceholderTable placeholders={SAFETY_CASES[0].placeholders} />,
    );
    await userEvent.click(screen.getByLabelText("Open search"));
    await userEvent.type(screen.getByLabelText("Search"), "supplier");
    expect(screen.getByText("supplier_name")).toBeInTheDocument();
    expect(screen.queryByText("product_name")).not.toBeInTheDocument();
  });
});
