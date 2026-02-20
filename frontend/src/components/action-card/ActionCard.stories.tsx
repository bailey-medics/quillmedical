/**
 * ActionCard Component Stories
 *
 * Demonstrates the ActionCard component with various icons and configurations.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import ActionCard from "./ActionCard";
import {
  IconUserPlus,
  IconFileText,
  IconSettings,
  IconMail,
  IconCalendar,
  IconChartBar,
} from "@tabler/icons-react";
import { Container } from "@mantine/core";

const meta = {
  title: "ActionCard/ActionCard",
  component: ActionCard,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <Container size="lg">
        <Story />
      </Container>
    ),
  ],
  argTypes: {
    icon: {
      control: false,
      description: "Icon element from @tabler/icons-react",
    },
  },
} satisfies Meta<typeof ActionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default ActionCard
 *
 * Basic action card with icon, title, subtitle, and button.
 * Icons default to "lg" size (48px desktop, 32px mobile).
 */
export const Default: Story = {
  args: {
    icon: <IconUserPlus />,
    title: "Add User",
    subtitle: "Create a new user account with competencies and permissions",
    buttonLabel: "Add New User",
    buttonUrl: "/admin/users/new",
  },
};

/**
 * With onClick Handler
 *
 * ActionCard that uses onClick instead of navigation.
 * Useful for opening modals or triggering actions.
 */
export const WithOnClick: Story = {
  args: {
    icon: <IconSettings />,
    title: "Configure Settings",
    subtitle: "Adjust application settings and preferences",
    buttonLabel: "Open Settings",
    buttonUrl: "/settings",
    onClick: () => alert("Settings clicked!"),
  },
};

/**
 * Document Action
 *
 * ActionCard for document-related actions.
 */
export const DocumentAction: Story = {
  args: {
    icon: <IconFileText />,
    title: "Create Document",
    subtitle: "Generate a new clinical document or letter",
    buttonLabel: "New Document",
    buttonUrl: "/documents/new",
  },
};

/**
 * Communication Action
 *
 * ActionCard for messaging and communication features.
 */
export const CommunicationAction: Story = {
  args: {
    icon: <IconMail />,
    title: "Send Message",
    subtitle: "Send a secure message to a patient or colleague",
    buttonLabel: "Compose Message",
    buttonUrl: "/messages/compose",
  },
};

/**
 * Scheduling Action
 *
 * ActionCard for calendar and appointment scheduling.
 */
export const SchedulingAction: Story = {
  args: {
    icon: <IconCalendar />,
    title: "Schedule Appointment",
    subtitle: "Book a new appointment for a patient",
    buttonLabel: "New Appointment",
    buttonUrl: "/appointments/new",
  },
};

/**
 * Analytics Action
 *
 * ActionCard for reports and analytics.
 */
export const AnalyticsAction: Story = {
  args: {
    icon: <IconChartBar />,
    title: "View Reports",
    subtitle: "Access analytics and performance metrics",
    buttonLabel: "Open Dashboard",
    buttonUrl: "/reports",
  },
};

/**
 * Long Content
 *
 * ActionCard with longer title and subtitle text.
 */
export const LongContent: Story = {
  args: {
    icon: <IconUserPlus />,
    title: "Add User Account with Extended Permissions",
    subtitle:
      "Create a new user account with customizable competencies, system permissions, and role-based access control settings for your organization",
    buttonLabel: "Create New User Account",
    buttonUrl: "/admin/users/new",
  },
};
