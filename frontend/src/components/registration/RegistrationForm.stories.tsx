import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import type { FormSubmitResult } from "@/components/form/Form";
import RegistrationForm from "./RegistrationForm";

const sampleOrganisations = [
  { value: "nhs-highland", label: "NHS Highland" },
  { value: "nhs-grampian", label: "NHS Grampian" },
  { value: "nhs-lothian", label: "NHS Lothian" },
  { value: "nhs-greater-glasgow", label: "NHS Greater Glasgow and Clyde" },
  { value: "nhs-tayside", label: "NHS Tayside" },
];

const errorResult: FormSubmitResult = {
  state: "error",
  message: { title: "A user with that email address already exists" },
};

async function fillAndSubmit(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const body = within(document.body);
  await userEvent.type(canvas.getByLabelText("Username *"), "testuser");
  await userEvent.type(canvas.getByLabelText("Email *"), "test@example.com");
  // Select organisation — dropdown renders in a portal outside canvasElement
  await userEvent.click(
    canvas.getByPlaceholderText("Select your organisation"),
  );
  await userEvent.click(body.getByRole("option", { name: "NHS Highland" }));
  await userEvent.type(canvas.getByLabelText(/^Password/), "SecurePass1!");
  await userEvent.type(
    canvas.getByLabelText(/Confirm password/),
    "SecurePass1!",
  );
  // Allow RHF onChange validation to settle before clicking submit
  await new Promise((r) => setTimeout(r, 100));
  await userEvent.click(canvas.getByTestId("submit-button"));
}

const meta: Meta<typeof RegistrationForm> = {
  title: "Registration/RegistrationForm",
  component: RegistrationForm,
  parameters: { layout: "padded" },
  args: {
    organisations: sampleOrganisations,
    onSubmit: () => new Promise(() => {}),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Submitting: Story = {
  args: {
    onSubmit: () => new Promise(() => {}),
  },
  play: async ({ canvasElement }) => fillAndSubmit(canvasElement),
};

export const WithError: Story = {
  args: {
    onSubmit: async () => errorResult,
  },
  play: async ({ canvasElement }) => fillAndSubmit(canvasElement),
};

export const NoOrganisations: Story = {
  args: {
    organisations: [],
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
