/**
 * CompetencyPicker Component Tests
 *
 * Most of these guard "suggests, never restricts" — the rule that keeps
 * a convenience list from becoming a syllabus.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CompetencyPicker, {
  SHORTLIST_GROUP,
  EVERYTHING_ELSE_GROUP,
} from "./CompetencyPicker";

const commonlyUsedHere = ["prescribe_sact", "perform_bronchoscopy"];

describe("CompetencyPicker", () => {
  describe("Suggests, never restricts", () => {
    it("groups the site's competencies under a heading", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <CompetencyPicker
          value={null}
          onChange={vi.fn()}
          commonlyUsedHere={commonlyUsedHere}
        />,
      );

      await user.click(screen.getByRole("combobox"));

      expect(await screen.findByText(SHORTLIST_GROUP)).toBeInTheDocument();
    });

    it("still offers every other competency beneath", async () => {
      // Nothing is hidden: the shortlist is a convenience, not a filter.
      const user = userEvent.setup();
      renderWithMantine(
        <CompetencyPicker
          value={null}
          onChange={vi.fn()}
          commonlyUsedHere={commonlyUsedHere}
        />,
      );

      await user.click(screen.getByRole("combobox"));

      expect(
        await screen.findByText(EVERYTHING_ELSE_GROUP),
      ).toBeInTheDocument();
    });

    it("finds a competency that is not on the shortlist", async () => {
      // The point of the rule: an unusual competency must be reachable.
      const user = userEvent.setup();
      renderWithMantine(
        <CompetencyPicker
          value={null}
          onChange={vi.fn()}
          commonlyUsedHere={commonlyUsedHere}
        />,
      );

      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByRole("combobox"), "Manage User");

      expect(
        await screen.findByText("Manage User Accounts"),
      ).toBeInTheDocument();
    });
  });

  describe("The wording", () => {
    it("says commonly used, never required or available", () => {
      // "Required" would assert a sufficiency judgement the passport
      // deliberately refuses to make.
      expect(SHORTLIST_GROUP).toBe("Commonly used here");
      expect(SHORTLIST_GROUP).not.toMatch(/required/i);
      expect(SHORTLIST_GROUP).not.toMatch(/available/i);
    });
  });

  describe("Without a shortlist", () => {
    it("renders one flat list rather than a group of one", async () => {
      const user = userEvent.setup();
      renderWithMantine(<CompetencyPicker value={null} onChange={vi.fn()} />);

      await user.click(screen.getByRole("combobox"));
      await screen.findByText("Manage User Accounts");

      expect(screen.queryByText(SHORTLIST_GROUP)).not.toBeInTheDocument();
      expect(screen.queryByText(EVERYTHING_ELSE_GROUP)).not.toBeInTheDocument();
    });
  });

  describe("Choosing", () => {
    it("reports the chosen competency id", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithMantine(
        <CompetencyPicker
          value={null}
          onChange={onChange}
          commonlyUsedHere={commonlyUsedHere}
        />,
      );

      await user.click(screen.getByRole("combobox"));
      await user.click(await screen.findByText("Manage User Accounts"));

      expect(onChange).toHaveBeenCalledWith("manage_users", expect.anything());
    });
  });

  describe("Field behaviour", () => {
    it("renders the label", () => {
      renderWithMantine(<CompetencyPicker value={null} onChange={vi.fn()} />);
      expect(screen.getByText("Competency")).toBeInTheDocument();
    });

    it("renders a description when given", () => {
      renderWithMantine(
        <CompetencyPicker
          value={null}
          onChange={vi.fn()}
          description="What you are asking to be signed off for."
        />,
      );
      expect(
        screen.getByText("What you are asking to be signed off for."),
      ).toBeInTheDocument();
    });

    it("can be disabled", () => {
      renderWithMantine(
        <CompetencyPicker value={null} onChange={vi.fn()} disabled />,
      );
      expect(screen.getByRole("combobox")).toBeDisabled();
    });
  });
});
