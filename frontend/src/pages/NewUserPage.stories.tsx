/**
 * NewUserPage Component Stories
 *
 * Demonstrates the multi-step user creation workflow:
 * - Step 1: Basic details (name, email, username, base profession)
 * - Step 2: Competency configuration (add/remove competencies)
 * - Step 3: System permissions and review
 * - Step 4: Confirmation
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent } from "@storybook/test";
import NewUserPage from "./NewUserPage";

const meta: Meta<typeof NewUserPage> = {
  title: "Pages/NewUserPage",
  component: NewUserPage,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof NewUserPage>;

/**
 * Default: Step 1 - Basic Details
 *
 * Starting state of the form showing basic user information fields.
 */
export const Step1BasicDetails: Story = {};

/**
 * Step 2 - Competencies
 *
 * Shows competency configuration after filling basic details.
 */
export const Step2Competencies: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();

    // Fill basic details
    await user.type(canvas.getByLabelText(/full name/i), "Dr Jane Smith");
    await user.type(canvas.getByLabelText(/email/i), "jane.smith@example.com");
    await user.type(canvas.getByLabelText(/username/i), "janesmith");
    await user.type(canvas.getByLabelText(/initial password/i), "password123");

    // Select base profession (using click approach for Select component)
    const professionSelect = canvas.getByLabelText(/base profession/i);
    await user.click(professionSelect);
    // Wait for dropdown to open and select first option
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    // Click Next to move to Step 2
    await user.click(canvas.getByRole("button", { name: /next/i }));
  },
};

/**
 * Step 3 - Permissions & Review
 *
 * Shows system permissions selection and review of all entered data.
 */
export const Step3PermissionsReview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();

    // Fill basic details
    await user.type(canvas.getByLabelText(/full name/i), "Dr Jane Smith");
    await user.type(canvas.getByLabelText(/email/i), "jane.smith@example.com");
    await user.type(canvas.getByLabelText(/username/i), "janesmith");
    await user.type(canvas.getByLabelText(/initial password/i), "password123");

    // Select base profession
    const professionSelect = canvas.getByLabelText(/base profession/i);
    await user.click(professionSelect);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    // Move to Step 2
    await user.click(canvas.getByRole("button", { name: /next/i }));

    // Skip competency configuration, move to Step 3
    await user.click(canvas.getByRole("button", { name: /next/i }));
  },
};

/**
 * With Additional Competencies
 *
 * Demonstrates adding additional competencies beyond the base profession.
 */
export const WithAdditionalCompetencies: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();

    // Fill basic details
    await user.type(canvas.getByLabelText(/full name/i), "Dr Sarah Johnson");
    await user.type(
      canvas.getByLabelText(/email/i),
      "sarah.johnson@example.com",
    );
    await user.type(canvas.getByLabelText(/username/i), "sarahjohnson");
    await user.type(canvas.getByLabelText(/initial password/i), "secure123");

    // Select base profession
    const professionSelect = canvas.getByLabelText(/base profession/i);
    await user.click(professionSelect);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    // Move to Step 2
    await user.click(canvas.getByRole("button", { name: /next/i }));

    // Add additional competencies
    const additionalSelect = canvas.getByLabelText(/additional competencies/i);
    await user.click(additionalSelect);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
  },
};

/**
 * Validation Error
 *
 * Shows validation errors when trying to proceed without required fields.
 */
export const ValidationError: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const user = userEvent.setup();

    // Try to proceed without filling any fields
    await user.click(canvas.getByRole("button", { name: /next/i }));
  },
};
