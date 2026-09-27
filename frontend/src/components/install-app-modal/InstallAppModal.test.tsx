/**
 * InstallAppModal tests
 *
 * - The prompt route offers Install and Not now, and Install hands over
 * - Each manual route lists that platform's steps with one Got it button
 * - The unsupported route explains which browsers can install
 * - Loading state while the browser's dialog is open
 * - Escape closes it
 */

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import InstallAppModal from "./InstallAppModal";
import { installSteps, type ManualInstallRoute } from "./installSteps";

const manualRoutes = Object.keys(installSteps) as ManualInstallRoute[];

describe("InstallAppModal", () => {
  it("does not render when closed", () => {
    renderWithMantine(
      <InstallAppModal
        opened={false}
        route="prompt"
        onInstall={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByText("Install Quill on this device?"),
    ).not.toBeInTheDocument();
  });

  describe("prompt route", () => {
    it("offers Install and Not now", () => {
      renderWithMantine(
        <InstallAppModal
          opened
          route="prompt"
          onInstall={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(
        screen.getByText("Install Quill on this device?"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Install" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Not now" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("runs the install, then closes", async () => {
      const user = userEvent.setup();
      const onInstall = vi.fn(() => Promise.resolve());
      const onClose = vi.fn();
      renderWithMantine(
        <InstallAppModal
          opened
          route="prompt"
          onInstall={onInstall}
          onClose={onClose}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Install" }));

      expect(onInstall).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("shows a loading state while the browser's dialog is open", async () => {
      const user = userEvent.setup();
      let finish: () => void = () => undefined;
      const onInstall = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const onClose = vi.fn();
      renderWithMantine(
        <InstallAppModal
          opened
          route="prompt"
          onInstall={onInstall}
          onClose={onClose}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Install" }));

      const install = screen.getByRole("button", { name: "Install" });
      expect(install).toHaveAttribute("data-loading", "true");
      expect(onClose).not.toHaveBeenCalled();

      finish();
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("closes on Not now without installing", async () => {
      const user = userEvent.setup();
      const onInstall = vi.fn();
      const onClose = vi.fn();
      renderWithMantine(
        <InstallAppModal
          opened
          route="prompt"
          onInstall={onInstall}
          onClose={onClose}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Not now" }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onInstall).not.toHaveBeenCalled();
    });

    it("closes on Escape", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderWithMantine(
        <InstallAppModal
          opened
          route="prompt"
          onInstall={vi.fn()}
          onClose={onClose}
        />,
      );

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe.each(manualRoutes)("%s route", (route) => {
    it("lists that platform's steps in order", () => {
      renderWithMantine(
        <InstallAppModal
          opened
          route={route}
          onInstall={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      const items = within(screen.getByRole("list")).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual(
        installSteps[route].map((step) => step.text),
      );
    });

    it("has one Got it button that closes it and never installs", async () => {
      const user = userEvent.setup();
      const onInstall = vi.fn();
      const onClose = vi.fn();
      renderWithMantine(
        <InstallAppModal
          opened
          route={route}
          onInstall={onInstall}
          onClose={onClose}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Install" }),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Got it" }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onInstall).not.toHaveBeenCalled();
    });
  });

  describe("unsupported route", () => {
    it("explains which browsers can install Quill", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderWithMantine(
        <InstallAppModal
          opened
          route="unsupported"
          onInstall={vi.fn()}
          onClose={onClose}
        />,
      );

      expect(
        screen.getByText("This browser cannot install Quill"),
      ).toBeInTheDocument();
      expect(screen.getByText(/open it in Chrome or Edge/)).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Got it" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
