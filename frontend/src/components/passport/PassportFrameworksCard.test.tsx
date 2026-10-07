/**
 * PassportFrameworksCard Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
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
});
