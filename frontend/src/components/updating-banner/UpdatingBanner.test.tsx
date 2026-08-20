import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import UpdatingBanner from "./UpdatingBanner";

describe("UpdatingBanner Component", () => {
  it("renders the updating message", () => {
    renderWithMantine(<UpdatingBanner />);
    expect(
      screen.getByText("Updating to the latest version…"),
    ).toBeInTheDocument();
  });

  it("renders a full-screen alertdialog", () => {
    renderWithMantine(<UpdatingBanner />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("has aria-live assertive", () => {
    renderWithMantine(<UpdatingBanner />);
    expect(screen.getByRole("alertdialog")).toHaveAttribute(
      "aria-live",
      "assertive",
    );
  });

  describe("Non-dismissible", () => {
    it("renders no button or dismiss/close control", () => {
      renderWithMantine(<UpdatingBanner />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
