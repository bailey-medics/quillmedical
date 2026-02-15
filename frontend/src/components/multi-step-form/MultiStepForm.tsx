/**
 * Multi-Step Form Component
 *
 * Reusable wrapper for multi-step form workflows with:
 * - Step navigation (next, previous, cancel)
 * - Progress indicator
 * - Customizable step content
 * - Form state management
 *
 * @module MultiStepForm
 */

import { Button, Group, Paper, Stack, Stepper } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { IconChevronLeft } from "@tabler/icons-react";

/**
 * Individual step configuration
 */
export interface StepConfig {
  /** Step label displayed in stepper */
  label: string;
  /** Optional description text */
  description?: string;
  /** Step content render function */
  content: (props: StepContentProps) => ReactNode;
  /** Optional validation function - returns true if step is valid */
  validate?: () => boolean | Promise<boolean>;
}

/**
 * Props passed to step content render function
 */
export interface StepContentProps {
  /** Move to next step */
  nextStep: () => void;
  /** Move to previous step */
  prevStep: () => void;
  /** Cancel form and return */
  onCancel: () => void;
}

/**
 * MultiStepForm Props
 */
interface Props {
  /** Array of step configurations */
  steps: StepConfig[];
  /** Handler called when form is cancelled */
  onCancel: () => void;
  /** Current active step (0-indexed) - for controlled mode */
  activeStep?: number;
  /** Callback when active step changes - for controlled mode */
  onStepChange?: (step: number) => void;
}

/**
 * Multi-Step Form Component
 *
 * Provides step navigation, progress tracking, and customizable content
 * for multi-step workflows like user creation or patient onboarding.
 *
 * @param props - Component props
 * @returns Multi-step form wrapper
 */
export default function MultiStepForm({
  steps,
  onCancel,
  activeStep: controlledStep,
  onStepChange,
}: Props) {
  const [internalStep, setInternalStep] = useState(0);

  // Use controlled step if provided, otherwise use internal state
  const activeStep = controlledStep ?? internalStep;
  const setActiveStep = onStepChange ?? setInternalStep;

  const isFirstStep = activeStep === 0;
  const isLastStep = activeStep === steps.length - 1;
  const currentStepConfig = steps[activeStep];

  async function nextStep() {
    // Run validation if provided
    if (currentStepConfig.validate) {
      const isValid = await currentStepConfig.validate();
      if (!isValid) return;
    }

    if (!isLastStep) {
      setActiveStep(activeStep + 1);
    }
  }

  function prevStep() {
    if (!isFirstStep) {
      setActiveStep(activeStep - 1);
    }
  }

  const stepContentProps: StepContentProps = {
    nextStep,
    prevStep,
    onCancel,
  };

  return (
    <Stack gap="lg">
      <Stepper active={activeStep} onStepClick={setActiveStep}>
        {steps.map((step, index) => (
          <Stepper.Step
            key={index}
            label={step.label}
            description={step.description}
          />
        ))}
      </Stepper>

      <Paper p="xl" withBorder>
        {currentStepConfig.content(stepContentProps)}
      </Paper>

      <Group justify="space-between">
        <Button
          variant="subtle"
          leftSection={<IconChevronLeft size={16} />}
          onClick={onCancel}
        >
          Cancel
        </Button>

        <Group>
          {!isFirstStep && (
            <Button variant="default" onClick={prevStep}>
              Back
            </Button>
          )}
          {!isLastStep && <Button onClick={nextStep}>Next</Button>}
        </Group>
      </Group>
    </Stack>
  );
}
