/**
 * AdminTable Component Tests
 *
 * Tests for the AdminTable component covering:
 * - Rendering with data
 * - Column rendering with custom render functions
 * - Row click interactions
 * - Loading, error, and empty states
 * - Type safety with different data structures
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { Text, Badge } from "@mantine/core";
import AdminTable, { type Column } from "./AdminTable";

interface TestUser {
  id: number;
  name: string;
  email: string;
}

interface TestPatient {
  id: string;
  name: string;
  status: "active" | "inactive";
}

describe("AdminTable", () => {
  describe("Rendering with data", () => {
    it("renders table with headers and data rows", () => {
      const users: TestUser[] = [
        { id: 1, name: "Alice", email: "alice@example.com" },
        { id: 2, name: "Bob", email: "bob@example.com" },
      ];

      const columns: Column<TestUser>[] = [
        { header: "Name", render: (user) => user.name },
        { header: "Email", render: (user) => user.email },
      ];

      renderWithMantine(
        <AdminTable
          data={users}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(user) => user.id}
        />,
      );

      // Check headers
      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Email")).toBeInTheDocument();

      // Check data
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    });

    it("renders custom components in cells", () => {
      const patients: TestPatient[] = [
        { id: "p1", name: "John Doe", status: "active" },
        { id: "p2", name: "Jane Smith", status: "inactive" },
      ];

      const columns: Column<TestPatient>[] = [
        {
          header: "Name",
          render: (patient) => <Text fw={500}>{patient.name}</Text>,
        },
        {
          header: "Status",
          render: (patient) => (
            <Badge color={patient.status === "active" ? "green" : "red"}>
              {patient.status}
            </Badge>
          ),
        },
      ];

      renderWithMantine(
        <AdminTable
          data={patients}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(patient) => patient.id}
        />,
      );

      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("active")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
      expect(screen.getByText("inactive")).toBeInTheDocument();
    });
  });

  describe("Row interactions", () => {
    it("calls onRowClick with row data when row is clicked", async () => {
      const user = userEvent.setup();
      const users: TestUser[] = [
        { id: 1, name: "Alice", email: "alice@example.com" },
      ];

      const columns: Column<TestUser>[] = [
        { header: "Name", render: (u) => u.name },
      ];

      const handleRowClick = vi.fn();

      renderWithMantine(
        <AdminTable
          data={users}
          columns={columns}
          onRowClick={handleRowClick}
          getRowKey={(u) => u.id}
        />,
      );

      const row = screen.getByText("Alice").closest("tr");
      await user.click(row!);

      expect(handleRowClick).toHaveBeenCalledWith(users[0]);
      expect(handleRowClick).toHaveBeenCalledTimes(1);
    });

    it("applies pointer cursor to rows", () => {
      const users: TestUser[] = [
        { id: 1, name: "Alice", email: "alice@example.com" },
      ];

      const columns: Column<TestUser>[] = [
        { header: "Name", render: (u) => u.name },
      ];

      renderWithMantine(
        <AdminTable
          data={users}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(u) => u.id}
        />,
      );

      const row = screen.getByText("Alice").closest("tr");
      expect(row).toHaveStyle({ cursor: "pointer" });
    });
  });

  describe("Loading state", () => {
    it("shows skeleton loaders when loading", () => {
      const columns: Column<TestUser>[] = [
        { header: "Name", render: (u) => u.name },
      ];

      const { container } = renderWithMantine(
        <AdminTable
          data={[]}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(u) => u.id}
          loading
        />,
      );

      // Check for skeleton elements (Mantine Skeleton renders a div)
      const skeletons = container.querySelectorAll("[data-skeleton]");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("does not show table when loading", () => {
      const users: TestUser[] = [
        { id: 1, name: "Alice", email: "alice@example.com" },
      ];

      const columns: Column<TestUser>[] = [
        { header: "Name", render: (u) => u.name },
      ];

      renderWithMantine(
        <AdminTable
          data={users}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(u) => u.id}
          loading
        />,
      );

      expect(screen.queryByText("Name")).not.toBeInTheDocument();
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });
  });

  describe("Error state", () => {
    it("shows error alert when error is provided", () => {
      const columns: Column<TestUser>[] = [
        { header: "Name", render: (u) => u.name },
      ];

      renderWithMantine(
        <AdminTable
          data={[]}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(u) => u.id}
          error="Failed to load data"
        />,
      );

      expect(screen.getByText("Error loading data")).toBeInTheDocument();
      expect(screen.getByText("Failed to load data")).toBeInTheDocument();
    });

    it("does not show table when error is present", () => {
      const users: TestUser[] = [
        { id: 1, name: "Alice", email: "alice@example.com" },
      ];

      const columns: Column<TestUser>[] = [
        { header: "Name", render: (u) => u.name },
      ];

      renderWithMantine(
        <AdminTable
          data={users}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(u) => u.id}
          error="Error occurred"
        />,
      );

      expect(screen.queryByText("Name")).not.toBeInTheDocument();
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("shows default empty message when no data", () => {
      const columns: Column<TestUser>[] = [
        { header: "Name", render: (u) => u.name },
      ];

      renderWithMantine(
        <AdminTable
          data={[]}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(u) => u.id}
        />,
      );

      expect(screen.getByText("No data found")).toBeInTheDocument();
    });

    it("shows custom empty message when provided", () => {
      const columns: Column<TestUser>[] = [
        { header: "Name", render: (u) => u.name },
      ];

      renderWithMantine(
        <AdminTable
          data={[]}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(u) => u.id}
          emptyMessage="No users found"
        />,
      );

      expect(screen.getByText("No users found")).toBeInTheDocument();
    });
  });

  describe("Column configuration", () => {
    it("applies custom column alignment", () => {
      const users: TestUser[] = [
        { id: 1, name: "Alice", email: "alice@example.com" },
      ];

      const columns: Column<TestUser>[] = [
        { header: "Name", render: (u) => u.name, align: "left" },
        { header: "Email", render: (u) => u.email, align: "right" },
      ];

      renderWithMantine(
        <AdminTable
          data={users}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(u) => u.id}
        />,
      );

      const headers = screen.getAllByRole("columnheader");
      expect(headers[0]).toHaveStyle({ textAlign: "left" });
      expect(headers[1]).toHaveStyle({ textAlign: "right" });
    });

    it("applies custom column width", () => {
      const users: TestUser[] = [
        { id: 1, name: "Alice", email: "alice@example.com" },
      ];

      const columns: Column<TestUser>[] = [
        { header: "Name", render: (u) => u.name, width: "200px" },
        { header: "Email", render: (u) => u.email },
      ];

      renderWithMantine(
        <AdminTable
          data={users}
          columns={columns}
          onRowClick={vi.fn()}
          getRowKey={(u) => u.id}
        />,
      );

      const headers = screen.getAllByRole("columnheader");
      expect(headers[0]).toHaveStyle({ width: "200px" });
    });
  });
});
