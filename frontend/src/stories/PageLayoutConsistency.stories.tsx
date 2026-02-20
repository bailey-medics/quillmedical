/**
 * Page Layout Consistency Stories
 *
 * Visual verification that all pages use consistent max-width (1140px via Container size="lg").
 * This helps catch layout inconsistencies during visual regression testing.
 *
 * All pages should render with the same content width for a cohesive user experience.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Title, Text, Paper } from "@mantine/core";
import Home from "@/pages/Home";
import Messages from "@/pages/Messages";
import Settings from "@/pages/Settings";
import AdminPatientsPage from "@/pages/admin/AdminPatientsPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminPermissionsPage from "@/pages/admin/AdminPermissionsPage";

const meta = {
  title: "Layout/Page Layout Consistency",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "All pages should use `<Container size='lg'>` for consistent 1140px max-width. This story visually verifies the pattern is followed.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Visual comparison of all main pages showing consistent width
 */
export const AllPages: Story = {
  render: () => (
    <Stack gap={0}>
      <Paper p="md" bg="blue.0">
        <Title order={3}>Home Page</Title>
        <Text size="sm" c="dimmed">
          Should have 1140px max-width from Container size="lg"
        </Text>
      </Paper>
      <div style={{ borderBottom: "2px solid red" }}>
        <Home />
      </div>

      <Paper p="md" bg="green.0" mt="xl">
        <Title order={3}>Messages Page</Title>
        <Text size="sm" c="dimmed">
          Should match Home width exactly
        </Text>
      </Paper>
      <div style={{ borderBottom: "2px solid red" }}>
        <Messages />
      </div>

      <Paper p="md" bg="yellow.0" mt="xl">
        <Title order={3}>Settings Page</Title>
        <Text size="sm" c="dimmed">
          Should match Home/Messages width exactly
        </Text>
      </Paper>
      <div style={{ borderBottom: "2px solid red" }}>
        <Settings />
      </div>

      <Paper p="md" bg="grape.0" mt="xl">
        <Title order={3}>Admin Patients Page</Title>
        <Text size="sm" c="dimmed">
          Should match other pages width exactly
        </Text>
      </Paper>
      <div style={{ borderBottom: "2px solid red" }}>
        <AdminPatientsPage />
      </div>

      <Paper p="md" bg="pink.0" mt="xl">
        <Title order={3}>Admin Users Page</Title>
        <Text size="sm" c="dimmed">
          Should match other pages width exactly
        </Text>
      </Paper>
      <div style={{ borderBottom: "2px solid red" }}>
        <AdminUsersPage />
      </div>

      <Paper p="md" bg="cyan.0" mt="xl">
        <Title order={3}>Admin Permissions Page</Title>
        <Text size="sm" c="dimmed">
          Should match other pages width exactly
        </Text>
      </Paper>
      <div style={{ borderBottom: "2px solid red" }}>
        <AdminPermissionsPage />
      </div>

      <Paper p="lg" bg="gray.1" mt="xl">
        <Title order={4}>Visual Check</Title>
        <Text size="sm">
          All red vertical lines should align perfectly at the same width. If
          they don't, a page is missing the Container size="lg" wrapper.
        </Text>
      </Paper>
    </Stack>
  ),
};

/**
 * Individual page examples
 */
export const HomePage: Story = {
  render: () => <Home />,
  parameters: {
    docs: {
      description: {
        story: "Home page should have 1140px max-width container",
      },
    },
  },
};

export const MessagesPage: Story = {
  render: () => <Messages />,
  parameters: {
    docs: {
      description: {
        story: "Messages page should have 1140px max-width container",
      },
    },
  },
};

export const SettingsPage: Story = {
  render: () => <Settings />,
  parameters: {
    docs: {
      description: {
        story: "Settings page should have 1140px max-width container",
      },
    },
  },
};

export const AdminPatientsPageStory: Story = {
  render: () => <AdminPatientsPage />,
  parameters: {
    docs: {
      description: {
        story: "Admin patients page should have 1140px max-width container",
      },
    },
  },
};

export const AdminUsersPageStory: Story = {
  render: () => <AdminUsersPage />,
  parameters: {
    docs: {
      description: {
        story: "Admin users page should have 1140px max-width container",
      },
    },
  },
};

export const AdminPermissionsPageStory: Story = {
  render: () => <AdminPermissionsPage />,
  parameters: {
    docs: {
      description: {
        story: "Admin permissions page should have 1140px max-width container",
      },
    },
  },
};
