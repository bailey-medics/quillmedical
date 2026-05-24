import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import type { FormSubmitResult } from "@/components/form/Form";
import RegistrationForm from "./RegistrationForm";

vi.mock("@lib/connectivity", () => ({
  useConnectivity: () => ({ isOnline: true }),
}));

const sampleOrganisations = [
  { value: "nhs-highland", label: "NHS Highland" },
  { value: "nhs-grampian", label: "NHS Grampian" },
];

const successResult: FormSubmitResult = {
  state: "success",
  message: { title: "Account created" },
};

const errorResult: FormSubmitResult = {
  state: "error",
  message: { title: "Email already taken" },
};

describe("RegistrationForm", () => {
  it("renders all form fields", () => {
    renderWithMantine(
      <RegistrationForm
        organisations={sampleOrganisations}
        onSubmit={() => new Promise(() => {})}
      />,
    );

    expect(screen.getByText("Create an account")).toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("Full name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Organisation")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Confirm password")).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).toBeInTheDocument();
  });

  it("disables submit when passwords do not match", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(successResult);

    renderWithMantine(
      <RegistrationForm
        organisations={sampleOrganisations}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.type(screen.getByLabelText(/^Password/), "pass1234");
    await user.type(screen.getByLabelText(/Confirm password/), "different");

    expect(screen.getByTestId("submit-button")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables submit when organisation is not selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(successResult);

    renderWithMantine(
      <RegistrationForm
        organisations={sampleOrganisations}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.type(screen.getByLabelText(/^Password/), "pass1234");
    await user.type(screen.getByLabelText(/Confirm password/), "pass1234");

    // Organisation not selected — button should be disabled
    expect(screen.getByTestId("submit-button")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("displays server error after failed submission", async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <RegistrationForm
        organisations={sampleOrganisations}
        onSubmit={async () => errorResult}
      />,
    );

    await user.type(screen.getByLabelText("Full name *"), "Test User");
    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.type(screen.getByLabelText(/^Password/), "pass1234");
    await user.type(screen.getByLabelText(/Confirm password/), "pass1234");

    // Select organisation
    await user.click(screen.getByPlaceholderText("Select your organisation"));
    await user.click(screen.getByRole("option", { name: "NHS Highland" }));

    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByText("Email already taken")).toBeInTheDocument();
    });
  });

  it("disables submit button while submitting", async () => {
    const user = userEvent.setup();

    renderWithMantine(
      <RegistrationForm
        organisations={sampleOrganisations}
        onSubmit={() => new Promise(() => {})}
      />,
    );

    await user.type(screen.getByLabelText("Username *"), "testuser");
    await user.type(screen.getByLabelText("Email *"), "test@example.com");
    await user.type(screen.getByLabelText(/^Password/), "pass1234");
    await user.type(screen.getByLabelText(/Confirm password/), "pass1234");

    // Select organisation
    await user.click(screen.getByPlaceholderText("Select your organisation"));
    await user.click(screen.getByRole("option", { name: "NHS Highland" }));

    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("submit-button")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  }, 15000);
});
