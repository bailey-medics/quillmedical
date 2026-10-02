/**
 * HazardDetail Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import HazardDetail from "./HazardDetail";
import { SAFETY_CASES } from "@lib/safety";

const safetyCase = SAFETY_CASES[0];
const hazard = safetyCase.hazards[1]; // H-02, open, one incident
const incidents = safetyCase.incidents.filter((i) => i.hazard_id === hazard.id);

describe("HazardDetail", () => {
  it("shows the hazard, its cause, effect and status", () => {
    renderWithMantine(<HazardDetail hazard={hazard} incidents={incidents} />);
    expect(
      screen.getByRole("heading", {
        name: "Allergy alert suppressed after a session timeout",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(hazard.cause)).toBeInTheDocument();
    expect(screen.getByText(hazard.effect)).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("spells out likelihood and severity before and after mitigation", () => {
    renderWithMantine(<HazardDetail hazard={hazard} incidents={incidents} />);
    // Initial 2 x 5 = 10, residual 1 x 4 = 4
    expect(screen.getByText("Likelihood 2 of 5, low")).toBeInTheDocument();
    expect(
      screen.getByText("Severity 5 of 5, catastrophic"),
    ).toBeInTheDocument();
    expect(screen.getByText("Likelihood 1 of 5, very low")).toBeInTheDocument();
    expect(screen.getByText("Severity 4 of 5, major")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Risk rating 10: likelihood 2, severity 5"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Unacceptable without mitigation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Tolerable, review")).toBeInTheDocument();
  });

  it("shows the mitigation and the linked incidents", async () => {
    const onSelectIncident = vi.fn();
    renderWithMantine(
      <HazardDetail
        hazard={hazard}
        incidents={incidents}
        onSelectIncident={onSelectIncident}
      />,
    );
    expect(screen.getByText(hazard.mitigation)).toBeInTheDocument();
    await userEvent.click(screen.getByText("INC-2026-009"));
    expect(onSelectIncident).toHaveBeenCalledWith(incidents[0]);
  });

  it("says so when no incident has realised the hazard", () => {
    renderWithMantine(
      <HazardDetail hazard={safetyCase.hazards[0]} incidents={[]} />,
    );
    expect(
      screen.getByText("No incidents recorded against this case"),
    ).toBeInTheDocument();
  });
});
