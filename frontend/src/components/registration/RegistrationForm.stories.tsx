import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import RegistrationForm from "./RegistrationForm";

const sampleOrganisations = [
  { value: "nhs-highland", label: "NHS Highland" },
  { value: "nhs-grampian", label: "NHS Grampian" },
  { value: "nhs-lothian", label: "NHS Lothian" },
  { value: "nhs-greater-glasgow", label: "NHS Greater Glasgow and Clyde" },
  { value: "nhs-tayside", label: "NHS Tayside" },
];

const meta: Meta<typeof RegistrationForm> = {
  title: "Registration/RegistrationForm",
  component: RegistrationForm,
  parameters: { layout: "padded" },
  args: {
    organisations: sampleOrganisations,
    onSubmit: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithError: Story = {
  args: {
    error: "A user with that email address already exists",
  },
};

export const Submitting: Story = {
  args: {
    submitting: true,
  },
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
