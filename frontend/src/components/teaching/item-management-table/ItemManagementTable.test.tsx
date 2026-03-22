import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { ItemManagementTable } from "./ItemManagementTable";
import type { QuestionBankItem } from "@/features/teaching/types";

const items: QuestionBankItem[] = [
  {
    id: 1,
    question_bank_id: "polyp-bank",
    bank_version: 1,
    images: [{ key: "a" }, { key: "b" }],
    text: null,
    options: null,
    correct_option_id: null,
    metadata_json: { diagnosis: "adenoma" },
    status: "published",
    created_at: "2024-12-01T10:00:00Z",
  },
  {
    id: 2,
    question_bank_id: "polyp-bank",
    bank_version: 1,
    images: [{ key: "c" }],
    text: null,
    options: null,
    correct_option_id: null,
    metadata_json: { diagnosis: "serrated" },
    status: "draft",
    created_at: "2024-12-02T10:00:00Z",
  },
];

describe("ItemManagementTable", () => {
  it("shows empty message when no items", () => {
    renderWithMantine(<ItemManagementTable items={[]} />);
    expect(screen.getByText("No items synced yet.")).toBeInTheDocument();
  });

  it("renders item rows", () => {
    renderWithMantine(<ItemManagementTable items={items} />);
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("shows image count", () => {
    renderWithMantine(<ItemManagementTable items={items} />);
    // Item 1 has 2 images, item 2 has 1
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("calls onTogglePublish when switch toggled", async () => {
    const handleToggle = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <ItemManagementTable items={items} onTogglePublish={handleToggle} />,
    );

    const switches = screen.getAllByRole("switch");
    await user.click(switches[1]); // Toggle draft item
    expect(handleToggle).toHaveBeenCalledWith(2, true);
  });
});
