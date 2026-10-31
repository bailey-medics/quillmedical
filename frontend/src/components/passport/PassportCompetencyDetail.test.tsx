/**
 * PassportCompetencyDetail Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import PassportCompetencyDetail from "./PassportCompetencyDetail";
import {
  emptyLogbook,
  oncologyFrameworks,
  prescribePalliativeCompetency,
  prescribePalliativeLogbook,
  prescribePalliativeSignOffs,
} from "./fixtures";

const competency = {
  id: prescribePalliativeCompetency.id,
  name: prescribePalliativeCompetency.name,
};

describe("PassportCompetencyDetail", () => {
  it("titles the page with the competency and its framework", () => {
    renderWithMantine(
      <PassportCompetencyDetail
        competency={competency}
        frameworkName={oncologyFrameworks[0].name}
        signOffs={prescribePalliativeSignOffs}
        logbook={prescribePalliativeLogbook}
        canWrite
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: competency.name }),
    ).toBeInTheDocument();
    expect(screen.getByText(oncologyFrameworks[0].name)).toBeInTheDocument();
  });

  it("lists the sign-offs and the logbook", () => {
    renderWithMantine(
      <PassportCompetencyDetail
        competency={competency}
        signOffs={prescribePalliativeSignOffs}
        logbook={prescribePalliativeLogbook}
        canWrite
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Sign-offs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Logbook" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 entries")).toBeInTheDocument();
  });

  it("says when nothing has been asked for", () => {
    renderWithMantine(
      <PassportCompetencyDetail
        competency={competency}
        signOffs={[]}
        logbook={emptyLogbook}
        canWrite
      />,
    );

    expect(screen.getByText("Nothing asked for yet")).toBeInTheDocument();
  });

  it("asks for a sign-off and adds an entry", async () => {
    const onAskForSignOff = vi.fn<() => void>();
    const onAddEntry = vi.fn<() => void>();
    renderWithMantine(
      <PassportCompetencyDetail
        competency={competency}
        signOffs={prescribePalliativeSignOffs}
        logbook={prescribePalliativeLogbook}
        canWrite
        onAskForSignOff={onAskForSignOff}
        onAddEntry={onAddEntry}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Ask for a sign-off" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Add an entry" }));

    expect(onAskForSignOff).toHaveBeenCalledOnce();
    expect(onAddEntry).toHaveBeenCalledOnce();
  });

  it("puts each add button above its own table", () => {
    renderWithMantine(
      <PassportCompetencyDetail
        competency={competency}
        signOffs={prescribePalliativeSignOffs}
        logbook={prescribePalliativeLogbook}
        canWrite
      />,
    );

    const follows = Node.DOCUMENT_POSITION_FOLLOWING;
    const ask = screen.getByRole("button", { name: "Ask for a sign-off" });
    const signOffs = screen.getByRole("heading", { name: "Sign-offs" });
    const add = screen.getByRole("button", { name: "Add an entry" });
    const logbook = screen.getByRole("heading", { name: "Logbook" });

    expect(ask.compareDocumentPosition(signOffs) & follows).toBeTruthy();
    expect(signOffs.compareDocumentPosition(add) & follows).toBeTruthy();
    expect(add.compareDocumentPosition(logbook) & follows).toBeTruthy();
  });

  it("offers no add buttons on a read-only passport", () => {
    renderWithMantine(
      <PassportCompetencyDetail
        competency={competency}
        signOffs={prescribePalliativeSignOffs}
        logbook={prescribePalliativeLogbook}
        canWrite={false}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Ask for a sign-off" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add an entry" }),
    ).not.toBeInTheDocument();
  });
});
