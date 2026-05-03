import type { Meta, StoryObj, Decorator } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import Divider from "@/components/divider/Divider";
import FormattedDate from "./Date";
import BodyText from "@/components/typography/BodyText";
import BodyTextInline from "@/components/typography/BodyTextInline";
import Heading from "@/components/typography/Heading";

const bodyTextDecorator: Decorator[] = [
  (Story) => (
    <BodyText>
      <Story />
    </BodyText>
  ),
];

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
  decorators: bodyTextDecorator,
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
  decorators: bodyTextDecorator,
  args: {
    date: "1980-09-15",
    locale: "en-US",
  },
};

/**
 * Medium format with abbreviated month
 */
export const Medium: Story = {
  decorators: bodyTextDecorator,
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
  decorators: bodyTextDecorator,
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
  decorators: bodyTextDecorator,
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
          <Heading>British English (en-GB)</Heading>
          <Stack gap="xs">
            <div>
              <BodyTextInline>Short:</BodyTextInline>
              <BodyText>
                <FormattedDate date={testDate} locale="en-GB" format="short" />
              </BodyText>
            </div>
            <div>
              <BodyTextInline>Medium:</BodyTextInline>
              <BodyText>
                <FormattedDate date={testDate} locale="en-GB" format="medium" />
              </BodyText>
            </div>
            <div>
              <BodyTextInline>Long:</BodyTextInline>
              <BodyText>
                <FormattedDate date={testDate} locale="en-GB" format="long" />
              </BodyText>
            </div>
            <div>
              <BodyTextInline>Full:</BodyTextInline>
              <BodyText>
                <FormattedDate date={testDate} locale="en-GB" format="full" />
              </BodyText>
            </div>
          </Stack>
        </div>

        <Divider />

        <div>
          <Heading>American English (en-US)</Heading>
          <Stack gap="xs">
            <div>
              <BodyTextInline>Short:</BodyTextInline>
              <BodyText>
                <FormattedDate date={testDate} locale="en-US" format="short" />
              </BodyText>
            </div>
            <div>
              <BodyTextInline>Medium:</BodyTextInline>
              <BodyText>
                <FormattedDate date={testDate} locale="en-US" format="medium" />
              </BodyText>
            </div>
            <div>
              <BodyTextInline>Long:</BodyTextInline>
              <BodyText>
                <FormattedDate date={testDate} locale="en-US" format="long" />
              </BodyText>
            </div>
            <div>
              <BodyTextInline>Full:</BodyTextInline>
              <BodyText>
                <FormattedDate date={testDate} locale="en-US" format="full" />
              </BodyText>
            </div>
          </Stack>
        </div>
      </Stack>
    );
  },
};
