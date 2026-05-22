import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import DataTableControlled from "./DataTableControlled";
import type { Column } from "./DataTable";

interface Item {
  id: number;
  name: string;
  category: string;
}

const items: Item[] = [
  { id: 1, name: "Alpha", category: "Group A" },
  { id: 2, name: "Beta", category: "Group B" },
  { id: 3, name: "Gamma", category: "Group A" },
];

const columns: Column<Item>[] = [
  { header: "Name", render: (r) => r.name },
  { header: "Category", render: (r) => r.category },
];

describe("DataTableControlled", () => {
  it("renders all rows initially", () => {
    renderWithRouter(
      <DataTableControlled
        data={items}
        columns={columns}
        getRowKey={(r) => r.id}
        searchFields={(r) => [r.name, r.category]}
        filterPredicate={() => () => true}
      />,
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("filters rows by search query", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <DataTableControlled
        data={items}
        columns={columns}
        getRowKey={(r) => r.id}
        searchFields={(r) => [r.name, r.category]}
        filterPredicate={() => () => true}
      />,
    );

    // Open search
    await user.click(screen.getByLabelText("Open search"));
    // Type in search
    await user.type(screen.getByLabelText("Search"), "Alpha");

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamma")).not.toBeInTheDocument();
  });

  it("shows empty message when no results match", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <DataTableControlled
        data={items}
        columns={columns}
        getRowKey={(r) => r.id}
        emptyMessage="No items found"
        searchFields={(r) => [r.name, r.category]}
        filterPredicate={() => () => true}
      />,
    );

    await user.click(screen.getByLabelText("Open search"));
    await user.type(screen.getByLabelText("Search"), "zzz");

    expect(screen.getByText("No items found")).toBeInTheDocument();
  });

  it("renders search and filter buttons", () => {
    renderWithRouter(
      <DataTableControlled
        data={items}
        columns={columns}
        getRowKey={(r) => r.id}
        searchFields={(r) => [r.name, r.category]}
        filterPredicate={() => () => true}
      />,
    );

    expect(screen.getByLabelText("Open search")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter")).toBeInTheDocument();
  });

  it("renders filter button when filterData is provided", () => {
    const filterData = [
      {
        group: "Category",
        items: [{ value: "a", label: "Group A" }],
      },
    ];

    renderWithRouter(
      <DataTableControlled
        data={items}
        columns={columns}
        getRowKey={(r) => r.id}
        filterData={filterData}
        searchFields={(r) => [r.name, r.category]}
        filterPredicate={() => () => true}
      />,
    );

    expect(screen.getByLabelText("Filter")).toBeInTheDocument();
  });
});
