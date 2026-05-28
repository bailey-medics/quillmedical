/**
 * PageMessage Component Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import { PageMessageProvider, usePageMessage } from "./PageMessageContext";
import PageMessageDisplay from "./PageMessageDisplay";

const mockNavigate = vi.fn();
let mockLocation = {
  pathname: "/test",
  search: "",
  state: null as unknown,
};

vi.mock("react-router-dom", () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}));

function TestConsumer() {
  const { showMessage, messages, clearAll } = usePageMessage();
  return (
    <div>
      <button
        onClick={() =>
          showMessage({ variant: "success", title: "Test success" })
        }
      >
        Show success
      </button>
      <button
        onClick={() =>
          showMessage({
            variant: "error",
            title: "Test error",
            description: "Something went wrong",
          })
        }
      >
        Show error
      </button>
      <button onClick={clearAll}>Clear all</button>
      <span data-testid="message-count">{messages.length}</span>
    </div>
  );
}

function renderWithProvider(ui?: React.ReactNode) {
  return renderWithMantine(
    <PageMessageProvider>
      <PageMessageDisplay />
      <TestConsumer />
      {ui}
    </PageMessageProvider>,
  );
}

describe("PageMessage", () => {
  beforeEach(() => {
    mockLocation = {
      pathname: "/test",
      search: "",
      state: null,
    };
    mockNavigate.mockClear();
  });

  describe("PageMessageDisplay", () => {
    it("renders nothing when no messages exist", () => {
      renderWithProvider();
      expect(screen.queryByTestId("form-status")).not.toBeInTheDocument();
    });

    it("renders a success message when showMessage is called", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show success"));

      expect(screen.getByText("Test success")).toBeInTheDocument();
      expect(screen.getByTestId("form-status")).toHaveAttribute(
        "role",
        "status",
      );
    });

    it("renders an error message with description", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show error"));

      expect(screen.getByText("Test error")).toBeInTheDocument();
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.getByTestId("form-status")).toHaveAttribute(
        "role",
        "alert",
      );
    });

    it("renders multiple messages in FIFO order", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show success"));
      await user.click(screen.getByText("Show error"));

      const statuses = screen.getAllByTestId("form-status");
      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toHaveAttribute("role", "status");
      expect(statuses[1]).toHaveAttribute("role", "alert");
    });
  });

  describe("Dismissal", () => {
    it("removes a single message when dismissed", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show success"));
      await user.click(screen.getByText("Show error"));

      expect(screen.getAllByTestId("form-status")).toHaveLength(2);

      const dismissButtons = screen.getAllByLabelText("Dismiss");
      await user.click(dismissButtons[0]);

      expect(screen.getAllByTestId("form-status")).toHaveLength(1);
      expect(screen.getByText("Test error")).toBeInTheDocument();
    });

    it("clears all messages when clearAll is called", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show success"));
      await user.click(screen.getByText("Show error"));
      await user.click(screen.getByText("Clear all"));

      expect(screen.queryByTestId("form-status")).not.toBeInTheDocument();
    });
  });

  describe("Flash state ingestion", () => {
    it("ingests flash from location state and renders it", () => {
      mockLocation = {
        pathname: "/test",
        search: "",
        state: { flash: { title: "Organisation created" } },
      };
      renderWithProvider();

      expect(screen.getByText("Organisation created")).toBeInTheDocument();
    });

    it("defaults to success variant when flash has no variant", () => {
      mockLocation = {
        pathname: "/test",
        search: "",
        state: { flash: { title: "Done" } },
      };
      renderWithProvider();

      expect(screen.getByTestId("form-status")).toHaveAttribute(
        "role",
        "status",
      );
    });

    it("uses specified variant from flash state", () => {
      mockLocation = {
        pathname: "/test",
        search: "",
        state: { flash: { variant: "error", title: "Failed" } },
      };
      renderWithProvider();

      expect(screen.getByTestId("form-status")).toHaveAttribute(
        "role",
        "alert",
      );
    });

    it("clears flash from history state after ingestion", async () => {
      mockLocation = {
        pathname: "/test",
        search: "",
        state: { flash: { title: "Done" } },
      };
      renderWithProvider();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/test", {
          replace: true,
          state: {},
        });
      });
    });

    it("does not call navigate when no flash is present", () => {
      mockLocation = {
        pathname: "/test",
        search: "",
        state: null,
      };
      renderWithProvider();

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("usePageMessage hook", () => {
    it("throws when used outside provider", () => {
      // Suppress console.error for expected error
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderWithMantine(<TestConsumer />);
      }).toThrow("usePageMessage must be used within PageMessageProvider");

      consoleSpy.mockRestore();
    });
  });
});
