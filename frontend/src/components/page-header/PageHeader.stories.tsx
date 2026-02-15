/**
 * PageHeader Component Stories
 *
 * Demonstrates the PageHeader component with various configurations.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import PageHeader from "./PageHeader";
import { Box } from "@mantine/core";

const meta = {
  title: "PageHeader/PageHeader",
  component: PageHeader,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Box maw={800}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Large Header with Description
 *
 * Default size for main page headers
 */
export const LargeWithDescription: Story = {
  args: {
    title: "Administration",
    description: "Manage users, patients, and system permissions",
    size: "lg",
  },
};

/**
 * Large Header without Description
 *
 * Simpler version without subtitle
 */
export const LargeWithoutDescription: Story = {
  args: {
    title: "Create New User",
    size: "lg",
  },
};

/**
 * Medium Header with Description
 *
 * Good for section headers and medium-priority pages
 */
export const MediumWithDescription: Story = {
  args: {
    title: "Messages",
    description: "View and manage all patient conversations",
    size: "md",
  },
};

/**
 * Medium Header without Description
 *
 * Clean medium-sized header
 */
export const MediumWithoutDescription: Story = {
  args: {
    title: "Settings",
    size: "md",
  },
};

/**
 * Small Header with Description
 *
 * For subsections and minor pages
 */
export const SmallWithDescription: Story = {
  args: {
    title: "Account Details",
    description: "View and edit your account information",
    size: "sm",
  },
};

/**
 * Small Header without Description
 *
 * Minimal header style
 */
export const SmallWithoutDescription: Story = {
  args: {
    title: "Notifications",
    size: "sm",
  },
};

/**
 * Custom Spacing - No Margin
 *
 * Header with no bottom margin
 */
export const NoMargin: Story = {
  args: {
    title: "Compact Header",
    description: "No margin below",
    mb: 0,
  },
};

/**
 * Custom Spacing - Small Margin
 *
 * Header with small bottom margin
 */
export const SmallMargin: Story = {
  args: {
    title: "Header with Small Margin",
    description: "Less space below",
    mb: "sm",
  },
};

/**
 * Long Title
 *
 * Tests how component handles lengthy titles
 */
export const LongTitle: Story = {
  args: {
    title:
      "This is a Very Long Page Title That Tests How the Component Handles Extended Text Content",
    description: "Normal length description",
    size: "lg",
  },
};

/**
 * Long Description
 *
 * Tests how component handles lengthy descriptions
 */
export const LongDescription: Story = {
  args: {
    title: "User Management",
    description:
      "This is a comprehensive description that provides detailed information about what users can expect to find on this page, including all the features and capabilities available to them in this section of the application.",
    size: "lg",
  },
};

/**
 * Special Characters
 *
 * Header with special characters and symbols
 */
export const SpecialCharacters: Story = {
  args: {
    title: "Settings & Configuration - (Admin)",
    description: "Manage app settings, user preferences & system configuration",
    size: "md",
  },
};

/**
 * All Three Sizes Comparison
 *
 * Visual comparison of all size variants
 */
export const AllSizes: Story = {
  render: () => (
    <Box>
      <PageHeader
        title="Large Header"
        description="This is a large header (size='lg')"
        size="lg"
      />
      <PageHeader
        title="Medium Header"
        description="This is a medium header (size='md')"
        size="md"
      />
      <PageHeader
        title="Small Header"
        description="This is a small header (size='sm')"
        size="sm"
        mb={0}
      />
    </Box>
  ),
};

/**
 * Real Page Examples
 *
 * Examples from actual pages in the application
 */
export const RealExamples: Story = {
  render: () => (
    <Box>
      <PageHeader
        title="Messages"
        description="View and manage all patient conversations"
        size="md"
        mb="lg"
      />
      <PageHeader title="Settings" size="md" mb="lg" />
      <PageHeader
        title="Administration"
        description="Manage users, patients, and system permissions"
        size="lg"
        mb="lg"
      />
      <PageHeader title="Create new user" size="lg" mb="lg" />
      <PageHeader title="Create new patient" size="lg" mb={0} />
    </Box>
  ),
};
