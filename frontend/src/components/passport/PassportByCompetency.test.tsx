/**
 * PassportByCompetency Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import PassportByCompetency from "./PassportByCompetency";
import {
  oncologyCompetencies,
  oncologyFrameworks,
  prescribePalliativeCompetency,
} from "./fixtures";

describe("PassportByCompetency", () => {
  it("shows a table for each framework, in the order given", () => {
    renderWithRouter(
      <PassportByCompetency
        frameworks={oncologyFrameworks}
        competencies={oncologyCompetencies}
      />,
    );

    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual(
      expect.arrayContaining(oncologyFrameworks.map((f) => f.name)),
    );
    expect(headings.indexOf(oncologyFrameworks[0].name)).toBeLessThan(
      headings.indexOf(oncologyFrameworks[1].name),
    );
  });

  it("shows the sections outside the tables, download last", () => {
    renderWithRouter(
      <PassportByCompetency
        frameworks={[]}
        competencies={[]}
        onOpen={vi.fn<(path: string) => void>()}
      />,
    );

    const buttons = screen
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttons).toEqual([
      "Open CPD",
      "Open certificates",
      "Open reflections",
      "Open download",
    ]);
  });

  it("leaves sign-offs and the logbook to the tables", () => {
    renderWithRouter(
      <PassportByCompetency frameworks={[]} competencies={[]} />,
    );

    expect(screen.queryByText("Open sign-offs")).not.toBeInTheDocument();
    expect(screen.queryByText("Open logbook")).not.toBeInTheDocument();
  });

  it("opens a competency from its row", async () => {
    const onSelectCompetency = vi.fn<(competencyId: string) => void>();
    renderWithRouter(
      <PassportByCompetency
        frameworks={oncologyFrameworks}
        competencies={oncologyCompetencies}
        onSelectCompetency={onSelectCompetency}
      />,
    );

    await userEvent.click(screen.getByText(prescribePalliativeCompetency.name));

    expect(onSelectCompetency).toHaveBeenCalledWith(
      prescribePalliativeCompetency.id,
    );
  });

  it("opens a section from its card", async () => {
    const onOpen = vi.fn<(path: string) => void>();
    renderWithRouter(
      <PassportByCompetency
        frameworks={[]}
        competencies={[]}
        onOpen={onOpen}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open CPD" }));

    expect(onOpen).toHaveBeenCalledWith("/passport/cpd");
  });
});
