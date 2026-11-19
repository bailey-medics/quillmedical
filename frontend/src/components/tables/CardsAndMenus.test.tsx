/**
 * Cards on a phone keep what the table offers, and the row menu only
 * offers what is there.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import DataTable, { type Column } from "./DataTable";
import EllipsisMenu from "@/components/ellipsis-menu/EllipsisMenu";

const media = vi.hoisted(() => ({ isMobile: true }));

vi.mock("@mantine/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/hooks")>();
  return { ...actual, useMediaQuery: () => media.isMobile };
});

beforeEach(() => {
  media.isMobile = true;
});

interface Person {
  id: number;
  name: string;
}

const people: Person[] = [
  { id: 1, name: "Bea" },
  { id: 2, name: "Cal" },
  { id: 3, name: "Ann" },
];

const sortableColumns: Column<Person>[] = [
  { header: "Name", render: (p) => p.name, accessor: (p) => p.name },
];

function namesInOrder(): string[] {
  return screen
    .getAllByText(/^(Ann|Bea|Cal)$/)
    .map((element) => element.textContent ?? "");
}

describe("Sorting cards", () => {
  it("offers a sort picker when the table becomes cards", () => {
    renderWithMantine(
      <DataTable
        data={people}
        columns={sortableColumns}
        getRowKey={(p) => p.id}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue(
      "Default order",
    );
  });

  it("reorders the cards when a sort is chosen", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <DataTable
        data={people}
        columns={sortableColumns}
        getRowKey={(p) => p.id}
      />,
    );

    expect(namesInOrder()).toEqual(["Bea", "Cal", "Ann"]);

    await user.click(screen.getByRole("combobox", { name: "Sort by" }));
    await user.click(
      await screen.findByRole("option", { name: "Name, descending" }),
    );

    expect(namesInOrder()).toEqual(["Cal", "Bea", "Ann"]);
  });

  it("offers no picker when nothing can be sorted", () => {
    renderWithMantine(
      <DataTable
        data={people}
        columns={[{ header: "Name", render: (p) => p.name }]}
        getRowKey={(p) => p.id}
      />,
    );

    expect(screen.queryByRole("combobox", { name: "Sort by" })).toBeNull();
  });
});

describe("EllipsisMenu", () => {
  it("draws nothing when it has no items", () => {
    renderWithMantine(<EllipsisMenu aria-label="Actions" items={[]} />);

    expect(screen.queryByRole("button", { name: "Actions" })).toBeNull();
  });
});
