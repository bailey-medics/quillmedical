/**
 * How a table's rows open, what it announces and how it pages. These are
 * the gaps a review of the shared tables found: rows a keyboard could
 * not open, controls that opened their row as well, rows past the first
 * page that could not be reached, and a result count read out over an
 * error.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import DataTable, { type Column } from "./DataTable";
import DataTableWithResults from "./DataTableWithResults";
import DataCard from "./DataCard";
import SearchField from "@/components/search/SearchFields";

const media = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@mantine/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/hooks")>();
  return { ...actual, useMediaQuery: () => media.isMobile };
});

beforeEach(() => {
  media.isMobile = false;
});

interface Person {
  id: number;
  name: string;
  age: number;
}

const people: Person[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  name: `Person ${i + 1}`,
  age: 20 + i,
}));

const columns: Column<Person>[] = [
  { header: "Name", render: (p) => p.name, accessor: (p) => p.name },
  {
    header: "Actions",
    render: (p) => <button type="button">Edit {p.name}</button>,
  },
];

describe("Opening a row", () => {
  it("opens a row from the keyboard through its first cell", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderWithMantine(
      <DataTable
        data={people.slice(0, 1)}
        columns={columns}
        getRowKey={(p) => p.id}
        onRowClick={onRowClick}
      />,
    );

    screen.getByRole("button", { name: "Person 1" }).focus();
    await user.keyboard("{Enter}");

    expect(onRowClick).toHaveBeenCalledOnce();
    expect(onRowClick).toHaveBeenCalledWith(people[0]);
  });

  it("still opens a row on a click anywhere along it", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderWithMantine(
      <DataTable
        data={people.slice(0, 1)}
        columns={[...columns, { header: "Age", render: (p) => p.age }]}
        getRowKey={(p) => p.id}
        onRowClick={onRowClick}
      />,
    );

    await user.click(screen.getByText("20"));

    expect(onRowClick).toHaveBeenCalledOnce();
  });

  it("does not open the row when a control inside it is pressed", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderWithMantine(
      <DataTable
        data={people.slice(0, 1)}
        columns={columns}
        getRowKey={(p) => p.id}
        onRowClick={onRowClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit Person 1" }));

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("gives a read-only table no button in its first cell", () => {
    renderWithMantine(
      <DataTable
        data={people.slice(0, 1)}
        columns={columns.slice(0, 1)}
        getRowKey={(p) => p.id}
      />,
    );

    expect(screen.queryByRole("button", { name: "Person 1" })).toBeNull();
  });

  it("gives a read-only card no pointer and nothing to press", () => {
    const { container } = renderWithMantine(
      <DataCard row={people[0]} columns={columns.slice(0, 1)} />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("[class*='clickable']")).toBeNull();
  });

  it("opens a card from the keyboard through its first field", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithMantine(
      <DataCard row={people[0]} columns={columns} onClick={onClick} />,
    );

    screen.getByRole("button", { name: "Person 1" }).focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Edit Person 1" }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Sorting", () => {
  it("says which way a sorted column runs", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <DataTable data={people} columns={columns} getRowKey={(p) => p.id} />,
    );

    const header = screen.getByRole("columnheader", { name: /Name/ });
    expect(header).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: "Sort by Name" }));
    expect(header).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: "Sort by Name" }));
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("leaves a column that cannot be sorted without aria-sort", () => {
    renderWithMantine(
      <DataTable data={people} columns={columns} getRowKey={(p) => p.id} />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Actions" }),
    ).not.toHaveAttribute("aria-sort");
  });
});

describe("Paging", () => {
  it("lets every row be reached with a page size under 10", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <DataTable
        data={people}
        columns={columns.slice(0, 1)}
        getRowKey={(p) => p.id}
        pageSize={5}
      />,
    );

    expect(screen.queryByText("Person 6")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText("Person 8")).toBeInTheDocument();
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "falls back to 10 rows a page when given a page size of %s",
    (size) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      renderWithMantine(
        <DataTable
          data={people}
          columns={columns.slice(0, 1)}
          getRowKey={(p) => p.id}
          pageSize={size}
        />,
      );

      expect(screen.getByText("Person 8")).toBeInTheDocument();
      warn.mockRestore();
    },
  );

  it("names the page-size picker with the size in use", () => {
    renderWithMantine(
      <DataTable
        data={[...people, ...people.map((p) => ({ ...p, id: p.id + 8 }))]}
        columns={columns.slice(0, 1)}
        getRowKey={(p) => p.id}
        pageSize={10}
        fullControls
      />,
    );

    expect(
      screen.getByRole("button", { name: "Items per page: 10" }),
    ).toBeInTheDocument();
  });
});

describe("Announcements", () => {
  it("reads out the error, not a result count, when loading failed", () => {
    renderWithMantine(
      <DataTable
        data={[]}
        columns={columns}
        getRowKey={(p) => p.id}
        error="The server is down"
        statusMessage="0 results"
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Error loading data: The server is down");
    expect(status).not.toHaveTextContent("0 results");
  });
});

describe("Sub-rows", () => {
  it("draws a sub-row of 0 inside its own cell, not as a stray 0", () => {
    renderWithMantine(
      <DataTableWithResults
        data={people.slice(0, 1)}
        columns={columns.slice(0, 1)}
        getRowKey={(p) => p.id}
        getSubRow={() => 0}
      />,
    );

    const cells = screen.getAllByRole("cell");
    const zeroCell = cells.find((cell) => cell.textContent === "0");
    expect(zeroCell).toBeDefined();
    expect(within(zeroCell!).getByText("0")).toBeInTheDocument();
  });
});

describe("SearchField", () => {
  it("shows what is typed when it is listened to but not controlled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithMantine(<SearchField onChange={onChange} />);

    await user.click(screen.getByRole("button"));
    await user.type(screen.getByRole("textbox"), "smith");

    expect(screen.getByRole("textbox")).toHaveValue("smith");
    expect(onChange).toHaveBeenLastCalledWith("smith");
  });
});
