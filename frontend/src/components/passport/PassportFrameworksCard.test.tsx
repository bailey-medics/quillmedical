/**
 * PassportFrameworksCard Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import PassportFrameworksCard from "./PassportFrameworksCard";
import type { FrameworkOption } from "@lib/passport/frameworks";

const options: FrameworkOption[] = [
  {
    id: "clinical",
    name: "General clinical skills",
    publisher: "Quill Medical",
    version: "2026",
    specialties: [],
  },
];

function renderCard(
  props: Partial<React.ComponentProps<typeof PassportFrameworksCard>> = {},
) {
  return renderWithRouter(
    <PassportFrameworksCard
      options={options}
      value={["clinical"]}
      onChange={vi.fn()}
      landingView="by_competency"
      onLandingViewChange={vi.fn()}
      {...props}
    />,
  );
}

describe("PassportFrameworksCard", () => {
  it("is titled for the passport and shows the holder's frameworks", () => {
    renderCard();

    expect(screen.getByText("Clinician passport")).toBeInTheDocument();
    expect(
      screen.getAllByText("General clinical skills (Quill Medical, 2026)")
        .length,
    ).toBeGreaterThan(0);
  });

  it("says that removing a framework keeps what is recorded under it", () => {
    renderCard();

    expect(
      screen.getByText(/keeps everything already recorded under it/),
    ).toBeInTheDocument();
  });

  it("links to the CPD date ranges", () => {
    renderCard();

    expect(
      screen.getByRole("link", { name: /CPD date ranges/ }),
    ).toHaveAttribute("href", "/settings/cpd-date-ranges");
  });

  it("says why it cannot be changed while the passport is read-only", () => {
    renderCard({ disabled: true });

    expect(screen.getByText(/read-only at the moment/)).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Frameworks you work to/ }),
    ).toBeDisabled();
  });

  it("keeps the CPD link usable while read-only", () => {
    renderCard({ disabled: true });

    expect(
      screen.getByRole("link", { name: /CPD date ranges/ }),
    ).toBeInTheDocument();
  });

  it("shows why the last change was not saved", () => {
    renderCard({ error: "Your frameworks could not be saved." });

    expect(
      screen.getByText("Your frameworks could not be saved."),
    ).toBeInTheDocument();
  });
  it("shows which view the passport home page opens in", () => {
    renderCard({ landingView: "by_record" });

    expect(screen.getByRole("radio", { name: "By record" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "By competency" }),
    ).not.toBeChecked();
  });

  it("calls back with the view chosen", async () => {
    const onLandingViewChange =
      vi.fn<(value: "by_competency" | "by_record") => void>();
    renderCard({ onLandingViewChange });

    await userEvent.click(screen.getByRole("radio", { name: "By record" }));

    expect(onLandingViewChange).toHaveBeenCalledWith("by_record");
  });

  it("keeps the home page choice open on a read-only passport", () => {
    renderCard({ disabled: true });

    expect(screen.getByRole("radio", { name: "By record" })).toBeEnabled();
  });

  it("says when the choice could not be saved", () => {
    renderCard({ landingViewError: "Your choice could not be saved." });

    expect(
      screen.getByText("Your choice could not be saved."),
    ).toBeInTheDocument();
  });
});
