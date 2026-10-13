import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Center } from "@mantine/core";
import { LoginForm } from "@components/registration";
import { StoryNote, VariantRow, VariantStack } from "@/stories/variants";
import QuillSpinner from "./QuillSpinner";

const SPINNER_SHOWS_FOR_MS = 3_000;
const LOGIN_SHOWS_FOR_MS = 10_000;

/**
 * The wait before the sign-in screen, on a loop: the spinner, then the
 * screen it gives way to, then round again. Centred as the app centres a
 * spinner that stands in for a whole page.
 */
function StartUpLoop() {
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    const timer = setTimeout(
      () => setStarting(!starting),
      starting ? SPINNER_SHOWS_FOR_MS : LOGIN_SHOWS_FOR_MS,
    );

    return () => clearTimeout(timer);
  }, [starting]);

  if (starting) {
    return (
      <Center mih="60dvh">
        <QuillSpinner size="8rem" />
      </Center>
    );
  }

  return (
    <LoginForm
      title="Sign in to Quill Medical"
      registerPath={null}
      onSubmit={() => new Promise(() => {})}
    />
  );
}

const meta: Meta<typeof QuillSpinner> = {
  title: "Feedback/Quill spinner",
  component: QuillSpinner,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof QuillSpinner>;

/**
 * The quill turns about its shaft. A screen reader hears "Loading"; the
 * graphic itself is hidden from it.
 */
export const Default: Story = {
  render: (args) => (
    <>
      <QuillSpinner {...args} />
      <StoryNote>
        Screen readers hear &quot;Loading&quot;. With &quot;reduce motion&quot;
        switched on in the device settings, the quill stays still and fades in
        and out.
      </StoryNote>
    </>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="2rem">
        <QuillSpinner size="2rem" />
      </VariantRow>
      <VariantRow label="4rem (default)">
        <QuillSpinner />
      </VariantRow>
      <VariantRow label="8rem">
        <QuillSpinner size="8rem" />
      </VariantRow>
    </VariantStack>
  ),
};

/**
 * How starting the app will look: the spinner for three seconds, then the
 * sign-in screen for ten, and round again.
 */
export const LoadingQuillApp: Story = {
  name: "Loading Quill app",
  globals: { colorScheme: "light" },
  // The note goes above here, not below: what is under it changes height
  // every few seconds, and a note beneath would jump about with it.
  render: () => (
    <>
      <StoryNote mt={0}>
        What somebody sees when they open Quill. The spinner shows while the app
        starts, here for three seconds, then gives way to the sign-in screen.
        That stays for ten seconds and the loop starts again.
      </StoryNote>
      <StartUpLoop />
    </>
  ),
};

export const DarkMode: Story = {
  globals: { colorScheme: "dark" },
};
