import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import TeachingMainNav from "./TeachingMainNav";

const defaultProps = {
  onSettings: () => {},
  onLogout: () => {},
};

describe("TeachingMainNav", () => {
  it("renders Teaching as active link", () => {
    renderWithRouter(<TeachingMainNav {...defaultProps} />);
    const link = screen.getByText("Teaching");
    expect(link).toBeTruthy();
    expect(link.closest("[data-active]")).toBeTruthy();
  });

  it("renders Settings and Logout links", () => {
    renderWithRouter(<TeachingMainNav {...defaultProps} />);
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Logout")).toBeTruthy();
  });

  it("calls onSettings when Settings is clicked", async () => {
    const user = userEvent.setup();
    const onSettings = vi.fn();
    renderWithRouter(
      <TeachingMainNav {...defaultProps} onSettings={onSettings} />,
    );
    await user.click(screen.getByText("Settings"));
    expect(onSettings).toHaveBeenCalledOnce();
  });

  it("calls onLogout when Logout is clicked", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderWithRouter(<TeachingMainNav {...defaultProps} onLogout={onLogout} />);
    await user.click(screen.getByText("Logout"));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("shows Admin link when onAdmin is provided", () => {
    renderWithRouter(<TeachingMainNav {...defaultProps} onAdmin={() => {}} />);
    expect(screen.getByText("Admin")).toBeTruthy();
  });

  it("hides Admin link when onAdmin is not provided", () => {
    renderWithRouter(<TeachingMainNav {...defaultProps} />);
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("calls onAdmin when Admin is clicked", async () => {
    const user = userEvent.setup();
    const onAdmin = vi.fn();
    renderWithRouter(<TeachingMainNav {...defaultProps} onAdmin={onAdmin} />);
    await user.click(screen.getByText("Admin"));
    expect(onAdmin).toHaveBeenCalledOnce();
  });
});
