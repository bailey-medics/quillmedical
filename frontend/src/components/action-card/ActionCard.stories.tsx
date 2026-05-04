/**
 * ActionCard Component Stories
 *
 * Demonstrates the ActionCard component with various icons and configurations.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import ActionCard from "./ActionCard";
import {
  IconUserPlus,
  IconMail,
  IconMessage,
  IconBook,
  IconCalendarWeek,
} from "@/components/icons/appIcons";
import { SimpleGrid } from "@mantine/core";

const meta = {
  title: "ActionCard/ActionCard",
  component: ActionCard,
  parameters: {
    layout: "padded",
  },
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

/**
 * Full width
 *
 * ActionCard without max-width, filling the available container width.
 * Useful for standalone call-to-action sections like certificate downloads.
 */
export const FullWidth: Story = {
  args: {
    title: "Certificate",
    subtitle:
      "You have passed this assessment. Download your certificate below as a PDF to keep for your records.",
    buttonLabel: "Download certificate",
    fullWidth: true,
    buttonVariant: "filled",
  },
};

/**
 * Patient page
 *
 * The four action cards shown on the patient detail page, arranged
 * in a responsive 2-column grid matching the live layout.
 */
export const PatientPage: Story = {
  args: {
    icon: <IconMail />,
    title: "Clinical letters",
    subtitle: "View referral letters, clinic letters, and discharge summaries",
    buttonLabel: "View letters",
    buttonUrl: "/patients/1/letters",
  },
  render: () => (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
      <ActionCard
        icon={<IconMail />}
        title="Clinical letters"
        subtitle="View referral letters, clinic letters, and discharge summaries"
        buttonLabel="View letters"
        buttonUrl="/patients/1/letters"
      />
      <ActionCard
        icon={<IconMessage />}
        title="Messaging"
        subtitle="Send and receive secure messages with the care team"
        buttonLabel="Open messages"
        buttonUrl="/patients/1/messages"
      />
      <ActionCard
        icon={<IconBook />}
        title="Clinical notes"
        subtitle="View consultation notes, observations, and clinical records"
        buttonLabel="View notes"
        buttonUrl="/patients/1/notes"
      />
      <ActionCard
        icon={<IconCalendarWeek />}
        title="Appointments"
        subtitle="View upcoming and past appointment history"
        buttonLabel="View appointments"
        buttonUrl="/patients/1/appointments"
      />
    </SimpleGrid>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
