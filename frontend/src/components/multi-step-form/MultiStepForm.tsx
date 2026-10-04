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

import { Button, Group, Stack, Stepper, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useState, type ReactNode } from "react";
import { IconCheck } from "@/components/icons/appIcons";
import BaseCard from "@/components/base-card/BaseCard";
import ButtonPair from "@/components/button/ButtonPair";
import BodyText from "@/components/typography/BodyText";
import classes from "./MultiStepForm.module.css";

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
  /** Optional custom label for the Next button (e.g., "Add patient", "Create user") */
  nextButtonLabel?: string;
  /** Optional custom label for the Cancel/Back button */
  cancelButtonLabel?: string;
  /** Hide the button pair entirely for this step */
  hideButtons?: boolean;
  /** Hide only the cancel/back button for this step */
  hideCancelButton?: boolean;
  /** Render step content without the BaseCard wrapper */
  hideCard?: boolean;
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

  const theme = useMantineTheme();
  const isNarrow = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

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
      <Stack gap="xs">
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
          classNames={{ root: classes.root, stepIcon: classes.stepIcon }}
          styles={{
            stepLabel: {
              fontSize: "var(--mantine-font-size-md)",
            },
            // No line between one step and the next.
            separator: {
              display: "none",
            },
            // On a wide screen, at most four steps to a row: each takes
            // a quarter of the width and the rest wrap beneath, lined
            // up in the same columns. On a narrow one the labels are
            // left out, so the circles sit side by side in one row.
            step: isNarrow
              ? { paddingInlineEnd: "var(--mantine-spacing-xs)" }
              : {
                  flex: "0 0 25%",
                  paddingInlineEnd: "var(--mantine-spacing-md)",
                },
          }}
          size="sm"
        >
          {steps.map((step, index) => (
            <Stepper.Step
              key={index}
              // A circle with no label beside it still needs a name.
              {...(isNarrow
                ? { "aria-label": step.label }
                : { label: step.label })}
              allowStepSelect={
                allStepsAccessible || index <= highestVisitedStep
              }
            />
          ))}
        </Stepper>
        {isNarrow && (
          <BodyText>
            Step {activeStep + 1} of {steps.length}: {currentStepConfig.label}
          </BodyText>
        )}
      </Stack>

      {currentStepConfig.hideCard ? (
        currentStepConfig.content(stepContentProps)
      ) : (
        <BaseCard>{currentStepConfig.content(stepContentProps)}</BaseCard>
      )}

      {!currentStepConfig.hideButtons &&
        (currentStepConfig.hideCancelButton ? (
          <Group justify="flex-end" mt="xs">
            <Button
              size="md"
              onClick={isLastStep ? (onSubmit ?? onCancel) : nextStep}
            >
              {isLastStep
                ? currentStepConfig.nextButtonLabel || "Submit"
                : currentStepConfig.nextButtonLabel || "Next"}
            </Button>
          </Group>
        ) : (
          <ButtonPair
            cancelLabel={
              currentStepConfig.cancelButtonLabel ||
              (isFirstStep ? "Cancel" : "Back")
            }
            onCancel={isFirstStep ? onCancel : prevStep}
            acceptLabel={
              isLastStep
                ? currentStepConfig.nextButtonLabel || "Submit"
                : currentStepConfig.nextButtonLabel || "Next"
            }
            onAccept={isLastStep ? (onSubmit ?? onCancel) : nextStep}
          />
        ))}
    </Stack>
  );
}
