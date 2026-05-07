/**
 * PageFlash Component Stories
 *
 * Demonstrates the PageFlash component which reads flash messages
 * from React Router navigation state and displays them as status cards.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { Stack } from "@mantine/core";
import PageFlash from "./PageFlash";
import { BodyText } from "@/components/typography";
import type { FlashState } from "./PageFlash";

function PageFlashWithContent() {
  return (
    <Stack gap="md">
      <PageFlash />
      <BodyText>Destination page content appears below the flash.</BodyText>
      <BodyText c="gray.6">
        In production, this status card is rendered automatically from React
        Router navigation state. It clears on dismiss or next navigation.
      </BodyText>
    </Stack>
  );
}

function renderStoryWithState(flash: FlashState["flash"]) {
  const router = createMemoryRouter(
    [{ path: "*", element: <PageFlashWithContent /> }],
    {
      initialEntries: [{ pathname: "/", state: { flash } }],
    },
  );

  return <RouterProvider router={router} />;
}

const meta: Meta<typeof PageFlash> = {
  title: "PageFlash/PageFlash",
  component: PageFlash,
  parameters: {
    layout: "fullscreen",
    disableDefaultRouter: true,
  },
};

export default meta;
type Story = StoryObj<typeof PageFlash>;

export const Success: Story = {
  render: () =>
    renderStoryWithState({
      title: "Letter sent",
      description: "Discharge letter has been sent to Dr Jones.",
    }),
};

export const Error: Story = {
  render: () =>
    renderStoryWithState({
      variant: "error",
      title: "Failed to remove staff member",
      description: "The server returned an error. Please try again.",
    }),
};

export const PartialSuccess: Story = {
  render: () =>
    renderStoryWithState({
      variant: "partial_success",
      title: "Letter saved",
      description: "Letter saved to patient record. Delivery to GP queued.",
    }),
};

export const NoDescription: Story = {
  render: () =>
    renderStoryWithState({
      title: "Patient deactivated",
    }),
};
