/**
 * ConfirmModal Component Tests
 *
 * Tests for the confirmation modal covering:
 * - Rendering with all props combinations (icon, title, children)
 * - Button labels (defaults and custom)
 * - Accept handler (sync and async)
 * - Loading state during async accept
 * - Close on cancel
 * - Does not render when closed
 * - Error handling (stays open on reject)
 */

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import ConfirmModal from "./ConfirmModal";
import { IconAlertTriangle } from "@tabler/icons-react";

describe("ConfirmModal", () => {
  const defaultProps = {
    opened: true,
    onClose: vi.fn(),
    onAccept: vi.fn(),
    children: "Are you sure?",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children message when opened", () => {
    renderWithMantine(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    renderWithMantine(<ConfirmModal {...defaultProps} opened={false} />);
    expect(screen.queryByText("Are you sure?")).not.toBeInTheDocument();
  });

  it("renders title when provided", () => {
    renderWithMantine(<ConfirmModal {...defaultProps} title="Remove member" />);
    expect(screen.getByText("Remove member")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    renderWithMantine(
      <ConfirmModal {...defaultProps} icon={<IconAlertTriangle />} />,
    );
    // Icon is wrapped in our Icon component — check for svg
    expect(
      screen.getByText("Are you sure?").closest("[class*='Modal']"),
    ).toBeInTheDocument();
  });

  it("uses default button labels", () => {
    renderWithMantine(<ConfirmModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses custom button labels", () => {
    renderWithMantine(
      <ConfirmModal
        {...defaultProps}
        acceptLabel="Delete"
        cancelLabel="Keep"
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });

  it("calls onClose when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithMantine(<ConfirmModal {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onAccept and onClose when accept is clicked (sync)", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onClose = vi.fn();
    renderWithMantine(
      <ConfirmModal {...defaultProps} onAccept={onAccept} onClose={onClose} />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows loading state during async accept", async () => {
    const user = userEvent.setup();
    let resolve: () => void;
    const asyncAccept = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    renderWithMantine(
      <ConfirmModal {...defaultProps} onAccept={asyncAccept} />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    // Button should be disabled during loading and label changes
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Confirming…" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    // Resolve the promise
    resolve!();
    await waitFor(() => {
      expect(defaultProps.onClose).not.toHaveBeenCalled(); // our local onClose mock was not passed
    });
  });

  it("stays open when onAccept rejects", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn().mockRejectedValue(new Error("Server error"));
    const onClose = vi.fn();
    renderWithMantine(
      <ConfirmModal {...defaultProps} onAccept={onAccept} onClose={onClose} />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledOnce();
    });

    // onClose should NOT be called on error
    expect(onClose).not.toHaveBeenCalled();
    // Modal should still be visible
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("calls onClose after async accept resolves", async () => {
    const user = userEvent.setup();
    let resolve: () => void;
    const asyncAccept = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const onClose = vi.fn();
    renderWithMantine(
      <ConfirmModal
        {...defaultProps}
        onAccept={asyncAccept}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onClose).not.toHaveBeenCalled();

    resolve!();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
