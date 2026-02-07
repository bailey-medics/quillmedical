import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Title, Text, Divider } from "@mantine/core";
import FormattedDate from "./Date";

const meta: Meta<typeof FormattedDate> = {
  title: "Data/Date",
  component: FormattedDate,
  tags: ["autodocs"],
  argTypes: {
    date: {
      control: "text",
      description: "ISO 8601 date string (YYYY-MM-DD)",
    },
    locale: {
      control: "select",
      options: ["en-GB", "en-US"],
      description: "Locale for date formatting",
    },
    format: {
      control: "select",
      options: ["short", "medium", "long", "full"],
      description: "Date format style",
    },
  },
};

export default meta;
type Story = StoryObj<typeof FormattedDate>;

/**
 * Default British format (en-GB, short)
 * Displays as DD/MM/YYYY (e.g., 15/09/1980)
 */
export const BritishShort: Story = {
  args: {
    date: "1980-09-15",
    locale: "en-GB",
  },
};

/**
 * American format (en-US, short)
 * Displays as MM/DD/YYYY (e.g., 09/15/1980)
 */
export const AmericanShort: Story = {
  args: {
    date: "1980-09-15",
    locale: "en-US",
  },
};

/**
 * Medium format with abbreviated month
 */
export const Medium: Story = {
  args: {
    date: "1980-09-15",
    locale: "en-GB",
    format: "medium",
  },
};

/**
 * Long format with full month name
 */
export const Long: Story = {
  args: {
    date: "1980-09-15",
    locale: "en-GB",
    format: "long",
  },
};

/**
 * Full format with weekday and full month name
 */
export const Full: Story = {
  args: {
    date: "1980-09-15",
    locale: "en-GB",
    format: "full",
  },
};

/**
 * Comparison of British vs American formats across all styles
 */
export const Comparison: Story = {
  render: () => {
    const testDate = "1980-09-15";

    return (
      <Stack gap="xl">
        <div>
          <Title order={3} mb="md">
            British English (en-GB)
          </Title>
          <Stack gap="xs">
            <div>
              <Text size="sm" c="dimmed">
                Short:
              </Text>
              <FormattedDate date={testDate} locale="en-GB" format="short" />
            </div>
            <div>
              <Text size="sm" c="dimmed">
                Medium:
              </Text>
              <FormattedDate date={testDate} locale="en-GB" format="medium" />
            </div>
            <div>
              <Text size="sm" c="dimmed">
                Long:
              </Text>
              <FormattedDate date={testDate} locale="en-GB" format="long" />
            </div>
            <div>
              <Text size="sm" c="dimmed">
                Full:
              </Text>
              <FormattedDate date={testDate} locale="en-GB" format="full" />
            </div>
          </Stack>
        </div>

        <Divider />

        <div>
          <Title order={3} mb="md">
            American English (en-US)
          </Title>
          <Stack gap="xs">
            <div>
              <Text size="sm" c="dimmed">
                Short:
              </Text>
              <FormattedDate date={testDate} locale="en-US" format="short" />
            </div>
            <div>
              <Text size="sm" c="dimmed">
                Medium:
              </Text>
              <FormattedDate date={testDate} locale="en-US" format="medium" />
            </div>
            <div>
              <Text size="sm" c="dimmed">
                Long:
              </Text>
              <FormattedDate date={testDate} locale="en-US" format="long" />
            </div>
            <div>
              <Text size="sm" c="dimmed">
                Full:
              </Text>
              <FormattedDate date={testDate} locale="en-US" format="full" />
            </div>
          </Stack>
        </div>
      </Stack>
    );
  },
};

/**
 * Edge cases: invalid dates, empty strings
 */
export const EdgeCases: Story = {
  render: () => (
    <Stack gap="md">
      <div>
        <Text size="sm" c="dimmed">
          Invalid date string:
        </Text>
        <FormattedDate date="not-a-date" />
      </div>
      <div>
        <Text size="sm" c="dimmed">
          Empty string:
        </Text>
        <FormattedDate date="" />
        <Text size="xs" c="dimmed">
          (renders nothing)
        </Text>
      </div>
      <div>
        <Text size="sm" c="dimmed">
          Valid date with styling:
        </Text>
        <FormattedDate date="1980-09-15" fw={700} c="blue" size="lg" />
      </div>
    </Stack>
  ),
};
