/**
 * MultiStepForm Component Tests
 *
 * Tests for the multi-step form wrapper component with step navigation,
 * progress tracking, and validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import MultiStepForm, { type StepConfig } from "./MultiStepForm";

describe("MultiStepForm", () => {
  const mockOnCancel = vi.fn();

  const defaultSteps: StepConfig[] = [
    {
      label: "Step 1",
      description: "First step",
      content: () => <div>Step 1 Content</div>,
    },
    {
      label: "Step 2",
      description: "Second step",
      content: () => <div>Step 2 Content</div>,
    },
    {
      label: "Step 3",
      description: "Third step",
      content: () => <div>Step 3 Content</div>,
    },
  ];

  beforeEach(() => {
    mockOnCancel.mockClear();
  });

  describe("Basic rendering", () => {
    it("renders all step labels in the stepper", () => {
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );
      expect(screen.getByText("Step 1")).toBeInTheDocument();
      expect(screen.getByText("Step 2")).toBeInTheDocument();
      expect(screen.getByText("Step 3")).toBeInTheDocument();
    });

    it("renders first step content by default", () => {
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );
      expect(screen.getByText("Step 1 Content")).toBeInTheDocument();
    });

    it("renders Cancel button", () => {
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );
      expect(
        screen.getByRole("button", { name: /Cancel/i }),
      ).toBeInTheDocument();
    });

    it("does not render Back button on first step", () => {
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );
      expect(
        screen.queryByRole("button", { name: /Back/i }),
      ).not.toBeInTheDocument();
    });

    it("renders Next button on first step", () => {
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );
      expect(screen.getByRole("button", { name: /Next/i })).toBeInTheDocument();
    });
  });

  describe("Navigation", () => {
    it("moves to next step when Next button is clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );

      await user.click(screen.getByRole("button", { name: /Next/i }));

      expect(screen.getByText("Step 2 Content")).toBeInTheDocument();
      expect(screen.queryByText("Step 1 Content")).not.toBeInTheDocument();
    });

    it("renders Back button after moving to second step", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );

      await user.click(screen.getByRole("button", { name: /Next/i }));

      expect(screen.getByRole("button", { name: /Back/i })).toBeInTheDocument();
    });

    it("moves back to previous step when Back button is clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );

      await user.click(screen.getByRole("button", { name: /Next/i }));
      await user.click(screen.getByRole("button", { name: /Back/i }));

      expect(screen.getByText("Step 1 Content")).toBeInTheDocument();
    });

    it("does not render Next button on last step", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );

      await user.click(screen.getByRole("button", { name: /Next/i }));
      await user.click(screen.getByRole("button", { name: /Next/i }));

      expect(
        screen.queryByRole("button", { name: /Next/i }),
      ).not.toBeInTheDocument();
    });

    it("calls onCancel when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );

      await user.click(screen.getByRole("button", { name: /Cancel/i }));

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("Step validation", () => {
    it("calls validation function before moving to next step", async () => {
      const mockValidate = vi.fn().mockResolvedValue(true);
      const user = userEvent.setup();

      const stepsWithValidation: StepConfig[] = [
        {
          label: "Step 1",
          content: () => <div>Step 1</div>,
          validate: mockValidate,
        },
        {
          label: "Step 2",
          content: () => <div>Step 2</div>,
        },
      ];

      renderWithMantine(
        <MultiStepForm steps={stepsWithValidation} onCancel={mockOnCancel} />,
      );

      await user.click(screen.getByRole("button", { name: /Next/i }));

      expect(mockValidate).toHaveBeenCalledTimes(1);
    });

    it("does not move to next step if validation fails", async () => {
      const mockValidate = vi.fn().mockResolvedValue(false);
      const user = userEvent.setup();

      const stepsWithValidation: StepConfig[] = [
        {
          label: "Step 1",
          content: () => <div>Step 1 Content</div>,
          validate: mockValidate,
        },
        {
          label: "Step 2",
          content: () => <div>Step 2 Content</div>,
        },
      ];

      renderWithMantine(
        <MultiStepForm steps={stepsWithValidation} onCancel={mockOnCancel} />,
      );

      await user.click(screen.getByRole("button", { name: /Next/i }));

      expect(mockValidate).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Step 1 Content")).toBeInTheDocument();
      expect(screen.queryByText("Step 2 Content")).not.toBeInTheDocument();
    });

    it("moves to next step if validation passes", async () => {
      const mockValidate = vi.fn().mockResolvedValue(true);
      const user = userEvent.setup();

      const stepsWithValidation: StepConfig[] = [
        {
          label: "Step 1",
          content: () => <div>Step 1 Content</div>,
          validate: mockValidate,
        },
        {
          label: "Step 2",
          content: () => <div>Step 2 Content</div>,
        },
      ];

      renderWithMantine(
        <MultiStepForm steps={stepsWithValidation} onCancel={mockOnCancel} />,
      );

      await user.click(screen.getByRole("button", { name: /Next/i }));

      await waitFor(() => {
        expect(screen.getByText("Step 2 Content")).toBeInTheDocument();
      });
    });
  });

  describe("Custom button labels", () => {
    it("renders custom Next button label", () => {
      const stepsWithCustomLabel: StepConfig[] = [
        {
          label: "Step 1",
          content: () => <div>Step 1</div>,
          nextButtonLabel: "Continue",
        },
        {
          label: "Step 2",
          content: () => <div>Step 2</div>,
        },
      ];

      renderWithMantine(
        <MultiStepForm steps={stepsWithCustomLabel} onCancel={mockOnCancel} />,
      );

      expect(
        screen.getByRole("button", { name: /Continue/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /^Next$/i }),
      ).not.toBeInTheDocument();
    });

    it("uses default Next label when custom label not provided", () => {
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );

      expect(
        screen.getByRole("button", { name: /^Next$/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Step content props", () => {
    it("passes nextStep function to step content", async () => {
      const user = userEvent.setup();

      const stepsWithCustomNext: StepConfig[] = [
        {
          label: "Step 1",
          content: ({ nextStep }) => (
            <div>
              <div>Step 1 Custom</div>
              <button onClick={nextStep}>Custom Next</button>
            </div>
          ),
        },
        {
          label: "Step 2",
          content: () => <div>Step 2 Content</div>,
        },
      ];

      renderWithMantine(
        <MultiStepForm steps={stepsWithCustomNext} onCancel={mockOnCancel} />,
      );

      // Click the custom button inside step content
      await user.click(screen.getByRole("button", { name: /Custom Next/i }));

      expect(screen.getByText("Step 2 Content")).toBeInTheDocument();
    });

    it("passes prevStep function to step content", async () => {
      const user = userEvent.setup();

      const stepsWithCustomBack: StepConfig[] = [
        {
          label: "Step 1",
          content: () => <div>Step 1 Content</div>,
        },
        {
          label: "Step 2",
          content: ({ prevStep }) => (
            <div>
              <div>Step 2 Content</div>
              <button onClick={prevStep}>Custom Back</button>
            </div>
          ),
        },
      ];

      renderWithMantine(
        <MultiStepForm steps={stepsWithCustomBack} onCancel={mockOnCancel} />,
      );

      await user.click(screen.getByRole("button", { name: /^Next$/i }));
      await user.click(screen.getByRole("button", { name: /Custom Back/i }));

      expect(screen.getByText("Step 1 Content")).toBeInTheDocument();
    });

    it("passes onCancel function to step content", async () => {
      const user = userEvent.setup();

      const stepsWithCustomCancel: StepConfig[] = [
        {
          label: "Step 1",
          content: ({ onCancel }) => (
            <div>
              <div>Step 1 Content</div>
              <button onClick={onCancel}>Custom Cancel</button>
            </div>
          ),
        },
      ];

      renderWithMantine(
        <MultiStepForm steps={stepsWithCustomCancel} onCancel={mockOnCancel} />,
      );

      await user.click(screen.getByRole("button", { name: /Custom Cancel/i }));

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("Controlled mode", () => {
    it("uses provided activeStep prop", () => {
      renderWithMantine(
        <MultiStepForm
          steps={defaultSteps}
          onCancel={mockOnCancel}
          activeStep={1}
        />,
      );

      expect(screen.getByText("Step 2 Content")).toBeInTheDocument();
    });

    it("calls onStepChange when step changes", async () => {
      const mockOnStepChange = vi.fn();
      const user = userEvent.setup();

      renderWithMantine(
        <MultiStepForm
          steps={defaultSteps}
          onCancel={mockOnCancel}
          activeStep={0}
          onStepChange={mockOnStepChange}
        />,
      );

      await user.click(screen.getByRole("button", { name: /^Next$/i }));

      expect(mockOnStepChange).toHaveBeenCalledWith(1);
    });
  });

  describe("Step accessibility", () => {
    it("prevents clicking on future steps", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );

      // Try to click on Step 3 (should not be accessible)
      const step3 = screen.getByText("Step 3").closest("button");
      if (step3) {
        await user.click(step3);
      }

      // Should still be on Step 1
      expect(screen.getByText("Step 1 Content")).toBeInTheDocument();
    });

    it("allows clicking on completed steps", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );

      // Move to Step 2
      await user.click(screen.getByRole("button", { name: /^Next$/i }));
      expect(screen.getByText("Step 2 Content")).toBeInTheDocument();

      // Click back on Step 1 via stepper
      const step1 = screen.getByText("Step 1").closest("button");
      if (step1) {
        await user.click(step1);
      }

      // Should be back on Step 1
      expect(screen.getByText("Step 1 Content")).toBeInTheDocument();
    });

    it("allows clicking on current step", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <MultiStepForm steps={defaultSteps} onCancel={mockOnCancel} />,
      );

      // Click on Step 1 (current step)
      const step1 = screen.getByText("Step 1").closest("button");
      if (step1) {
        await user.click(step1);
      }

      // Should remain on Step 1
      expect(screen.getByText("Step 1 Content")).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("handles single step form", () => {
      const singleStep: StepConfig[] = [
        {
          label: "Only Step",
          content: () => <div>Single Step Content</div>,
        },
      ];

      renderWithMantine(
        <MultiStepForm steps={singleStep} onCancel={mockOnCancel} />,
      );

      expect(screen.getByText("Single Step Content")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Next/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Back/i }),
      ).not.toBeInTheDocument();
    });

    it("handles steps without descriptions", () => {
      const stepsWithoutDesc: StepConfig[] = [
        {
          label: "Personal",
          content: () => <div>Personal Content</div>,
        },
        {
          label: "Contact",
          content: () => <div>Contact Content</div>,
        },
      ];

      renderWithMantine(
        <MultiStepForm steps={stepsWithoutDesc} onCancel={mockOnCancel} />,
      );

      expect(screen.getByText("Personal")).toBeInTheDocument();
      expect(screen.getByText("Contact")).toBeInTheDocument();
      expect(screen.getByText("Personal Content")).toBeInTheDocument();
    });
  });
});
