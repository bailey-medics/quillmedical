/**
 * LogoutNavLink tests
 *
 * What the link does when signing out works, and when it does not.
 */
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import LogoutNavLink, { SIGN_OUT_FAILED } from "./LogoutNavLink";

describe("LogoutNavLink", () => {
  it("signs out, then closes the drawer", async () => {
    const onLogout = vi.fn().mockResolvedValue(undefined);
    const onNavigate = vi.fn();
    renderWithMantine(
      <LogoutNavLink onLogout={onLogout} onNavigate={onNavigate} />,
    );

    await userEvent.click(screen.getByText("Logout"));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledOnce());
    expect(onLogout).toHaveBeenCalledOnce();
    expect(screen.queryByText(SIGN_OUT_FAILED)).not.toBeInTheDocument();
  });

  it("says so when signing out fails, and leaves the drawer open", async () => {
    const onLogout = vi.fn().mockRejectedValue(new Error("offline"));
    const onNavigate = vi.fn();
    renderWithMantine(
      <LogoutNavLink onLogout={onLogout} onNavigate={onNavigate} />,
    );

    await userEvent.click(screen.getByText("Logout"));

    expect(
      (await screen.findAllByText(SIGN_OUT_FAILED)).length,
    ).toBeGreaterThan(0);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not show the raw error", async () => {
    const onLogout = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    renderWithMantine(<LogoutNavLink onLogout={onLogout} />);

    await userEvent.click(screen.getByText("Logout"));

    await screen.findAllByText(SIGN_OUT_FAILED);
    expect(screen.queryByText(/ECONNRESET/)).not.toBeInTheDocument();
  });

  it("can be pressed again after a failure, and clears the message when it works", async () => {
    const onLogout = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const onNavigate = vi.fn();
    renderWithMantine(
      <LogoutNavLink onLogout={onLogout} onNavigate={onNavigate} />,
    );

    await userEvent.click(screen.getByText("Logout"));
    await screen.findAllByText(SIGN_OUT_FAILED);
    await userEvent.click(screen.getByText("Logout"));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledOnce());
    expect(onLogout).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(SIGN_OUT_FAILED)).not.toBeInTheDocument();
  });

  it("cannot be pressed twice while signing out", async () => {
    const onLogout = vi.fn().mockReturnValue(new Promise(() => {}));
    renderWithMantine(<LogoutNavLink onLogout={onLogout} />);

    await userEvent.click(screen.getByText("Logout"));
    await userEvent.click(screen.getByText("Logout"));

    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("shows no icon when asked not to", () => {
    const { container } = renderWithMantine(
      <LogoutNavLink onLogout={vi.fn()} showIcons={false} />,
    );

    expect(container.querySelector("svg")).toBeNull();
  });
});
