/**
 * NewPatientPage Component Stories
 *
 * Demonstrates the multi-step patient creation workflow:
 * - Step 1: Patient demographics (FHIR data)
 * - Step 2: Optional user account creation
 * - Step 3: Confirmation
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent } from "@storybook/test";
import NewPatientPage from "./NewPatientPage";

const meta: Meta<typeof NewPatientPage> = {
  title: "Pages/NewPatientPage",
  component: NewPatientPage,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof NewPatientPage>;

/**
 * Default: Step 1 - Demographics
 *
 * Starting state showing patient demographic fields.
 */
export const Step1Demographics: Story = {};

/**
 * Step 2 - User Account Creation
 *
 * Shows optional user account creation step after demographics.
 */
export const Step2UserAccount: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();

    // Fill demographics
    await user.type(canvas.getByLabelText(/first name/i), "Jane");
    await user.type(canvas.getByLabelText(/last name/i), "Smith");
    await user.type(canvas.getByLabelText(/date of birth/i), "1980-05-12");

    // Select sex
    const sexSelect = canvas.getByLabelText(/sex/i);
    await user.click(sexSelect);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    // National number
    await user.type(canvas.getByLabelText(/national number$/i), "1234567890");

    // Click Next to move to Step 2
    await user.click(canvas.getByRole("button", { name: /next/i }));
  },
};

/**
 * With User Account Enabled
 *
 * Shows Step 2 with user account creation checkbox enabled.
 */
export const WithUserAccountEnabled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();

    // Fill demographics
    await user.type(canvas.getByLabelText(/first name/i), "Jane");
    await user.type(canvas.getByLabelText(/last name/i), "Smith");
    await user.type(canvas.getByLabelText(/date of birth/i), "1980-05-12");

    // Select sex
    const sexSelect = canvas.getByLabelText(/sex/i);
    await user.click(sexSelect);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    // National number
    await user.type(canvas.getByLabelText(/national number$/i), "1234567890");

    // Move to Step 2
    await user.click(canvas.getByRole("button", { name: /next/i }));

    // Enable user account creation
    await user.click(
      canvas.getByLabelText(/create user account for patient portal access/i),
    );

    // Fill user account details
    await user.type(canvas.getByLabelText(/email/i), "jane.smith@example.com");
    await user.type(canvas.getByLabelText(/username/i), "janesmith");
    await user.type(canvas.getByLabelText(/initial password/i), "password123");
  },
};

/**
 * Validation Error - Demographics
 *
 * Shows validation errors when trying to proceed without required fields.
 */
export const ValidationErrorDemographics: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();

    // Try to proceed without filling any fields
    await user.click(canvas.getByRole("button", { name: /next/i }));
  },
};

/**
 * Validation Error - User Account
 *
 * Shows validation errors for user account fields when enabled.
 */
export const ValidationErrorUserAccount: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();

    // Fill demographics
    await user.type(canvas.getByLabelText(/first name/i), "Jane");
    await user.type(canvas.getByLabelText(/last name/i), "Smith");
    await user.type(canvas.getByLabelText(/date of birth/i), "1980-05-12");

    // Select sex
    const sexSelect = canvas.getByLabelText(/sex/i);
    await user.click(sexSelect);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    // National number
    await user.type(canvas.getByLabelText(/national number$/i), "1234567890");

    // Move to Step 2
    await user.click(canvas.getByRole("button", { name: /next/i }));

    // Enable user account creation
    await user.click(
      canvas.getByLabelText(/create user account for patient portal access/i),
    );

    // Try to submit without filling user account fields
    await user.click(
      canvas.getByRole("button", { name: /create patient & user account/i }),
    );
  },
};
