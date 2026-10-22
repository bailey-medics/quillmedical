/**
 * ChooseSiteForm Tests
 */

import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import type { FormSubmitResult } from "@/components/form/Form";
import ChooseSiteForm, { type ChooseSiteFormProps } from "./ChooseSiteForm";

const sites = [
  { value: "1", label: "Northfield General Hospital" },
  { value: "2", label: "Riverside Community Hospital" },
];

const chosen: FormSubmitResult = {
  state: "success",
  message: { title: "Site chosen" },
};

function renderForm(props: Partial<ChooseSiteFormProps> = {}) {
  const onSubmit = vi.fn<ChooseSiteFormProps["onSubmit"]>(() => chosen);
  const onBack = vi.fn<ChooseSiteFormProps["onBack"]>();

  renderWithMantine(
    <ChooseSiteForm
      sites={sites}
      onSubmit={onSubmit}
      onBack={onBack}
      {...props}
    />,
  );

  return { onSubmit, onBack };
}

describe("ChooseSiteForm", () => {
  it("asks which site, with one choice for each", () => {
    renderForm();

    expect(screen.getByText("Which site are you joining?")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(
      screen.getByRole("radio", { name: "Riverside Community Hospital" }),
    ).toBeInTheDocument();
  });

  it("hands on the chosen site", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(
      screen.getByRole("radio", { name: "Riverside Community Hospital" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("2"));
  });

  it("cannot continue until a site is chosen", async () => {
    const user = userEvent.setup();
    renderForm();

    // Marked rather than disabled outright, so it can still be focused.
    const next = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(next).toHaveAttribute("aria-disabled", "true"));

    await user.click(
      screen.getByRole("radio", { name: "Northfield General Hospital" }),
    );

    await waitFor(() => expect(next).not.toHaveAttribute("aria-disabled"));
  });

  it("goes back", async () => {
    const user = userEvent.setup();
    const { onBack } = renderForm();

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalled();
  });
});
