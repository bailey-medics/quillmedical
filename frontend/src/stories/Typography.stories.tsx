/**
 * Foundations/Typography Overview
 *
 * Design system reference for Quill Medical's typography.
 * Documents font family, type scale, and component usage guidelines.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Divider, Group, Stack, Table, Text, Title } from "@mantine/core";
import { typographyTokens } from "@/theme";

const meta: Meta = {
  title: "Foundations/Typography",
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ */
/*  Overview                                                           */
/* ------------------------------------------------------------------ */

export const Overview: Story = {
  render: () => (
    <Stack gap="xl">
      {/* Font family */}
      <Stack gap="xs">
        <Title order={2}>Font family</Title>
        <Text size="md">
          <strong>Atkinson Hyperlegible Next</strong> — designed by the Braille
          Institute for maximum readability. Self-hosted variable font (100–900
          weight range).
        </Text>
        <Text size="sm" c="dimmed">
          Chosen for clinical accessibility: distinct Il1O0 characters, high
          x-height, open apertures, reduced eye strain over extended shifts.
        </Text>
      </Stack>

      <Divider />

      {/* Type scale */}
      <Stack gap="sm">
        <Title order={2}>Type scale</Title>
        <Text size="sm" c="dimmed">
          Mobile-first sizes that scale up at the sm breakpoint (48em / 768px).
          All values defined in typographyTokens (theme.ts).
        </Text>

        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Token</Table.Th>
              <Table.Th>Mobile</Table.Th>
              <Table.Th>Desktop</Table.Th>
              <Table.Th>Sample</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Object.entries(typographyTokens.fontSizes).map(
              ([name, { mobile, desktop }]) => (
                <Table.Tr key={name}>
                  <Table.Td>
                    <Text fw={600} size="sm">
                      {name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {mobile}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {desktop}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size={name as "xs" | "sm" | "md" | "lg" | "xl"}>
                      The quick brown fox
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ),
            )}
          </Table.Tbody>
        </Table>
      </Stack>

      <Divider />

      {/* Headings */}
      <Stack gap="sm">
        <Title order={2}>Heading scale</Title>
        <Text size="sm" c="dimmed">
          Heading sizes with responsive scaling and fixed line heights.
        </Text>

        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Level</Table.Th>
              <Table.Th>Mobile</Table.Th>
              <Table.Th>Desktop</Table.Th>
              <Table.Th>Line height</Table.Th>
              <Table.Th>Sample</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Object.entries(typographyTokens.headings).map(
              ([name, { mobile, desktop, lineHeight }]) => (
                <Table.Tr key={name}>
                  <Table.Td>
                    <Text fw={600} size="sm">
                      {name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {mobile}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {desktop}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {lineHeight}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Title
                      order={
                        parseInt(name.replace("h", "")) as 1 | 2 | 3 | 4 | 5 | 6
                      }
                    >
                      Heading {name}
                    </Title>
                  </Table.Td>
                </Table.Tr>
              ),
            )}
          </Table.Tbody>
        </Table>
      </Stack>

      <Divider />

      {/* Usage guide */}
      <Stack gap="sm">
        <Title order={2}>When to use what</Title>

        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Component</Table.Th>
              <Table.Th>Use for</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>
                <Text fw={600} size="sm">
                  PageHeader
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">Page titles (one per page, h1)</Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text fw={600} size="sm">
                  HeaderText
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">Section headings within a page (h2)</Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text fw={600} size="sm">
                  BodyText
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  Default body copy — inherits navy text colour
                </Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text fw={600} size="sm">
                  BodyTextInline
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  Inline span with whitespace preservation — data values,
                  messages
                </Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text fw={600} size="sm">
                  BodyTextBold
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  Labels, field names, important inline text
                </Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text fw={600} size="sm">
                  BodyTextMuted
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">Secondary/supporting text — dimmed colour</Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text fw={600} size="sm">
                  BodyTextClamp
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  Truncated previews — message cards, list summaries
                </Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text fw={600} size="sm">
                  ErrorText
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">Validation errors, failure messages</Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text fw={600} size="sm">
                  PlaceholderText
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">Empty states, input placeholders</Text>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Text fw={600} size="sm">
                  HyperlinkText
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">Inline navigation links</Text>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Stack>

      <Divider />

      {/* Character differentiation */}
      <Stack gap="xs">
        <Title order={2}>Character differentiation</Title>
        <Text size="sm" c="dimmed">
          Critical for clinical safety — confusing characters in dosages or IDs
          could cause harm.
        </Text>
        <Group gap="xl" mt="xs">
          <Stack gap={2}>
            <Text size="xl">Il1O0 Qq9g rn m</Text>
            <Text size="xs" c="dimmed">
              xl (32px)
            </Text>
          </Stack>
          <Stack gap={2}>
            <Text size="md">Il1O0 Qq9g rn m</Text>
            <Text size="xs" c="dimmed">
              md (19px)
            </Text>
          </Stack>
          <Stack gap={2}>
            <Text size="xs">Il1O0 Qq9g rn m</Text>
            <Text size="xs" c="dimmed">
              xs (16px)
            </Text>
          </Stack>
        </Group>
      </Stack>
    </Stack>
  ),
};
