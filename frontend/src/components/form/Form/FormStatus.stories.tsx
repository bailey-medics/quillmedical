/**
 * FormStatus Storybook Stories
 *
 * Demonstrates the FormStatus component in all variants,
 * using prop-driven mode (no Form context required).
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariantRow, VariantStack } from "@/stories/variants";
import FormStatus from "./FormStatus";

const meta: Meta<typeof FormStatus> = {
  title: "Form/FormStatus",
  component: FormStatus,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof FormStatus>;

/**
 * All variants side by side
 */
export const AllVariants: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="success" horizontal={false}>
        <FormStatus
          variant="success"
          title="Settings saved"
          description="Your changes have been applied."
        />
      </VariantRow>
      <VariantRow label="error" horizontal={false}>
        <FormStatus
          variant="error"
          title="Failed to save"
          description="The server returned an error. Please try again."
        />
      </VariantRow>
      <VariantRow label="partial_success" horizontal={false}>
        <FormStatus
          variant="partial_success"
          title="Partially saved"
          description="Letter saved to patient record. Delivery to GP is still pending."
        />
      </VariantRow>
      <VariantRow label="timeout" horizontal={false}>
        <FormStatus
          variant="timeout"
          title="Request timed out"
          description="The server did not respond in time. Your changes may not have been saved."
        />
      </VariantRow>
      <VariantRow label="validation_error" horizontal={false}>
        <FormStatus
          variant="validation_error"
          title="Please check the highlighted fields"
          description="2 fields need attention."
        />
      </VariantRow>
    </VariantStack>
  ),
};

/**
 * Dark mode
 */
export const DarkMode: Story = {
  ...AllVariants,
  globals: { colorScheme: "dark" },
};
