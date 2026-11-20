import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Stack } from "@mantine/core";
import DateField from "./DateField";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof DateField> = {
  title: "Form/Date field",
  component: DateField,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof DateField>;

export const Default: Story = {
  args: {
    label: "Observed on",
  },
};

export const WithValue: Story = {
  args: {
    label: "Observed on",
    defaultValue: "2026-03-12",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Performed on",
    description: "The day the procedure happened, not the day you logged it",
  },
};

export const Required: Story = {
  args: {
    label: "Observed on",
    required: true,
  },
};

export const NoFutureDates: Story = {
  render: () => (
    <Stack gap="sm">
      <DateField
        label="Performed on"
        maxDate={new Date()}
        description="Future dates cannot be chosen"
      />
      <StoryNote>
        A logbook entry records something that already happened, so the form
        that uses this passes `maxDate`. The field itself imposes no such rule -
        a certificate expiry is legitimately in the future.
      </StoryNote>
    </Stack>
  ),
};

export const WithError: Story = {
  args: {
    label: "Observed on",
    error: "Enter the date you observed this",
  },
};

export const Clearable: Story = {
  args: {
    label: "Expires on",
    defaultValue: "2027-03-14",
    clearable: true,
  },
};

export const Disabled: Story = {
  args: {
    label: "Signed on",
    defaultValue: "2026-03-14",
    disabled: true,
  },
};

/**
 * The calendar open, so its faded days, weekends and named arrows are
 * checked for contrast in both colour schemes. It opens in a portal, so
 * it is found in the page body rather than the story.
 */
export const CalendarOpen: Story = {
  args: {
    label: "Observed on",
    defaultValue: "2026-03-14",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("textbox"));

    await expect(
      await page.findByRole("button", { name: "Next month" }),
    ).toBeInTheDocument();
  },
};

/** A two-digit year is refused with a message, never guessed. */
export const TwoDigitYear: Story = {
  args: {
    label: "Date of birth",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByRole("textbox"), "1/2/80");
    await userEvent.tab();

    await expect(
      await canvas.findByText("Enter the year in full, for example 1980"),
    ).toBeInTheDocument();
  },
};
