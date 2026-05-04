/**
 * EllipsisMenu Component Tests
 *
 * Tests for the EllipsisMenu dropdown action menu.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { IconTrash, IconPencil } from "@/components/icons/appIcons";
import EllipsisMenu from "./EllipsisMenu";

describe("EllipsisMenu", () => {
  it("renders the trigger button with aria-label", () => {
    renderWithMantine(
      <EllipsisMenu
        aria-label="Actions"
        items={[{ label: "Edit", onClick: vi.fn() }]}
      />,
    );

    expect(screen.getByRole("button", { name: "Actions" })).toBeInTheDocument();
  });

  it("shows menu items when clicked", async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <EllipsisMenu
        aria-label="Actions"
        items={[
          { label: "Edit", onClick: vi.fn() },
          { label: "Delete", color: "red", onClick: vi.fn() },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onClick when a menu item is clicked", async () => {
    const user = userEvent.setup();
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();

    renderWithMantine(
      <EllipsisMenu
        aria-label="Actions"
        items={[
          { label: "Edit", onClick: handleEdit },
          { label: "Delete", color: "red", onClick: handleDelete },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByText("Delete"));

    expect(handleDelete).toHaveBeenCalledOnce();
    expect(handleEdit).not.toHaveBeenCalled();
  });

  it("renders menu items with icons", async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <EllipsisMenu
        aria-label="Actions"
        items={[
          { label: "Edit", icon: <IconPencil />, onClick: vi.fn() },
          {
            label: "Delete",
            icon: <IconTrash />,
            color: "red",
            onClick: vi.fn(),
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("renders a single menu item", async () => {
    const user = userEvent.setup();
    const handleRemove = vi.fn();

    renderWithMantine(
      <EllipsisMenu
        aria-label="Staff actions"
        items={[
          {
            label: "Remove from organisation",
            color: "red",
            onClick: handleRemove,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Staff actions" }));
    await user.click(screen.getByText("Remove from organisation"));

    expect(handleRemove).toHaveBeenCalledOnce();
  });
});
