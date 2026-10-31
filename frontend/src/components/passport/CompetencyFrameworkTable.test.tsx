/**
 * CompetencyFrameworkTable Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CompetencyFrameworkTable from "./CompetencyFrameworkTable";
import {
  breastCompetency,
  lungCompetency,
  oncologyCompetencies,
  oncologyFrameworks,
  prescribePalliativeCompetency,
  referPalliativeCompetency,
  referRadicalCompetency,
} from "./fixtures";

const [radiotherapy, sact] = oncologyFrameworks;

/** The table row holding this text. */
function rowFor(text: string): HTMLElement {
  return screen.getByText(text).closest("tr") as HTMLElement;
}

describe("CompetencyFrameworkTable", () => {
  it("heads the table with the framework's name", () => {
    renderWithMantine(
      <CompetencyFrameworkTable
        framework={radiotherapy}
        competencies={oncologyCompetencies}
      />,
    );

    expect(
      screen.getByRole("heading", { name: radiotherapy.name }),
    ).toBeInTheDocument();
  });

  it("shows each row's sign-off and logbook count", () => {
    renderWithMantine(
      <CompetencyFrameworkTable
        framework={radiotherapy}
        competencies={oncologyCompetencies}
      />,
    );

    const signed = rowFor(referPalliativeCompetency.name);
    expect(within(signed).getByText("Signed off")).toBeInTheDocument();
    expect(within(signed).getByText("12 entries")).toBeInTheDocument();

    const waiting = rowFor(prescribePalliativeCompetency.name);
    expect(within(waiting).getByText("Requested")).toBeInTheDocument();

    const notAsked = rowFor(referRadicalCompetency.name);
    expect(within(notAsked).getByText("Not asked")).toBeInTheDocument();
    expect(within(notAsked).getByText("3 entries")).toBeInTheDocument();
  });

  it("shows no signed count under the framework's name", () => {
    renderWithMantine(
      <CompetencyFrameworkTable
        framework={radiotherapy}
        competencies={oncologyCompetencies}
      />,
    );

    expect(screen.queryByText(/ of \d+ signed off/)).not.toBeInTheDocument();
  });

  it("names the site on each row of a scoped competency", () => {
    renderWithMantine(
      <CompetencyFrameworkTable
        framework={sact}
        competencies={[lungCompetency, breastCompetency]}
      />,
    );

    expect(
      screen.getByText(`${lungCompetency.name} (Lung)`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${lungCompetency.name} (Breast)`),
    ).toBeInTheDocument();
  });

  it("opens a competency by its id", async () => {
    const onSelect = vi.fn<(competencyId: string) => void>();
    renderWithMantine(
      <CompetencyFrameworkTable
        framework={radiotherapy}
        competencies={oncologyCompetencies}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByText(prescribePalliativeCompetency.name));

    expect(onSelect).toHaveBeenCalledWith(prescribePalliativeCompetency.id);
  });
});
