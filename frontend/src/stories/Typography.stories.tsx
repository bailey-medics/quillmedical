/**
 * Typography System Stories
 *
 * Visual showcase of the 4-size responsive typography system used throughout Quill Medical.
 * Designed for accessibility and readability in healthcare applications.
 *
 * Font sizes scale responsively:
 * - Mobile (< 768px): Smaller sizes for space efficiency
 * - Desktop (≥ 768px): Larger sizes for improved readability
 *
 * See frontend/docs/typography.md for complete documentation.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Stack,
  Title,
  Text,
  Divider,
  Group,
  Paper,
  Table,
} from "@mantine/core";

const meta = {
  title: "Typography/Typography",
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Quill Medical uses a 4-size typography system for consistency and readability. All font sizes are defined in `src/theme.ts`.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Overview of all 4 font sizes in the system
 */
export const FontSizeSystem: Story = {
  render: () => (
    <Stack gap="xl">
      <div>
        <Title order={2} mb="md">
          Font Size System
        </Title>
        <Text c="dimmed" mb="lg">
          Quill Medical uses 4 standardised responsive font sizes, aligned with
          NHS design system accessibility standards. Sizes scale up on
          tablet/desktop (≥768px) for improved readability.
        </Text>
      </div>

      <Paper p="md" withBorder>
        <Stack gap="lg">
          <div>
            <Group gap="xs" mb="xs">
              <Text fw={600} size="sm">
                xl
              </Text>
              <Text c="dimmed" size="sm">
                — 26px mobile → 32px desktop
              </Text>
            </Group>
            <Text size="xl">
              This is extra large text for page headings and primary titles.
              Scales to 32px on desktop for prominence.
            </Text>
          </div>

          <Divider />

          <div>
            <Group gap="xs" mb="xs">
              <Text fw={600} size="sm">
                lg
              </Text>
              <Text c="dimmed" size="sm">
                — 20px mobile → 24px desktop
              </Text>
            </Group>
            <Text size="lg">
              This is large text used for subheadings, section titles, and card
              titles. Scales to 24px on larger displays.
            </Text>
          </div>

          <Divider />

          <div>
            <Group gap="xs" mb="xs">
              <Text fw={600} size="sm">
                md
              </Text>
              <Text c="dimmed" size="sm">
                — 16px mobile → 19px desktop — Default (NHS Standard)
              </Text>
            </Group>
            <Text size="md">
              This is medium text, the default size for body content. Scales to
              19px on desktop following NHS design system standards for improved
              readability.
            </Text>
          </div>

          <Divider />

          <div>
            <Group gap="xs" mb="xs">
              <Text fw={600} size="sm">
                xs / sm
              </Text>
              <Text c="dimmed" size="sm">
                — 14px mobile → 16px desktop
              </Text>
            </Group>
            <Text size="xs">
              This is extra small text used for captions, hints, metadata, and
              secondary information. Grows to 16px on larger screens.
            </Text>
          </div>
        </Stack>
      </Paper>
    </Stack>
  ),
};

/**
 * Heading elements (h1-h6) with their mapped sizes
 */
export const Headings: Story = {
  render: () => (
    <Stack gap="xl">
      <div>
        <Title order={2} mb="md">
          Headings
        </Title>
        <Text c="dimmed" mb="lg">
          Heading sizes are automatically mapped and scale responsively with the
          font size system for optimal readability on all devices.
        </Text>
      </div>

      <Stack gap="md">
        <div>
          <Title order={1}>h1 — Page Heading (26px → 32px)</Title>
          <Text size="sm" c="dimmed">
            Used for main page titles, scales to 32px on desktop
          </Text>
        </div>

        <Divider />

        <div>
          <Title order={2}>h2 — Section Heading (24px → 28px)</Title>
          <Text size="sm" c="dimmed">
            Used for major sections, responsive sizing
          </Text>
        </div>

        <Divider />

        <div>
          <Title order={3}>h3 — Subsection Heading (20px → 24px)</Title>
          <Text size="sm" c="dimmed">
            Used for subsections and card titles
          </Text>
        </div>

        <Divider />

        <div>
          <Title order={4}>h4 — Minor Heading (16px → 19px)</Title>
          <Text size="sm" c="dimmed">
            Used for small section headers, matches body text size on desktop
          </Text>
        </div>

        <Divider />

        <div>
          <Title order={5}>h5 — Smallest Heading (14px → 16px)</Title>
          <Text size="sm" c="dimmed">
            Rarely used, matches small text size
          </Text>
        </div>

        <Divider />

        <div>
          <Title order={6}>h6 — Minimal Heading (14px → 16px)</Title>
          <Text size="sm" c="dimmed">
            Rarely used, matches small text size
          </Text>
        </div>
      </Stack>
    </Stack>
  ),
};

/**
 * Common use cases for each font size
 */
export const UseCases: Story = {
  render: () => (
    <Stack gap="xl">
      <div>
        <Title order={2} mb="md">
          Common Use Cases
        </Title>
        <Text c="dimmed" mb="lg">
          Examples of where each responsive font size should be used in the
          application.
        </Text>
      </div>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Size</Table.Th>
            <Table.Th>Responsive Values</Table.Th>
            <Table.Th>Use For</Table.Th>
            <Table.Th>Example</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr>
            <Table.Td>
              <Text fw={600} size="sm">
                xs / sm
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm" c="dimmed">
                14px → 16px
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">
                Captions, metadata, hints, error messages, form descriptions,
                badges
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm" c="dimmed">
                Last updated 2 hours ago
              </Text>
            </Table.Td>
          </Table.Tr>

          <Table.Tr>
            <Table.Td>
              <Text fw={600} size="sm">
                md
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm" c="dimmed">
                16px → 19px
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">
                Body text, form labels, descriptions, card content, default text
                (NHS standard)
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="md">This is regular paragraph content.</Text>
            </Table.Td>
          </Table.Tr>

          <Table.Tr>
            <Table.Td>
              <Text fw={600} size="sm">
                lg
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm" c="dimmed">
                20px → 24px
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">
                Subheadings, section titles, card titles, callouts
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="lg" fw={600}>
                Patient Demographics
              </Text>
            </Table.Td>
          </Table.Tr>

          <Table.Tr>
            <Table.Td>
              <Text fw={600} size="sm">
                xl
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm" c="dimmed">
                26px → 32px
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">Page headings, hero text, primary titles</Text>
            </Table.Td>
            <Table.Td>
              <Text size="xl" fw={700}>
                User Management
              </Text>
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Stack>
  ),
};

/**
 * Visual comparison of all sizes with different font weights
 */
export const SizeComparison: Story = {
  render: () => (
    <Stack gap="xl">
      <div>
        <Title order={2} mb="md">
          Size Comparison
        </Title>
        <Text c="dimmed" mb="lg">
          Visual comparison of all font sizes with different weights. Resize
          your browser to see responsive scaling at 768px breakpoint.
        </Text>
      </div>

      <Paper p="lg" withBorder>
        <Stack gap="lg">
          <div>
            <Text size="sm" c="dimmed" mb="xs">
              xs / sm (14px mobile → 16px desktop)
            </Text>
            <Group gap="md">
              <Text size="xs" fw={400}>
                Regular
              </Text>
              <Text size="xs" fw={500}>
                Medium
              </Text>
              <Text size="xs" fw={600}>
                Semi-bold
              </Text>
              <Text size="xs" fw={700}>
                Bold
              </Text>
            </Group>
          </div>

          <div>
            <Text size="sm" c="dimmed" mb="xs">
              md (16px mobile → 19px desktop — NHS Default)
            </Text>
            <Group gap="md">
              <Text size="md" fw={400}>
                Regular
              </Text>
              <Text size="md" fw={500}>
                Medium
              </Text>
              <Text size="md" fw={600}>
                Semi-bold
              </Text>
              <Text size="md" fw={700}>
                Bold
              </Text>
            </Group>
          </div>

          <div>
            <Text size="sm" c="dimmed" mb="xs">
              lg (20px mobile → 24px desktop)
            </Text>
            <Group gap="md">
              <Text size="lg" fw={400}>
                Regular
              </Text>
              <Text size="lg" fw={500}>
                Medium
              </Text>
              <Text size="lg" fw={600}>
                Semi-bold
              </Text>
              <Text size="lg" fw={700}>
                Bold
              </Text>
            </Group>
          </div>

          <div>
            <Text size="sm" c="dimmed" mb="xs">
              xl (26px mobile → 32px desktop)
            </Text>
            <Group gap="md">
              <Text size="xl" fw={400}>
                Regular
              </Text>
              <Text size="xl" fw={500}>
                Medium
              </Text>
              <Text size="xl" fw={600}>
                Semi-bold
              </Text>
              <Text size="xl" fw={700}>
                Bold
              </Text>
            </Group>
          </div>
        </Stack>
      </Paper>
    </Stack>
  ),
};

/**
 * Real-world example showing typography in context
 */
export const RealWorldExample: Story = {
  render: () => (
    <Stack gap="xl">
      <div>
        <Title order={2} mb="md">
          Real-World Example
        </Title>
        <Text c="dimmed" mb="lg">
          Typography system in a realistic application context. Text scales
          responsively for optimal readability on all devices following NHS
          accessibility standards.
        </Text>
      </div>

      <Paper p="lg" withBorder>
        <Stack gap="md">
          <Title order={1}>Patient Administration</Title>

          <Text size="sm" c="dimmed">
            Last updated: 19 February 2026, 12:38
          </Text>

          <Divider />

          <Title order={3}>Demographics</Title>

          <Group>
            <div>
              <Text size="sm" c="dimmed">
                Full Name
              </Text>
              <Text size="md" fw={500}>
                Dr. Sarah Johnson
              </Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">
                Date of Birth
              </Text>
              <Text size="md" fw={500}>
                15/03/1985
              </Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">
                NHS Number
              </Text>
              <Text size="md" ff="monospace">
                123 456 7890
              </Text>
            </div>
          </Group>

          <Divider />

          <Title order={3}>Contact Details</Title>

          <Text size="md">
            The patient's primary contact information is listed below. For
            security purposes, please verify identity before sharing sensitive
            information.
          </Text>

          <Text size="sm" c="dimmed" fs="italic">
            Note: Contact details are updated automatically from the FHIR
            server.
          </Text>
        </Stack>
      </Paper>
    </Stack>
  ),
};
