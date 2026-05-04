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

import { Stack, Stepper } from "@mantine/core";
import { useState, type ReactNode } from "react";
import { IconCheck } from "@/components/icons/appIcons";
import BaseCard from "@/components/base-card/BaseCard";
import ButtonPair from "@/components/button/ButtonPair";

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
  /** Optional custom label for the Next button (e.g., "Add Patient", "Create User") */
  nextButtonLabel?: string;
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
  /** Handler called when the final step is submitted */
  onSubmit?: () => void;
  /** Current active step (0-indexed) - for controlled mode */
  activeStep?: number;
  /** Callback when active step changes - for controlled mode */
  onStepChange?: (step: number) => void;
  /** Allow all steps to be clicked regardless of visit history (e.g. edit mode) */
  allStepsAccessible?: boolean;
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
  onSubmit,
  activeStep: controlledStep,
  onStepChange,
  allStepsAccessible = false,
}: Props) {
  const [internalStep, setInternalStep] = useState(0);
  const [highestVisitedStep, setHighestVisitedStep] = useState(
    controlledStep ?? 0,
  );

  // Use controlled step if provided, otherwise use internal state
  const activeStep = controlledStep ?? internalStep;
  const setActiveStep = onStepChange ?? setInternalStep;

  // Keep high-water mark in sync with the active step
  if (activeStep > highestVisitedStep) {
    setHighestVisitedStep(activeStep);
  }

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
      // Mark current step as visited and advance
      setHighestVisitedStep((prev) => Math.max(prev, activeStep + 1));
      setActiveStep(activeStep + 1);
    }
  }

  function prevStep() {
    if (!isFirstStep) {
      setActiveStep(activeStep - 1);
    }
  }

  function handleStepClick(stepIndex: number) {
    // Allow clicking on any visited step, or all steps if allStepsAccessible
    if (allStepsAccessible || stepIndex <= highestVisitedStep) {
      setActiveStep(stepIndex);
    }
  }

  const stepContentProps: StepContentProps = {
    nextStep,
    prevStep,
    onCancel,
  };

  return (
    <Stack gap="lg">
      <Stepper
        active={activeStep}
        onStepClick={handleStepClick}
        completedIcon={
          <IconCheck
            size={21}
            stroke={3}
            color="var(--mantine-color-secondary-4)"
          />
        }
        styles={{
          stepLabel: {
            fontSize: "var(--mantine-font-size-lg)",
          },
          stepIcon: {
            fontSize: "var(--mantine-font-size-lg)",
            color: "var(--mantine-color-text)",
          },
        }}
        size="sm"
      >
        {steps.map((step, index) => (
          <Stepper.Step
            key={index}
            label={step.label}
            allowStepSelect={allStepsAccessible || index <= highestVisitedStep}
          />
        ))}
      </Stepper>

      <BaseCard>{currentStepConfig.content(stepContentProps)}</BaseCard>

      <ButtonPair
        cancelLabel={isFirstStep ? "Cancel" : "Back"}
        onCancel={isFirstStep ? onCancel : prevStep}
        acceptLabel={
          isLastStep
            ? currentStepConfig.nextButtonLabel || "Submit"
            : currentStepConfig.nextButtonLabel || "Next"
        }
        onAccept={isLastStep ? (onSubmit ?? onCancel) : nextStep}
      />
    </Stack>
  );
}
