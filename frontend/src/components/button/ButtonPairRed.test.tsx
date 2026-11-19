/**
 * ButtonPairRed Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import ButtonPairRed from "./ButtonPairRed";

describe("ButtonPairRed", () => {
  const defaultProps = {
    onAccept: vi.fn(),
    onCancel: vi.fn(),
  };

  describe("Rendering", () => {
    it("renders with default labels", () => {
      renderWithMantine(<ButtonPairRed {...defaultProps} />);
      expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("renders custom accept label", () => {
      renderWithMantine(
        <ButtonPairRed {...defaultProps} acceptLabel="Leave page" />,
      );
      expect(
        screen.getByRole("button", { name: "Leave page" }),
      ).toBeInTheDocument();
    });

    it("renders custom cancel label", () => {
      renderWithMantine(
        <ButtonPairRed {...defaultProps} cancelLabel="Stay on page" />,
      );
      expect(
        screen.getByRole("button", { name: "Stay on page" }),
      ).toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("calls onAccept when accept button is clicked", async () => {
      const user = userEvent.setup();
      const onAccept = vi.fn();
      renderWithMantine(
        <ButtonPairRed {...defaultProps} onAccept={onAccept} />,
      );

      await user.click(screen.getByRole("button", { name: "OK" }));
      expect(onAccept).toHaveBeenCalledOnce();
    });

    it("calls onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      renderWithMantine(
        <ButtonPairRed {...defaultProps} onCancel={onCancel} />,
      );

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });

  describe("Disabled states", () => {
    it("marks accept button as aria-disabled when acceptDisabled is true", () => {
      renderWithMantine(<ButtonPairRed {...defaultProps} acceptDisabled />);
      expect(screen.getByRole("button", { name: "OK" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });

    it("prevents click when acceptDisabled is true", async () => {
      const user = userEvent.setup();
      const onAccept = vi.fn();
      renderWithMantine(
        <ButtonPairRed {...defaultProps} onAccept={onAccept} acceptDisabled />,
      );

      await user.click(screen.getByRole("button", { name: "OK" }));
      expect(onAccept).not.toHaveBeenCalled();
    });
  });

  describe("Loading state", () => {
    it("shows loading spinner when acceptLoading is true", () => {
      renderWithMantine(<ButtonPairRed {...defaultProps} acceptLoading />);
      const acceptButton = screen.getByRole("button", { name: "OK" });
      expect(
        acceptButton.querySelector(".mantine-Loader-root"),
      ).toBeInTheDocument();
    });

    it("shows submittingLabel when acceptLoading is true", () => {
      renderWithMantine(
        <ButtonPairRed
          {...defaultProps}
          acceptLabel="Delete"
          submittingLabel="Deleting…"
          acceptLoading
        />,
      );
      expect(screen.getByText("Deleting…")).toBeInTheDocument();
    });

    it("falls back to acceptLabel when submittingLabel is not provided", () => {
      renderWithMantine(
        <ButtonPairRed {...defaultProps} acceptLabel="Remove" acceptLoading />,
      );
      expect(screen.getByText("Remove")).toBeInTheDocument();
    });

    it("blocks accepting while loading, even without acceptDisabled", async () => {
      const user = userEvent.setup();
      const onAccept = vi.fn();
      renderWithMantine(
        <ButtonPairRed {...defaultProps} onAccept={onAccept} acceptLoading />,
      );

      const accept = screen.getByRole("button", { name: "OK" });
      await user.click(accept);
      accept.focus();
      await user.keyboard("{Enter}");

      expect(onAccept).not.toHaveBeenCalled();
      expect(accept).toHaveAttribute("aria-disabled", "true");
      expect(accept).toHaveAttribute("aria-busy", "true");
    });
  });

  describe("Cancel", () => {
    it("marks cancel as aria-disabled and ignores a click when cancelDisabled", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      renderWithMantine(
        <ButtonPairRed {...defaultProps} onCancel={onCancel} cancelDisabled />,
      );

      const cancel = screen.getByRole("button", { name: "Cancel" });
      await user.click(cancel);

      expect(cancel).toHaveAttribute("aria-disabled", "true");
      expect(onCancel).not.toHaveBeenCalled();
    });
  });
});
