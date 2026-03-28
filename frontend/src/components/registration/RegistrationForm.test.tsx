import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import RegistrationForm from "./RegistrationForm";

const sampleOrganisations = [
  { value: "nhs-highland", label: "NHS Highland" },
  { value: "nhs-grampian", label: "NHS Grampian" },
];

describe("RegistrationForm", () => {
  it("renders all form fields", () => {
    renderWithMantine(
      <RegistrationForm
        organisations={sampleOrganisations}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Create an account")).toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Organisation")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Confirm password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Register" }),
    ).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithMantine(
      <RegistrationForm
        organisations={sampleOrganisations}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.type(screen.getByLabelText(/^Password/), "pass123");
    await user.type(screen.getByLabelText(/Confirm password/), "different");
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows error when organisation is not selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithMantine(
      <RegistrationForm
        organisations={sampleOrganisations}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.type(screen.getByLabelText(/^Password/), "pass123");
    await user.type(screen.getByLabelText(/Confirm password/), "pass123");
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(
      screen.getByText("Please select an organisation"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("displays external error prop", () => {
    renderWithMantine(
      <RegistrationForm
        organisations={sampleOrganisations}
        onSubmit={vi.fn()}
        error="Email already taken"
      />,
    );

    expect(screen.getByText("Email already taken")).toBeInTheDocument();
  });

  it("shows loading state when submitting", () => {
    renderWithMantine(
      <RegistrationForm
        organisations={sampleOrganisations}
        onSubmit={vi.fn()}
        submitting
      />,
    );

    expect(screen.getByRole("button", { name: "Register" })).toBeDisabled();
  });
});
