/**
 * CompetencyPicker Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { useState } from "react";
import { fn } from "storybook/test";
import CompetencyPicker from "./CompetencyPicker";
import { StoryNote } from "@/stories/variants";

const commonlyUsedHere = [
  "prescribe_sact",
  "perform_bronchoscopy",
  "perform_thoracic_ultrasound",
];

const meta: Meta<typeof CompetencyPicker> = {
  title: "Passport/Competency picker",
  component: CompetencyPicker,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CompetencyPicker>;

export const Default: Story = {
  args: {
    value: null,
    onChange: fn(),
    commonlyUsedHere,
  },
};

/**
 * No curated shortlist, so one flat alphabetical list.
 */
export const NoShortlist: Story = {
  args: {
    value: null,
    onChange: fn(),
  },
};

export const WithDescription: Story = {
  args: {
    value: null,
    onChange: fn(),
    commonlyUsedHere,
    description: "What you are asking to be signed off for.",
    required: true,
  },
};

export const Disabled: Story = {
  args: {
    value: "perform_bronchoscopy",
    onChange: fn(),
    commonlyUsedHere,
    disabled: true,
  },
};

/**
 * The shortlist suggests and never restricts — the reason this is a
 * grouped search rather than a filtered list.
 */
export const SuggestsNeverRestricts: Story = {
  render: function SuggestsNeverRestrictsStory() {
    const [value, setValue] = useState<string | null>(null);

    return (
      <Stack gap="sm">
        <CompetencyPicker
          value={value}
          onChange={setValue}
          commonlyUsedHere={commonlyUsedHere}
        />
        <StoryNote>
          Open it: the site&rsquo;s competencies sit under &ldquo;Commonly used
          here&rdquo;, and every other competency under &ldquo;All
          competencies&rdquo; below. Nothing is hidden and nothing is refused.
          The heading says &ldquo;commonly used&rdquo; rather than
          &ldquo;required&rdquo;, because the moment a list reads as the set
          that matters it becomes a syllabus the software is asserting.
        </StoryNote>
      </Stack>
    );
  },
};
