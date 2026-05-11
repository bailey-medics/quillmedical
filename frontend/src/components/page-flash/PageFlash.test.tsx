/**
 * PageFlash Component Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import PageFlash from "./PageFlash";

const mockNavigate = vi.fn();
let mockLocationState: unknown = {};

vi.mock("react-router-dom", () => ({
  useLocation: () => ({
    pathname: "/test",
    search: "",
    state: mockLocationState,
  }),
  useNavigate: () => mockNavigate,
}));

describe("PageFlash", () => {
  beforeEach(() => {
    mockLocationState = {};
    mockNavigate.mockClear();
  });

  describe("Rendering", () => {
    it("renders nothing when no flash state is present", () => {
      mockLocationState = {};
      renderWithMantine(<PageFlash />);
      expect(screen.queryByTestId("form-status")).not.toBeInTheDocument();
    });

    it("renders nothing when location state is null", () => {
      mockLocationState = null;
      renderWithMantine(<PageFlash />);
      expect(screen.queryByTestId("form-status")).not.toBeInTheDocument();
    });

    it("renders success status card with title", () => {
      mockLocationState = { flash: { title: "Letter sent" } };
      renderWithMantine(<PageFlash />);
      expect(screen.getByTestId("form-status")).toBeInTheDocument();
      expect(screen.getByText("Letter sent")).toBeInTheDocument();
    });

    it("renders status card with description", () => {
      mockLocationState = {
        flash: {
          title: "Letter sent",
          description: "Discharge letter has been sent to Dr Jones.",
        },
      };
      renderWithMantine(<PageFlash />);
      expect(screen.getByText("Letter sent")).toBeInTheDocument();
      expect(
        screen.getByText("Discharge letter has been sent to Dr Jones."),
      ).toBeInTheDocument();
    });

    it("defaults to success variant", () => {
      mockLocationState = { flash: { title: "Saved" } };
      renderWithMantine(<PageFlash />);
      expect(screen.getByTestId("form-status")).toHaveAttribute(
        "role",
        "status",
      );
    });

    it("renders error variant with role=alert", () => {
      mockLocationState = { flash: { variant: "error", title: "Failed" } };
      renderWithMantine(<PageFlash />);
      expect(screen.getByTestId("form-status")).toHaveAttribute(
        "role",
        "alert",
      );
    });

    it("renders partial_success variant with role=status", () => {
      mockLocationState = {
        flash: { variant: "partial_success", title: "Partially saved" },
      };
      renderWithMantine(<PageFlash />);
      expect(screen.getByTestId("form-status")).toHaveAttribute(
        "role",
        "status",
      );
    });
  });

  describe("Dismissal", () => {
    it("removes flash when dismiss button is clicked", async () => {
      const user = userEvent.setup();
      mockLocationState = { flash: { title: "Letter sent" } };
      renderWithMantine(<PageFlash />);

      expect(screen.getByTestId("form-status")).toBeInTheDocument();

      await user.click(screen.getByLabelText("Dismiss"));

      expect(screen.queryByTestId("form-status")).not.toBeInTheDocument();
    });
  });

  describe("State clearing", () => {
    it("clears flash from history state after render", async () => {
      mockLocationState = { flash: { title: "Done" } };
      renderWithMantine(<PageFlash />);

      expect(screen.getByText("Done")).toBeInTheDocument();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/test", {
          replace: true,
          state: {},
        });
      });
    });

    it("does not call navigate when no flash is present", () => {
      mockLocationState = {};
      renderWithMantine(<PageFlash />);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
