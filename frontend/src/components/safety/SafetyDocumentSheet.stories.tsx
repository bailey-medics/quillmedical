/**
 * SafetyDocumentSheet Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import SafetyDocumentSheet from "./SafetyDocumentSheet";
import { SAFETY_CASES, renderDocument } from "@lib/safety";

const safetyCase = SAFETY_CASES[0];

function args(documentId: string) {
  const document = safetyCase.documents.find((d) => d.id === documentId)!;
  return {
    document,
    product: safetyCase.system,
    content: renderDocument(document, safetyCase.placeholders),
  };
}

const meta: Meta<typeof SafetyDocumentSheet> = {
  title: "Safety/Safety document sheet",
  component: SafetyDocumentSheet,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SafetyDocumentSheet>;

export const ClinicalRiskManagementPlan: Story = { args: args("crmp") };
export const HazardLog: Story = { args: args("hazard-log") };
export const ClinicalSafetyCaseReport: Story = { args: args("cscr") };
export const FileIndex: Story = { args: args("file-index") };

export const DarkMode: Story = {
  ...ClinicalRiskManagementPlan,
  globals: { colorScheme: "dark" },
};
