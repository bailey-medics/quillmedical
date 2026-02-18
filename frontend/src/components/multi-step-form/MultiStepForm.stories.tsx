/**
 * MultiStepForm Component Stories
 *
 * Demonstrates the MultiStepForm component with various configurations,
 * validation scenarios, and step content examples.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import MultiStepForm, { type StepConfig } from "./MultiStepForm";
import { useState } from "react";
import { TextInput, Stack, Text, Button, Group, Alert } from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";

const meta = {
  title: "MultiStepForm/MultiStepForm",
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
  args: {
    onCancel: fn(),
    steps: [
      {
        label: "Personal Info",
        description: "Basic information",
        content: () => (
          <Stack gap="md">
            <Text>Enter your personal information</Text>
            <TextInput label="Name" placeholder="John Doe" />
            <TextInput label="Email" placeholder="john@example.com" />
          </Stack>
        ),
      },
      {
        label: "Preferences",
        description: "Your preferences",
        content: () => (
          <Stack gap="md">
            <Text>Select your preferences</Text>
            <TextInput label="Role" placeholder="Developer" />
            <TextInput label="Department" placeholder="Engineering" />
          </Stack>
        ),
      },
      {
        label: "Review",
        description: "Confirm details",
        content: () => (
          <Stack gap="md">
            <Text fw={600}>Review Your Information</Text>
            <Text>Name: John Doe</Text>
            <Text>Email: john@example.com</Text>
            <Text>Role: Developer</Text>
            <Text>Department: Engineering</Text>
          </Stack>
        ),
      },
    ],
  },
};

/**
 * Form with Validation
 *
 * Shows validation that prevents moving to next step
 */
export const WithValidation: Story = {
  render: (args) => {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [validationError, setValidationError] = useState<string | null>(null);

    const steps: StepConfig[] = [
      {
        label: "Personal Info",
        description: "Required fields",
        validate: async () => {
          if (!name.trim()) {
            setValidationError("Name is required");
            return false;
          }
          if (!email.trim()) {
            setValidationError("Email is required");
            return false;
          }
          if (!email.includes("@")) {
            setValidationError("Email must be valid");
            return false;
          }
          setValidationError(null);
          return true;
        },
        content: () => (
          <Stack gap="md">
            <Text>All fields are required</Text>
            {validationError && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Validation Error"
                color="red"
              >
                {validationError}
              </Alert>
            )}
            <TextInput
              label="Name"
              placeholder="John Doe"
              required
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <TextInput
              label="Email"
              type="email"
              placeholder="john@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          </Stack>
        ),
      },
      {
        label: "Success",
        description: "Form completed",
        content: () => (
          <Stack gap="md" align="center">
            <IconCheck size={48} color="green" />
            <Text size="lg" fw={600}>
              Form Submitted Successfully!
            </Text>
            <Text>Name: {name}</Text>
            <Text>Email: {email}</Text>
          </Stack>
        ),
      },
    ];

    return <MultiStepForm {...args} steps={steps} />;
  },
  args: {
    steps: [],
    onCancel: fn(),
  },
};

/**
 * Custom Button Labels
 *
 * Steps with custom Next button labels
 */
export const CustomButtonLabels: Story = {
  args: {
    onCancel: fn(),
    steps: [
      {
        label: "Welcome",
        description: "Getting started",
        nextButtonLabel: "Get Started",
        content: () => (
          <Stack gap="md">
            <Text size="lg" fw={600}>
              Welcome to the Setup Wizard
            </Text>
            <Text>Click "Get Started" to begin the setup process.</Text>
          </Stack>
        ),
      },
      {
        label: "Configuration",
        description: "Set up options",
        nextButtonLabel: "Continue Setup",
        content: () => (
          <Stack gap="md">
            <Text>Configure your settings</Text>
            <TextInput label="API Key" placeholder="Enter API key" />
          </Stack>
        ),
      },
      {
        label: "Complete",
        description: "Setup complete",
        content: () => (
          <Stack gap="md" align="center">
            <IconCheck size={48} color="green" />
            <Text size="lg" fw={600}>
              Setup Complete!
            </Text>
          </Stack>
        ),
      },
    ],
  },
};

/**
 * Single Step Form
 *
 * Edge case: form with only one step
 */
export const SingleStep: Story = {
  args: {
    onCancel: fn(),
    steps: [
      {
        label: "Only Step",
        description: "One and done",
        content: () => (
          <Stack gap="md">
            <Text size="lg" fw={600}>
              Single Step Form
            </Text>
            <Text>This form only has one step.</Text>
            <TextInput label="Input" placeholder="Enter value" />
          </Stack>
        ),
      },
    ],
  },
};

/**
 * Five Step Form
 *
 * Longer form with five steps
 */
export const FiveSteps: Story = {
  args: {
    onCancel: fn(),
    steps: [
      {
        label: "Step 1",
        description: "First step",
        content: () => <Text>Step 1 Content</Text>,
      },
      {
        label: "Step 2",
        description: "Second step",
        content: () => <Text>Step 2 Content</Text>,
      },
      {
        label: "Step 3",
        description: "Third step",
        content: () => <Text>Step 3 Content</Text>,
      },
      {
        label: "Step 4",
        description: "Fourth step",
        content: () => <Text>Step 4 Content</Text>,
      },
      {
        label: "Step 5",
        description: "Final step",
        content: () => <Text>Step 5 Content - Final</Text>,
      },
    ],
  },
};

/**
 * Custom Navigation in Content
 *
 * Step content that uses the provided navigation functions
 */
export const CustomNavigation: Story = {
  args: {
    onCancel: fn(),
    steps: [
      {
        label: "Step 1",
        description: "Custom buttons",
        content: ({ nextStep }) => (
          <Stack gap="md">
            <Text>Step 1 - Click the custom button below</Text>
            <Button onClick={nextStep} fullWidth>
              Custom Next Button
            </Button>
          </Stack>
        ),
      },
      {
        label: "Step 2",
        description: "More options",
        content: ({ nextStep, prevStep }) => (
          <Stack gap="md">
            <Text>Step 2 - Custom navigation controls</Text>
            <Group grow>
              <Button variant="outline" onClick={prevStep}>
                Custom Back
              </Button>
              <Button onClick={nextStep}>Custom Next</Button>
            </Group>
          </Stack>
        ),
      },
      {
        label: "Step 3",
        description: "Final step",
        content: ({ prevStep, onCancel }) => (
          <Stack gap="md">
            <Text>Step 3 - Last step</Text>
            <Group grow>
              <Button variant="outline" onClick={prevStep}>
                Go Back
              </Button>
              <Button color="red" onClick={onCancel}>
                Custom Cancel
              </Button>
            </Group>
          </Stack>
        ),
      },
    ],
  },
};

/**
 * Controlled Mode
 *
 * Form using controlled step state
 */
export const ControlledMode: Story = {
  render: (args) => {
    const [activeStep, setActiveStep] = useState(0);

    const steps: StepConfig[] = [
      {
        label: "Step 1",
        description: "First step",
        content: () => (
          <Stack gap="md">
            <Text>Controlled step: {activeStep + 1}</Text>
            <Text>This form is in controlled mode.</Text>
          </Stack>
        ),
      },
      {
        label: "Step 2",
        description: "Second step",
        content: () => (
          <Stack gap="md">
            <Text>Controlled step: {activeStep + 1}</Text>
            <Text>Parent component controls the active step.</Text>
          </Stack>
        ),
      },
      {
        label: "Step 3",
        description: "Third step",
        content: () => (
          <Stack gap="md">
            <Text>Controlled step: {activeStep + 1}</Text>
            <Text>Step state managed externally.</Text>
          </Stack>
        ),
      },
    ];

    return (
      <MultiStepForm
        {...args}
        steps={steps}
        activeStep={activeStep}
        onStepChange={setActiveStep}
      />
    );
  },
  args: {
    steps: [],
    onCancel: fn(),
  },
};

/**
 * Steps Without Descriptions
 *
 * Minimal step configuration without descriptions
 */
export const NoDescriptions: Story = {
  args: {
    onCancel: fn(),
    steps: [
      {
        label: "Personal",
        content: () => (
          <Stack gap="md">
            <TextInput label="Name" placeholder="Your name" />
          </Stack>
        ),
      },
      {
        label: "Contact",
        content: () => (
          <Stack gap="md">
            <TextInput label="Email" placeholder="your@email.com" />
          </Stack>
        ),
      },
      {
        label: "Done",
        content: () => (
          <Stack gap="md">
            <Text>All set!</Text>
          </Stack>
        ),
      },
    ],
  },
};

/**
 * Test: Navigation Through All Steps
 *
 * Interaction test that navigates through all steps
 */
export const TestNavigateThroughSteps: Story = {
  ...BasicThreeSteps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Should start on step 1
    await expect(
      canvas.getByText("Enter your personal information"),
    ).toBeInTheDocument();

    // Navigate to step 2
    const nextButton1 = canvas.getByRole("button", { name: /Next/i });
    await userEvent.click(nextButton1);

    // Should be on step 2
    await waitFor(() =>
      expect(canvas.getByText("Select your preferences")).toBeInTheDocument(),
    );

    // Navigate to step 3
    const nextButton2 = canvas.getByRole("button", { name: /Next/i });
    await userEvent.click(nextButton2);

    // Should be on step 3
    await waitFor(() =>
      expect(canvas.getByText("Review Your Information")).toBeInTheDocument(),
    );

    // Should not have Next button on last step
    await expect(
      canvas.queryByRole("button", { name: /Next/i }),
    ).not.toBeInTheDocument();

    // Navigate back to step 2
    const backButton = canvas.getByRole("button", { name: /Back/i });
    await userEvent.click(backButton);

    // Should be on step 2 again
    await waitFor(() =>
      expect(canvas.getByText("Select your preferences")).toBeInTheDocument(),
    );
  },
};

/**
 * Test: Cancel Button
 *
 * Tests that cancel button works correctly
 */
export const TestCancelButton: Story = {
  ...BasicThreeSteps,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Click cancel button
    const cancelButton = canvas.getByRole("button", { name: /Cancel/i });
    await userEvent.click(cancelButton);

    // Should have called onCancel
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};

/**
 * Test: Cannot Skip Forward Steps
 *
 * Tests that future steps cannot be clicked
 */
export const TestCannotSkipForward: Story = {
  ...BasicThreeSteps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Should be on step 1
    await expect(
      canvas.getByText("Enter your personal information"),
    ).toBeInTheDocument();

    // Try to click on step 3 (should not work)
    const step3 = canvas.getByText("Review").closest("button");
    if (step3) {
      await userEvent.click(step3);
    }

    // Should still be on step 1
    await expect(
      canvas.getByText("Enter your personal information"),
    ).toBeInTheDocument();
  },
};

/**
 * Test: Can Click on Completed Steps
 *
 * Tests that completed steps can be clicked to navigate back
 */
export const TestClickCompletedSteps: Story = {
  ...BasicThreeSteps,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Navigate to step 2
    await userEvent.click(canvas.getByRole("button", { name: /Next/i }));

    // Wait for step 2 to render
    await waitFor(() =>
      expect(canvas.getByText("Select your preferences")).toBeInTheDocument(),
    );

    // Navigate to step 3
    await userEvent.click(canvas.getByRole("button", { name: /Next/i }));

    // Should be on step  3
    await waitFor(() =>
      expect(canvas.getByText("Review Your Information")).toBeInTheDocument(),
    );

    // Click back on step 1 via stepper
    const step1 = canvas.getByText("Personal Info").closest("button");
    if (step1) {
      await userEvent.click(step1);
    }

    // Should be back on step 1
    await waitFor(() =>
      expect(
        canvas.getByText("Enter your personal information"),
      ).toBeInTheDocument(),
    );
  },
};
