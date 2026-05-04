/**
 * MultiStepForm Component Stories
 *
 * Demonstrates the MultiStepForm component with various configurations,
 * validation scenarios, and step content examples.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import MultiStepForm from "./MultiStepForm";
import { Stack } from "@mantine/core";
import { SelectField, TextField } from "@/components/form";
import { Heading } from "@/components/typography";

const meta = {
  title: "Form/MultiStepForm",
  component: MultiStepForm,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    steps: {
      control: false,
      description: "Array of step configurations",
    },
    onCancel: {
      action: "cancelled",
      description: "Handler called when form is cancelled",
    },
  },
} satisfies Meta<typeof MultiStepForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Basic Three Step Form
 *
 * Simple three-step form showing the core functionality
 */
export const BasicThreeSteps: Story = {
  tags: ["!test"],
  args: {
    onCancel: fn(),
    steps: [
      {
        label: "Personal Info",
        description: "Basic information",
        content: () => (
          <Stack gap="md">
            <Heading>Enter your personal information</Heading>
            <TextField label="Name" placeholder="John Doe" />
            <TextField label="Email" placeholder="john@example.com" />
          </Stack>
        ),
      },
      {
        label: "Preferences",
        description: "Your preferences",
        content: () => (
          <Stack gap="md">
            <Heading>Select your preferences</Heading>
            <TextField label="Role" placeholder="Developer" />
            <TextField label="Department" placeholder="Engineering" />
          </Stack>
        ),
      },
      {
        label: "Job",
        description: "Confirm details",
        content: () => (
          <Stack gap="md">
            <Heading>Job details</Heading>
            <SelectField
              label="Department"
              data={["Engineering", "Design", "Product"]}
              placeholder="Select department"
            />
            <TextField label="Line manager" placeholder="e.g. Dr Corbett" />
          </Stack>
        ),
      },
    ],
  },
};

/**
 * Middle step
 *
 * Form pre-advanced to step 2 of 3, showing the "Back" and "Next" buttons
 */
export const MiddleStep: Story = {
  tags: ["!test"],
  args: {
    ...BasicThreeSteps.args,
    activeStep: 1,
  },
};

/**
 * Last step
 *
 * Form on the final review step — no "Next" button shown
 */
export const LastStep: Story = {
  tags: ["!test"],
  args: {
    ...BasicThreeSteps.args,
    activeStep: 2,
  },
};

/**
 * Single Step Form
 *
 * Edge case: form with only one step
 */
export const SingleStep: Story = {
  tags: ["!test"],
  args: {
    onCancel: fn(),
    steps: [
      {
        label: "Only Step",
        description: "One and done",
        content: () => (
          <Stack gap="md">
            <Heading>Single step form</Heading>
            <BodyText>This form only has one step.</BodyText>
            <TextField label="Input" placeholder="Enter value" />
          </Stack>
        ),
      },
    ],
  },
};

export const DarkMode: Story = {
  ...LastStep,
  globals: { colorScheme: "dark" },
};
