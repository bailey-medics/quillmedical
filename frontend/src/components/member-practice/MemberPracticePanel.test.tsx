/**
 * Member practice panel tests.
 *
 * Covers what each of the three tables lists, that switching on
 * authorises straight away, that switching off and granting both ask
 * first, and that somebody who may not grant is not offered it.
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
    onAuthorise: vi.fn().mockResolvedValue(undefined),
    onWithdraw: vi.fn().mockResolvedValue(undefined),
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
  describe("Competencies held", () => {
    it("lists each held competency with its switch set from the rows", () => {
      renderPanel();

      expect(switchFor("Perform Venepuncture").checked).toBe(true);
      expect(switchFor("Certify Death").checked).toBe(false);
    });

    it("authorises straight away when switched on", async () => {
      const user = userEvent.setup();
      const { onAuthorise } = renderPanel();

      await user.click(switchFor("Certify Death"));

      expect(onAuthorise).toHaveBeenCalledWith("certify_death");
    });

    it("asks before withdrawing when switched off", async () => {
      const user = userEvent.setup();
      const { onWithdraw } = renderPanel();

      await user.click(switchFor("Perform Venepuncture"));
      expect(onWithdraw).not.toHaveBeenCalled();

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/stay qualified/i)).toBeInTheDocument();
      await user.click(
        within(dialog).getByRole("button", { name: "Withdraw" }),
      );

      expect(onWithdraw).toHaveBeenCalledWith("perform_venepuncture");
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

  describe("Other competencies", () => {
    it("asks before granting, and says the grant applies everywhere", async () => {
      const user = userEvent.setup();
      const { onGrantAndAuthorise } = renderPanel();

      const heading = screen.getByText("Other competencies");
      expect(heading).toBeInTheDocument();
      // The held competencies are not offered again.
      expect(
        screen.queryAllByRole("button", { name: "Grant and authorise" }).length,
      ).toBeGreaterThan(0);

      await user.click(
        screen.getAllByRole("button", { name: "Grant and authorise" })[0],
      );
      expect(onGrantAndAuthorise).not.toHaveBeenCalled();

      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText(/applies everywhere they work/i),
      ).toBeInTheDocument();
      await user.click(
        within(dialog).getByRole("button", { name: "Grant and authorise" }),
      );

      expect(onGrantAndAuthorise).toHaveBeenCalledTimes(1);
      const granted = onGrantAndAuthorise.mock.calls[0][0] as string;
      expect(practice.qualified).not.toContain(granted);
    });

    it("is not offered to somebody who may not grant", () => {
      renderPanel({ may_grant: false });

      expect(screen.queryByText("Other competencies")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Grant and authorise" }),
      ).not.toBeInTheDocument();
    });
  });
});
