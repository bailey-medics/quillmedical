import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import FilterSelect from "./FilterSelect";

const options = [
  {
    group: "Trust",
    items: [
      { value: "trust:leeds", label: "Leeds Teaching Hospitals" },
      { value: "trust:bradford", label: "Bradford Teaching Hospitals" },
    ],
  },
];

describe("FilterSelect", () => {
  it("renders a filter button", () => {
    renderWithMantine(
      <FilterSelect
        data={options}
        value={[]}
        onChange={() => {}}
        aria-label="Filter"
      />,
    );
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
  });

  it("does not show indicator when no filters active", () => {
    const { container } = renderWithMantine(
      <FilterSelect
        data={options}
        value={[]}
        onChange={() => {}}
        aria-label="Filter"
      />,
    );
    expect(container.querySelector("[data-indicator]")).not.toBeInTheDocument();
  });

  it("shows indicator count when filters are active", () => {
    renderWithMantine(
      <FilterSelect
        data={options}
        value={["trust:leeds"]}
        onChange={() => {}}
        aria-label="Filter"
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("opens popover with multiselect on click", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <FilterSelect
        data={options}
        value={[]}
        onChange={() => {}}
        label="Filter delegates"
        aria-label="Filter"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByText("Filter delegates")).toBeInTheDocument();
  });

  it("displays custom label inside popover", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <FilterSelect
        data={options}
        value={[]}
        onChange={() => {}}
        label="Narrow results"
        aria-label="Filter"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByText("Narrow results")).toBeInTheDocument();
  });
});
