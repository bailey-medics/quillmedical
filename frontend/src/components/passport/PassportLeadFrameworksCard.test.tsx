/**
 * PassportLeadFrameworksCard Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import PassportLeadFrameworksCard from "./PassportLeadFrameworksCard";
import type { FrameworkOption } from "@lib/passport/frameworks";

const options: FrameworkOption[] = [
  {
    id: "clinical",
    name: "General clinical skills",
    publisher: "Quill Medical",
    version: "2026",
    specialties: [],
  },
  {
    id: "oncology",
    name: "Oncology (proof of concept)",
    publisher: "Quill Medical",
    version: "2026",
    specialties: ["oncology"],
  },
];

function renderCard(
  props: Partial<React.ComponentProps<typeof PassportLeadFrameworksCard>> = {},
) {
  return renderWithMantine(
    <PassportLeadFrameworksCard
      options={options}
      value={[]}
      onChange={vi.fn()}
      {...props}
    />,
  );
}

describe("PassportLeadFrameworksCard", () => {
  it("says what a lead framework does, and that it chooses nothing", () => {
    renderCard();

    expect(screen.getByText("Passport frameworks")).toBeInTheDocument();
    expect(
      screen.getByText(/Offered first, in this order/),
    ).toBeInTheDocument();
  });

  it("reports the framework an admin adds", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderCard({ onChange });

    await user.click(screen.getByRole("combobox", { name: /Lead frameworks/ }));
    await user.click(
      await screen.findByText(
        "Oncology (proof of concept) (Quill Medical, 2026)",
      ),
    );

    expect(onChange).toHaveBeenCalledWith(["oncology"]);
  });

  it("shows a saved lead whose file has gone, so it can be removed", () => {
    renderCard({ value: ["withdrawn_sheet"] });

    expect(
      screen.getAllByText("withdrawn_sheet (no longer offered)").length,
    ).toBeGreaterThan(0);
  });

  it("is disabled while the saved list is loading", () => {
    renderCard({ disabled: true });

    expect(
      screen.getByRole("combobox", { name: /Lead frameworks/ }),
    ).toBeDisabled();
  });

  it("shows why the list could not be loaded or saved", () => {
    renderCard({ error: "The lead frameworks could not be saved." });

    expect(
      screen.getByText("The lead frameworks could not be saved."),
    ).toBeInTheDocument();
  });
});
