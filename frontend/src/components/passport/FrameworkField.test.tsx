/**
 * FrameworkField Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import FrameworkField from "./FrameworkField";
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
  {
    id: "surgery_sheet",
    name: "Theatre sign-off sheet",
    publisher: "A Trust",
    version: "2025",
    specialties: ["general_surgery"],
  },
];

function renderField(
  props: Partial<React.ComponentProps<typeof FrameworkField>> = {},
) {
  return renderWithMantine(
    <FrameworkField
      options={options}
      value={[]}
      onChange={vi.fn()}
      {...props}
    />,
  );
}

async function openFrameworks(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("combobox", { name: /Frameworks you work to/ }),
  );
}

describe("FrameworkField", () => {
  it("offers every framework, with who published which edition", async () => {
    const user = userEvent.setup();
    renderField();

    await openFrameworks(user);

    expect(
      await screen.findByText("Theatre sign-off sheet (A Trust, 2025)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("General clinical skills (Quill Medical, 2026)"),
    ).toBeInTheDocument();
  });

  it("reports the framework chosen", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderField({ onChange });

    await openFrameworks(user);
    await user.click(
      await screen.findByText(
        "Oncology (proof of concept) (Quill Medical, 2026)",
      ),
    );

    expect(onChange).toHaveBeenCalledWith(["oncology"]);
  });

  describe("Narrowing to a specialty", () => {
    async function chooseSpecialty(
      user: ReturnType<typeof userEvent.setup>,
      name: string,
    ) {
      await user.click(screen.getByRole("combobox", { name: /Specialty/ }));
      await user.click(await screen.findByText(name));
    }

    it("keeps that specialty's frameworks and drops the others", async () => {
      const user = userEvent.setup();
      renderField();

      await chooseSpecialty(user, "Oncology");
      await openFrameworks(user);

      expect(
        await screen.findByText(
          "Oncology (proof of concept) (Quill Medical, 2026)",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Theatre sign-off sheet (A Trust, 2025)"),
      ).not.toBeInTheDocument();
    });

    it("always keeps a framework filed under no specialty", async () => {
      const user = userEvent.setup();
      renderField();

      await chooseSpecialty(user, "Oncology");
      await openFrameworks(user);

      expect(
        await screen.findByText(
          "General clinical skills (Quill Medical, 2026)",
        ),
      ).toBeInTheDocument();
    });

    it("keeps what is already chosen, whatever the filter says", async () => {
      const user = userEvent.setup();
      renderField({ value: ["surgery_sheet"] });

      await chooseSpecialty(user, "Oncology");

      // The pill, and the option behind it.
      expect(
        screen.getAllByText("Theatre sign-off sheet (A Trust, 2025)").length,
      ).toBeGreaterThan(0);
    });
  });

  it("shows a chosen framework Quill no longer holds, so it can be removed", () => {
    renderField({ value: ["withdrawn_sheet"] });

    expect(
      screen.getAllByText("withdrawn_sheet (no longer offered)").length,
    ).toBeGreaterThan(0);
  });

  it("disables the field and its filter together", () => {
    renderField({ disabled: true });

    expect(screen.getByRole("combobox", { name: /Specialty/ })).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: /Frameworks you work to/ }),
    ).toBeDisabled();
  });
});
