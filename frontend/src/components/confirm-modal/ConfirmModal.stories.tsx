/**
 * ConfirmModal Component Stories
 *
 * Demonstrates the ConfirmModal for destructive/irreversible actions:
 * - Default with all elements (icon + title + message)
 * - Title only (no icon)
 * - Icon only (no title)
 * - Loading state (accept in progress)
 * - Interactive demo with async handler
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";
import { Stack } from "@mantine/core";
import ConfirmModal from "./ConfirmModal";
import { StoryNote } from "@/stories/variants";
import ButtonPair from "@/components/button/ButtonPair";
import SelectField from "@/components/form/SelectField";

const meta: Meta<typeof ConfirmModal> = {
  title: "Confirm modal/Confirm modal",
  component: ConfirmModal,
  parameters: { layout: "padded" },
  args: {
    opened: true,
    onClose: fn(),
    onAccept: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmModal>;

/** Default — modal with icon, title, and message */
export const Default: Story = {
  args: {
    title: "Delete patient record",
    icon: <IconAlertTriangle />,
    acceptLabel: "Delete",
    submittingLabel: "Deleting…",
    children:
      "This will permanently delete the patient record. This action cannot be undone.",
  },
};

/** Title and message only (no icon) */
export const TitleOnly: Story = {
  args: {
    title: "Remove member",
    acceptLabel: "Remove",
    children:
      "Are you sure you want to remove this member? This action cannot be undone.",
  },
};

/** Icon and message only (no title) */
export const IconOnly: Story = {
  args: {
    icon: <IconAlertTriangle />,
    acceptLabel: "Leave",
    cancelLabel: "Stay",
    children: "You have unsaved changes that will be lost.",
  },
};

/** Interactive demo — click the trigger button to open, confirm to close */
export const Interactive: Story = {
  args: { opened: false },
  render: function InteractiveDemo() {
    const [opened, setOpened] = useState(false);
    const [procedure, setProcedure] = useState<string | null>("bka");
    const [side, setSide] = useState<string | null>("left");

    const procedureLabels: Record<string, string> = {
      tka: "Total knee arthroplasty",
      uka: "Unicompartmental knee arthroplasty",
      aka: "Above-knee amputation",
      bka: "Below-knee amputation",
    };

    const handleAccept = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    };

    return (
      <Stack>
        <StoryNote>Press Submit to see the confirmation modal.</StoryNote>
        <SelectField
          label="Procedure"
          placeholder="Select procedure"
          required
          value={procedure}
          onChange={setProcedure}
          data={[
            { value: "tka", label: "Total knee arthroplasty" },
            { value: "uka", label: "Unicompartmental knee arthroplasty" },
            { value: "aka", label: "Above-knee amputation" },
            { value: "bka", label: "Below-knee amputation" },
          ]}
        />
        <SelectField
          label="Laterality"
          placeholder="Select side"
          required
          value={side}
          onChange={setSide}
          data={[
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
          ]}
        />
        <ButtonPair
          acceptLabel="Submit"
          onAccept={() => setOpened(true)}
          onCancel={() => {}}
        />
        <ConfirmModal
          opened={opened}
          onClose={() => setOpened(false)}
          onAccept={handleAccept}
          title="Confirm procedure booking"
          acceptLabel="Confirm booking"
          submittingLabel="Booking…"
          icon={<IconAlertTriangle />}
        >
          Booking{" "}
          <strong>
            <span style={{ color: "var(--alert-color)" }}>
              {side?.toUpperCase()}
            </span>{" "}
            {procedure ? procedureLabels[procedure] : ""}
          </strong>
          . Confirm?
        </ConfirmModal>
      </Stack>
    );
  },
};

/** Dark mode variant */
export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
