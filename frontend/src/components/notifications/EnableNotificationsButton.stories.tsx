import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Text, Alert } from "@mantine/core";
import EnableNotificationsButton from "./EnableNotificationsButton";

const meta: Meta<typeof EnableNotificationsButton> = {
  title: "Notifications/EnableNotificationsButton",
  component: EnableNotificationsButton,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Button that requests browser notification permission and subscribes to push notifications via service worker. Sends subscription to backend `/api/push/subscribe` endpoint.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof EnableNotificationsButton>;

/**
 * Default button state
 * Click to request notification permission from browser
 */
export const Default: Story = {};

/**
 * Button in context with instructions
 * Shows typical usage in settings page
 */
export const WithInstructions: Story = {
  render: () => (
    <Stack gap="md" maw={400}>
      <div>
        <Text fw={600} mb="xs">
          Push Notifications
        </Text>
        <Text size="sm" c="dimmed" mb="md">
          Enable notifications to receive updates about your messages and
          appointments.
        </Text>
        <EnableNotificationsButton />
      </div>
      <Alert variant="light" color="blue" title="Browser Support Required">
        <Text size="sm">
          This feature requires a modern browser with Service Worker and Push
          API support. The button may not function fully in Storybook's iframe
          environment.
        </Text>
      </Alert>
    </Stack>
  ),
};

/**
 * Technical documentation
 * Explains the notification flow and requirements
 */
export const Documentation: Story = {
  render: () => (
    <Stack gap="lg" maw={600}>
      <div>
        <Text fw={600} mb="xs" size="lg">
          How it works
        </Text>
        <Stack gap="sm">
          <div>
            <Text fw={500} size="sm" mb={4}>
              1. Request Permission
            </Text>
            <Text size="sm" c="dimmed">
              Triggers browser notification permission dialog
            </Text>
          </div>
          <div>
            <Text fw={500} size="sm" mb={4}>
              2. Subscribe via Service Worker
            </Text>
            <Text size="sm" c="dimmed">
              Uses VAPID public key to create push subscription
            </Text>
          </div>
          <div>
            <Text fw={500} size="sm" mb={4}>
              3. Send to Backend
            </Text>
            <Text size="sm" c="dimmed">
              POST subscription to /api/push/subscribe for storage
            </Text>
          </div>
        </Stack>
      </div>

      <Alert variant="light" color="orange" title="Known Limitations">
        <Stack gap="xs">
          <Text size="sm">• Backend stores subscriptions in-memory only</Text>
          <Text size="sm">• No authentication on subscribe endpoint</Text>
          <Text size="sm">• Service worker push event handling incomplete</Text>
        </Stack>
      </Alert>

      <div>
        <Text fw={600} mb="sm">
          Try it:
        </Text>
        <EnableNotificationsButton />
      </div>
    </Stack>
  ),
};

/**
 * Button states
 * Visual reference for all button states (simulated)
 */
export const ButtonStates: Story = {
  render: () => (
    <Stack gap="md">
      <div>
        <Text size="sm" c="dimmed" mb="xs">
          Idle (initial state):
        </Text>
        <button
          style={{
            maxWidth: "150px",
            width: "100%",
            padding: "0.5rem 1rem",
          }}
        >
          Enable notifications
        </button>
      </div>
      <div>
        <Text size="sm" c="dimmed" mb="xs">
          Busy (in progress):
        </Text>
        <button
          disabled
          style={{
            maxWidth: "150px",
            width: "100%",
            padding: "0.5rem 1rem",
          }}
        >
          Enabling…
        </button>
      </div>
      <div>
        <Text size="sm" c="dimmed" mb="xs">
          Success (enabled):
        </Text>
        <button
          disabled
          style={{
            maxWidth: "150px",
            width: "100%",
            padding: "0.5rem 1rem",
          }}
        >
          Notifications enabled
        </button>
      </div>
      <div>
        <Text size="sm" c="dimmed" mb="xs">
          Denied (permission rejected):
        </Text>
        <button
          style={{
            maxWidth: "150px",
            width: "100%",
            padding: "0.5rem 1rem",
          }}
        >
          Permission denied
        </button>
      </div>
      <div>
        <Text size="sm" c="dimmed" mb="xs">
          Error (failed):
        </Text>
        <button
          style={{
            maxWidth: "150px",
            width: "100%",
            padding: "0.5rem 1rem",
          }}
        >
          Error — try again
        </button>
      </div>
    </Stack>
  ),
};
