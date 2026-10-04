/**
 * Member practice panel tests.
 *
 * Covers what each of the tables lists, that the switches save only
 * through "Save changes" and a confirmation, that withdrawing from the
 * not-held table and granting both ask first, and that somebody who may
 * not grant is not offered it.
 */

import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import type { MemberPractice } from "@/domains/orgUnit";
import MemberPracticePanel from "./MemberPracticePanel";

const practice: MemberPractice = {
  user_id: 4,
  username: "a.patel",
  full_name: "Anita Patel",
  org_unit_id: 3,
  org_unit_name: "Ward A",
  qualified: ["perform_venepuncture", "certify_death"],
  authorised: [
    {
      competency: "perform_venepuncture",
      authorised_at: "2026-09-01T09:00:00Z",
      authorised_by: "Admin User",
    },
  ],
  may_grant: true,
};

function renderPanel(overrides: Partial<MemberPractice> = {}) {
  const handlers = {
    onSave: vi.fn().mockResolvedValue(undefined),
    onWithdraw: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    onGrantAndAuthorise: vi.fn().mockResolvedValue(undefined),
  };
  renderWithRouter(
    <MemberPracticePanel
      practice={{ ...practice, ...overrides }}
      {...handlers}
    />,
  );
  return handlers;
}

function switchFor(name: string): HTMLInputElement {
  return screen.getByRole("switch", {
    name: `${name}: may practise here`,
  }) as HTMLInputElement;
}

describe("MemberPracticePanel", () => {
  describe("The competencies they hold", () => {
    it("lists each held competency with its switch set from the rows", () => {
      renderPanel();

      expect(switchFor("Perform Venepuncture").checked).toBe(true);
      expect(switchFor("Certify Death").checked).toBe(false);
    });

    it("saves nothing when a switch moves", async () => {
      const user = userEvent.setup();
      const { onSave, onWithdraw } = renderPanel();

      await user.click(switchFor("Certify Death"));
      await user.click(switchFor("Perform Venepuncture"));

      expect(switchFor("Certify Death").checked).toBe(true);
      expect(switchFor("Perform Venepuncture").checked).toBe(false);
      expect(onSave).not.toHaveBeenCalled();
      expect(onWithdraw).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("saves both directions together once confirmed", async () => {
      const user = userEvent.setup();
      const { onSave } = renderPanel();

      await user.click(switchFor("Certify Death"));
      await user.click(switchFor("Perform Venepuncture"));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/stay qualified/i)).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

      expect(onSave).toHaveBeenCalledWith({
        authorise: ["certify_death"],
        withdraw: ["perform_venepuncture"],
      });
      expect(await screen.findByText("Practice updated")).toBeInTheDocument();
    });

    it("gives no withdrawal warning when only authorising", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(switchFor("Certify Death"));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).queryByText(/stay qualified/i),
      ).not.toBeInTheDocument();
    });

    it("counts a switch moved and moved back as no change", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(switchFor("Certify Death"));
      await user.click(switchFor("Certify Death"));

      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("shows the reason when the save fails", async () => {
      const user = userEvent.setup();
      const { onSave } = renderPanel();
      onSave.mockRejectedValue(new Error("1 of 1 changes could not be saved."));

      await user.click(switchFor("Certify Death"));
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

      expect(
        await screen.findByText("Failed to update practice"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("1 of 1 changes could not be saved."),
      ).toBeInTheDocument();
    });

    it("cancels through the handler", async () => {
      const user = userEvent.setup();
      const { onCancel } = renderPanel();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("says so when they hold nothing", () => {
      renderPanel({ qualified: [], authorised: [] });

      expect(
        screen.getByText("They hold no competencies yet"),
      ).toBeInTheDocument();
    });
  });

  describe("Authorised here but not held", () => {
    it("is hidden when every row is within their competencies", () => {
      renderPanel();

      expect(
        screen.queryByText("Authorised here but not held"),
      ).not.toBeInTheDocument();
    });

    it("lists a row beyond their competencies, with withdraw", async () => {
      const user = userEvent.setup();
      const { onWithdraw } = renderPanel({
        authorised: [
          ...practice.authorised,
          {
            competency: "manage_users",
            authorised_at: "2026-09-01T09:00:00Z",
            authorised_by: null,
          },
        ],
      });

      expect(
        screen.getByText("Authorised here but not held"),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: /^Withdraw Manage/ }),
      );
      const dialog = await screen.findByRole("dialog");
      await user.click(
        within(dialog).getByRole("button", { name: "Withdraw" }),
      );

      expect(onWithdraw).toHaveBeenCalledWith("manage_users");
    });
  });

  describe("Granting a competency", () => {
    it("opens the grant modal from the button, and grants the choice", async () => {
      const user = userEvent.setup();
      const { onGrantAndAuthorise } = renderPanel();

      await user.click(
        screen.getByRole("button", { name: "Grant competency" }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText(/everywhere they work/i),
      ).toBeInTheDocument();

      await user.click(within(dialog).getByRole("combobox"));
      await user.click(
        await screen.findByRole("option", { name: "Manage User Accounts" }),
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Grant and authorise" }),
      );

      expect(onGrantAndAuthorise).toHaveBeenCalledWith("manage_users");
    });

    it("does not offer what they already hold", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(
        screen.getByRole("button", { name: "Grant competency" }),
      );
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("combobox"));

      expect(
        await screen.findByRole("option", { name: "Manage User Accounts" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Certify Death" }),
      ).not.toBeInTheDocument();
    });

    it("starts with the row's competency chosen from a not-held row", async () => {
      const user = userEvent.setup();
      const { onGrantAndAuthorise } = renderPanel({
        authorised: [
          {
            competency: "manage_users",
            authorised_at: "2026-09-01T09:00:00Z",
            authorised_by: null,
          },
        ],
      });

      await user.click(screen.getByRole("button", { name: "Grant" }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByRole("combobox")).toHaveValue(
        "Manage User Accounts",
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Grant and authorise" }),
      );

      expect(onGrantAndAuthorise).toHaveBeenCalledWith("manage_users");
    });

    it("is not offered to somebody who may not grant", () => {
      renderPanel({ may_grant: false });

      expect(
        screen.queryByRole("button", { name: "Grant competency" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Their user account", () => {
    it("opens it from the icon beside the table's search", async () => {
      const user = userEvent.setup();
      const onOpenUserAccount = vi.fn();
      renderWithRouter(
        <MemberPracticePanel
          practice={{ ...practice, may_grant: false }}
          onSave={vi.fn()}
          onWithdraw={vi.fn()}
          onGrantAndAuthorise={vi.fn()}
          onOpenUserAccount={onOpenUserAccount}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: "Their user account" }),
      );

      expect(onOpenUserAccount).toHaveBeenCalledOnce();
    });

    it("is not shown without a handler", () => {
      renderPanel();

      expect(
        screen.queryByRole("button", { name: "Their user account" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("A viewer limited to some competencies", () => {
    // A teaching admin: `may_change` names what they may switch and
    // grant. Everything the person holds is still shown.
    const teaching = {
      qualified: [
        "perform_venepuncture",
        "certify_death",
        "take_teaching_modules",
      ],
      may_change: [
        "manage_teaching",
        "view_teaching_analytics",
        "take_teaching_modules",
      ],
    };

    it("disables the switches they may not change, and shows them", () => {
      renderPanel(teaching);

      expect(switchFor("Certify Death")).toBeDisabled();
      expect(switchFor("Perform Venepuncture")).toBeDisabled();
      expect(switchFor("Take Teaching Modules")).toBeEnabled();
    });

    it("offers to grant only what they may change", async () => {
      const user = userEvent.setup();
      renderPanel(teaching);

      await user.click(
        screen.getByRole("button", { name: "Grant competency" }),
      );
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("combobox"));

      expect(
        await screen.findByRole("option", { name: "View Teaching Analytics" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Manage User Accounts" }),
      ).not.toBeInTheDocument();
    });

    it("leaves every switch alone when there is no limit", () => {
      renderPanel({ may_change: null });

      expect(switchFor("Certify Death")).toBeEnabled();
    });
  });
});
