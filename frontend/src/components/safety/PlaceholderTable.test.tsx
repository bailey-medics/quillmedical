/**
 * PlaceholderTable Component Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import PlaceholderTable from "./PlaceholderTable";
import { SAFETY_CASES } from "@lib/safety";

describe("PlaceholderTable", () => {
  it("shows each key as a template placeholder with its value", () => {
    renderWithMantine(
      <PlaceholderTable placeholders={SAFETY_CASES[0].placeholders} />,
    );
    expect(screen.getByText("{{ product_name }}")).toBeInTheDocument();
    expect(screen.getByText("MedScribe EPMA")).toBeInTheDocument();
  });

  it("lists the documents each is used in", () => {
    renderWithMantine(
      <PlaceholderTable placeholders={[SAFETY_CASES[0].placeholders[1]]} />,
    );
    expect(screen.getByText("Clinical safety case report")).toBeInTheDocument();
  });

  it("says so when there are none", () => {
    renderWithMantine(<PlaceholderTable placeholders={[]} />);
    expect(screen.getByText("No placeholders defined")).toBeInTheDocument();
  });
});
