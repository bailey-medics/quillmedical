/**
 * FeedbackModal Component Tests
 *
 * Covers what the sender sees: the form, the required message, sending,
 * the confirmation, a failed send, and closing.
 */

import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, renderWithRouter } from "@test/test-utils";
import FeedbackModal from "./FeedbackModal";

function renderModal(
  props: Partial<React.ComponentProps<typeof FeedbackModal>> = {},
) {
  const onClose = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue({ id: 1 });
  renderWithMantine(
    <FeedbackModal opened onClose={onClose} onSubmit={onSubmit} {...props} />,
  );
  return { onClose, onSubmit, ...props };
}

const messageBox = () => screen.getByRole("textbox", { name: /message/i });

describe("FeedbackModal", () => {
  describe("Rendering", () => {
    it("shows the title, the prompt and the patient-data warning", () => {
      renderModal();

      expect(
        screen.getByRole("dialog", { name: "Send feedback" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Tell us what went wrong, or what would make this better.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Do not include patient details."),
      ).toBeInTheDocument();
    });

    it("renders nothing when closed", () => {
      renderModal({ opened: false });

      expect(
        screen.queryByRole("dialog", { name: "Send feedback" }),
      ).not.toBeInTheDocument();
    });

    it("offers the category as an optional combobox", () => {
      renderModal();

      const category = screen.getByRole("combobox", {
        name: /what is it about/i,
      });
      expect(category).not.toBeRequired();
    });

    it("lists the four categories", async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(
        screen.getByRole("combobox", { name: /what is it about/i }),
      );

      for (const label of [
        "Something is broken",
        "Something is wrong or inaccurate",
        "Suggestion",
        "Something else",
      ]) {
        expect(
          await screen.findByRole("option", { name: label }),
        ).toBeInTheDocument();
      }
    });

    it("focuses the message when it opens", async () => {
      renderModal();

      await waitFor(() => expect(messageBox()).toHaveFocus());
    });
  });

  describe("Requiring a message", () => {
    it("disables sending until a message is typed", async () => {
      const user = userEvent.setup();
      renderModal();

      const send = screen.getByTestId("submit-button");
      expect(send).toHaveAttribute("aria-disabled", "true");

      await user.type(messageBox(), "Captions lag");

      await waitFor(() => expect(send).not.toHaveAttribute("aria-disabled"));
    });

    it("does not send a message of only spaces", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderModal();

      await user.type(messageBox(), "   ");
      await user.click(screen.getByTestId("submit-button"));

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("Sending", () => {
    it("sends the message and the chosen category", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderModal();

      await user.click(
        screen.getByRole("combobox", { name: /what is it about/i }),
      );
      await user.click(
        await screen.findByRole("option", { name: "Suggestion" }),
      );
      await user.type(messageBox(), "Add a dark theme");
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          category: "suggestion",
          message: "Add a dark theme",
        }),
      );
    });

    it("sends no category when none is chosen", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderModal();

      await user.type(messageBox(), "Captions lag");
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          category: null,
          message: "Captions lag",
        }),
      );
    });

    it("shows a confirmation in place of the form once sent", async () => {
      const user = userEvent.setup();
      renderModal();

      await user.type(messageBox(), "Captions lag");
      await user.click(screen.getByTestId("submit-button"));

      expect(await screen.findByText("Feedback sent")).toBeInTheDocument();
      expect(screen.getByText("Thank you for telling us.")).toBeInTheDocument();
      expect(
        screen.queryByRole("textbox", { name: /message/i }),
      ).not.toBeInTheDocument();
    });

    it("closes from the confirmation", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.type(messageBox(), "Captions lag");
      await user.click(screen.getByTestId("submit-button"));
      await user.click(await screen.findByRole("button", { name: "Close" }));

      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe("A failed send", () => {
    it("says it was not sent and keeps the message", async () => {
      const user = userEvent.setup();
      renderModal({ onSubmit: vi.fn().mockRejectedValue(new Error("500")) });

      await user.type(messageBox(), "Captions lag");
      await user.click(screen.getByTestId("submit-button"));

      expect(
        await screen.findByText("Your feedback was not sent"),
      ).toBeInTheDocument();
      expect(messageBox()).toHaveValue("Captions lag");
      expect(screen.queryByText("Feedback sent")).not.toBeInTheDocument();
    });
  });

  describe("Closing", () => {
    it("calls onClose from Cancel", async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe("Your feedback", () => {
    function renderInRouter() {
      const onClose = vi.fn();
      renderWithRouter(
        <FeedbackModal
          opened
          onClose={onClose}
          onSubmit={vi.fn().mockResolvedValue({ id: 1 })}
        />,
      );
      return { onClose };
    }

    it("links to previous feedback under the form", () => {
      renderInRouter();

      expect(
        screen.getByRole("link", { name: "Your previous feedback" }),
      ).toHaveAttribute("href", "/feedback");
    });

    it("closes the modal when that link is followed", async () => {
      const user = userEvent.setup();
      const { onClose } = renderInRouter();

      await user.click(
        screen.getByRole("link", { name: "Your previous feedback" }),
      );

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("says where the outcome will appear once sent", async () => {
      const user = userEvent.setup();
      const { onClose } = renderInRouter();

      await user.type(messageBox(), "Captions lag");
      await user.click(screen.getByTestId("submit-button"));

      const link = await screen.findByRole("link", { name: "Your feedback" });
      expect(link).toHaveAttribute("href", "/feedback");
      await user.click(link);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("offers no link when asked not to", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <FeedbackModal
          opened
          onClose={vi.fn()}
          onSubmit={vi.fn().mockResolvedValue({ id: 1 })}
          showYourFeedbackLinks={false}
        />,
      );

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      await user.type(messageBox(), "Captions lag");
      await user.click(screen.getByTestId("submit-button"));
      await screen.findByText("Feedback sent");
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("offers no link outside a router", () => {
      renderModal();

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
});
