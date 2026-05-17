import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import DashboardNav from "./DashboardNav";

const modules = [
  { id: "bank-a", title: "Bank A" },
  { id: "bank-b", title: "Bank B" },
];

const defaultProps = {
  onModule: () => {},
  onSettings: () => {},
  onLogout: () => {},
};

describe("DashboardNav", () => {
  it("renders module titles", () => {
    renderWithRouter(<DashboardNav modules={modules} {...defaultProps} />);
    expect(screen.getByText("Bank A")).toBeTruthy();
    expect(screen.getByText("Bank B")).toBeTruthy();
  });

  it("renders Modules heading", () => {
    renderWithRouter(<DashboardNav modules={modules} {...defaultProps} />);
    expect(screen.getByText("Modules")).toBeTruthy();
  });

  it("renders Settings and Logout links", () => {
    renderWithRouter(<DashboardNav modules={modules} {...defaultProps} />);
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Logout")).toBeTruthy();
  });

  it("calls onModule when a module is clicked", async () => {
    const user = userEvent.setup();
    const onModule = vi.fn();
    renderWithRouter(
      <DashboardNav modules={modules} {...defaultProps} onModule={onModule} />,
    );
    await user.click(screen.getByText("Bank A"));
    expect(onModule).toHaveBeenCalledWith("bank-a");
  });

  it("calls onSettings when Settings is clicked", async () => {
    const user = userEvent.setup();
    const onSettings = vi.fn();
    renderWithRouter(
      <DashboardNav
        modules={modules}
        {...defaultProps}
        onSettings={onSettings}
      />,
    );
    await user.click(screen.getByText("Settings"));
    expect(onSettings).toHaveBeenCalledOnce();
  });

  it("calls onLogout when Logout is clicked", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderWithRouter(
      <DashboardNav modules={modules} {...defaultProps} onLogout={onLogout} />,
    );
    await user.click(screen.getByText("Logout"));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("renders empty state with no modules", () => {
    renderWithRouter(<DashboardNav modules={[]} {...defaultProps} />);
    expect(screen.getByText("Modules")).toBeTruthy();
  });

  it("shows Admin link when onAdmin is provided", () => {
    renderWithRouter(
      <DashboardNav modules={modules} {...defaultProps} onAdmin={() => {}} />,
    );
    expect(screen.getByText("Admin")).toBeTruthy();
  });

  it("hides Admin link when onAdmin is not provided", () => {
    renderWithRouter(<DashboardNav modules={modules} {...defaultProps} />);
    expect(screen.queryByText("Admin")).toBeNull();
  });

  it("calls onAdmin when Admin is clicked", async () => {
    const user = userEvent.setup();
    const onAdmin = vi.fn();
    renderWithRouter(
      <DashboardNav modules={modules} {...defaultProps} onAdmin={onAdmin} />,
    );
    await user.click(screen.getByText("Admin"));
    expect(onAdmin).toHaveBeenCalledOnce();
  });
});
