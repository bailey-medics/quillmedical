import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import EnabledFeaturesCard from "./EnabledFeaturesCard";

describe("EnabledFeaturesCard", () => {
  it("shows each feature by its label", () => {
    renderWithMantine(
      <EnabledFeaturesCard
        features={["teaching", "passport"]}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("Teaching")).toBeInTheDocument();
    expect(screen.getByText("Clinician passport")).toBeInTheDocument();
  });

  it("shows an unknown key as itself", () => {
    renderWithMantine(
      <EnabledFeaturesCard features={["new_thing"]} onEdit={vi.fn()} />,
    );

    expect(screen.getByText("new_thing")).toBeInTheDocument();
  });

  it("says so when nothing is switched on", () => {
    renderWithMantine(<EnabledFeaturesCard features={[]} onEdit={vi.fn()} />);

    expect(screen.getByText("No features enabled")).toBeInTheDocument();
  });

  it("opens the edit page from the pencil", async () => {
    const onEdit = vi.fn();
    renderWithMantine(
      <EnabledFeaturesCard features={["passport"]} onEdit={onEdit} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Edit features" }),
    );

    expect(onEdit).toHaveBeenCalledOnce();
  });
});
