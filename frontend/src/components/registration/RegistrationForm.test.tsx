import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, renderWithRouter } from "@test/test-utils";
import type { FormSubmitResult } from "@/components/form/Form";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@lib/legal/links";
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

  it("names no site and draws no Back button unless given them", () => {
    renderWithMantine(
      <RegistrationForm onSubmit={() => new Promise(() => {})} />,
    );

    expect(screen.queryByText(/^Joining/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
  });

  it("names the site being joined in a level two heading", () => {
    renderWithMantine(
      <RegistrationForm
        onSubmit={() => new Promise(() => {})}
        siteName="Test Hospital"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Joining Test Hospital" }),
    ).toBeInTheDocument();
  });

  it("goes back when Back is pressed, without submitting", async () => {
    const onBack = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<RegistrationForm onSubmit={onSubmit} onBack={onBack} />);

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("offers no guide to joining unless given one", () => {
    renderWithMantine(
      <RegistrationForm onSubmit={() => new Promise(() => {})} />,
    );

    expect(screen.queryByText("How to join a course")).not.toBeInTheDocument();
  });

  it("links to the guide to joining when given its address", () => {
    renderWithRouter(
      <RegistrationForm
        onSubmit={() => new Promise(() => {})}
        guidePath="/guides/join-a-course"
      />,
    );

    expect(
      screen.getByRole("link", { name: "How to join a course" }),
    ).toHaveAttribute("href", "/guides/join-a-course");
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

    // Organisation not selected – button should be disabled
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

  describe("the marketing question", () => {
    async function fillIn(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText("Full name *"), "Test User");
      await user.type(screen.getByLabelText("Username *"), "testuser");
      await user.type(screen.getByLabelText("Email *"), "test@example.com");
      await user.type(screen.getByLabelText(/^Password/), "pass1234");
      await user.type(screen.getByLabelText(/Confirm password/), "pass1234");
    }

    const box = () =>
      screen.getByRole("checkbox", {
        name: "I would rather not get news and updates",
      });

    it("says news will be sent, beside a box that is not ticked", () => {
      renderWithMantine(
        <RegistrationForm onSubmit={() => new Promise(() => {})} />,
      );

      expect(box()).not.toBeChecked();
      expect(
        screen.getByText(
          /We'll email you news and updates about Quill Medical/,
        ),
      ).toBeInTheDocument();
    });

    it("sends the box as left alone when it is not ticked", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(successResult);
      renderWithMantine(<RegistrationForm onSubmit={onSubmit} />);

      await fillIn(user);
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        marketingOptOut: false,
      });
    });

    it("sends the refusal when it is ticked", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn().mockResolvedValue(successResult);
      renderWithMantine(<RegistrationForm onSubmit={onSubmit} />);

      await fillIn(user);
      await user.click(box());
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        marketingOptOut: true,
      });
    });

    it("does not have to be ticked to register", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <RegistrationForm onSubmit={() => new Promise(() => {})} />,
      );

      await fillIn(user);

      expect(screen.getByTestId("submit-button")).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  });
  describe("the legal notice", () => {
    it("links the terms of service and the privacy policy", () => {
      renderWithMantine(
        <RegistrationForm onSubmit={() => new Promise(() => {})} />,
      );

      expect(
        screen.getByText(/By creating an account you agree to our/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /terms of service/ }),
      ).toHaveAttribute("href", TERMS_OF_SERVICE_URL);
      expect(
        screen.getByRole("link", { name: /privacy policy/ }),
      ).toHaveAttribute("href", PRIVACY_POLICY_URL);
    });

    it("sits above the submit button", () => {
      renderWithMantine(
        <RegistrationForm onSubmit={() => new Promise(() => {})} />,
      );

      const link = screen.getByRole("link", { name: /privacy policy/ });
      const submit = screen.getByTestId("submit-button");
      expect(
        link.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });
});
