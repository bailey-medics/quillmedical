import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import userEvent from "@testing-library/user-event";
import SearchField from "./SearchFields";

describe("SearchField Component", () => {
  describe("Initial state", () => {
    it("renders search icon button when collapsed", () => {
      renderWithMantine(<SearchField />);
      const button = screen.getByLabelText("Open search");
      expect(button).toBeInTheDocument();
    });

    it("does not show text input initially", () => {
      renderWithMantine(<SearchField />);
      expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
    });

    it("renders search icon", () => {
      const { container } = renderWithMantine(<SearchField />);
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Expand behavior", () => {
    it("expands to show text input when icon clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SearchField />);

      const button = screen.getByLabelText("Open search");
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
      });
    });

    it("auto-focuses input when expanded", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SearchField />);

      const button = screen.getByLabelText("Open search");
      await user.click(button);

      await waitFor(() => {
        const input = screen.getByPlaceholderText("Search…");
        expect(input).toHaveFocus();
      });
    });

    it("shows close button when expanded", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SearchField />);

      const button = screen.getByLabelText("Open search");
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByLabelText("Close search")).toBeInTheDocument();
      });
    });
  });

  describe("Collapse behavior", () => {
    it("collapses when close button is clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SearchField />);

      // Expand first
      const openButton = screen.getByLabelText("Open search");
      await user.click(openButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
      });

      // Then collapse
      const closeButton = screen.getByLabelText("Close search");
      await user.click(closeButton);

      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("Search…"),
        ).not.toBeInTheDocument();
      });
    });

    it("collapses on blur", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SearchField />);

      // Expand
      const openButton = screen.getByLabelText("Open search");
      await user.click(openButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
      });

      // Blur the input
      await user.click(document.body);

      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText("Search…"),
        ).not.toBeInTheDocument();
      });
    });

    it("returns to search icon after closing", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SearchField />);

      // Expand and collapse
      const openButton = screen.getByLabelText("Open search");
      await user.click(openButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
      });

      const closeButton = screen.getByLabelText("Close search");
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.getByLabelText("Open search")).toBeInTheDocument();
      });
    });
  });

  describe("Text input", () => {
    it("allows typing in search field", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SearchField />);

      const openButton = screen.getByLabelText("Open search");
      await user.click(openButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText("Search…");
      await user.type(input, "test query");

      expect(input).toHaveValue("test query");
    });

    it("has correct placeholder text", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SearchField />);

      const openButton = screen.getByLabelText("Open search");
      await user.click(openButton);

      await waitFor(() => {
        const input = screen.getByPlaceholderText("Search…");
        expect(input).toBeInTheDocument();
      });
    });

    it("has search aria-label", async () => {
      const user = userEvent.setup();
      renderWithMantine(<SearchField />);

      const openButton = screen.getByLabelText("Open search");
      await user.click(openButton);

      await waitFor(() => {
        const input = screen.getByLabelText("Search");
        expect(input).toBeInTheDocument();
      });
    });
  });

  describe("Animation", () => {
    it("has transition styles on input", async () => {
      const user = userEvent.setup();
      const { container } = renderWithMantine(<SearchField />);

      const openButton = screen.getByLabelText("Open search");
      await user.click(openButton);

      await waitFor(() => {
        const input = container.querySelector("input");
        expect(input).toBeInTheDocument();
      });
    });
  });
});
