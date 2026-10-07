/**
 * CompetencyPicker Component Tests
 *
 * The picker lists the competencies in the holder's frameworks and
 * nothing else, which is what keeps it readable however many frameworks
 * Quill holds.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CompetencyPicker, { NO_FRAMEWORKS_MESSAGE } from "./CompetencyPicker";

function renderPicker(
  props: Partial<React.ComponentProps<typeof CompetencyPicker>> = {},
) {
  return renderWithMantine(
    <CompetencyPicker value={null} onChange={vi.fn()} {...props} />,
  );
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: /Competency/ }));
}

describe("CompetencyPicker", () => {
  describe("With no framework chosen", () => {
    it("lists nothing, and says where to choose one", () => {
      renderPicker();

      expect(screen.getByText(NO_FRAMEWORKS_MESSAGE)).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: /Competency/ }),
      ).toBeDisabled();
    });

    it("does not fall back to listing every competency", async () => {
      renderPicker();

      expect(screen.queryByText("Insert Intravenous Cannula")).toBeNull();
    });
  });

  describe("With frameworks chosen", () => {
    it("lists a framework's competencies under its name", async () => {
      const user = userEvent.setup();
      renderPicker({ frameworks: ["clinical"] });

      await open(user);

      expect(
        await screen.findByText("General clinical skills"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Insert Intravenous Cannula"),
      ).toBeInTheDocument();
    });

    it("lists nothing from a framework the holder does not work to", async () => {
      const user = userEvent.setup();
      renderPicker({ frameworks: ["clinical"] });

      await open(user);
      await screen.findByText("General clinical skills");

      expect(
        screen.queryByText(
          "Level 2: Can review a prescription for SACT and accurately identify any errors or omissions",
        ),
      ).not.toBeInTheDocument();
    });

    it("lists each chosen framework under its own heading", async () => {
      const user = userEvent.setup();
      renderPicker({ frameworks: ["clinical", "uk_sact_board_2023"] });

      await open(user);

      expect(
        await screen.findByText("General clinical skills"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Prescriber competencies for reviewing and prescribing SACT",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Level 2: Can review a prescription for SACT and accurately identify any errors or omissions",
        ),
      ).toBeInTheDocument();
    });

    it("never offers a permission, though its file holds some", async () => {
      const user = userEvent.setup();
      renderPicker({ frameworks: ["clinical"] });

      await open(user);
      await screen.findByText("General clinical skills");

      expect(screen.queryByText(/Access Own Patient/i)).not.toBeInTheDocument();
    });

    it("reports the competency chosen", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderPicker({ frameworks: ["clinical"], onChange });

      await open(user);
      await user.click(await screen.findByText("Insert Intravenous Cannula"));

      // Mantine passes the chosen option as a second argument.
      expect(onChange.mock.calls[0][0]).toBe("perform_cannulation");
    });

    it("ignores a framework Quill no longer holds", () => {
      renderPicker({ frameworks: ["withdrawn_sheet"] });

      expect(screen.getByText(NO_FRAMEWORKS_MESSAGE)).toBeInTheDocument();
    });
  });

  it("shows its own description once there is something to pick", () => {
    renderPicker({
      frameworks: ["clinical"],
      description: "What this entry counts towards.",
    });

    expect(
      screen.getByText("What this entry counts towards."),
    ).toBeInTheDocument();
  });
});
