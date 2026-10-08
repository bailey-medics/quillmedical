/**
 * MediaDropzone Stories
 *
 * A box to drop one file on. Every caller names the file types it
 * allows, as there is no default: the teaching card allows video, and
 * the passport's certificate uploader document and image types. Either
 * way the type is checked in the browser, before a byte is uploaded.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import DataTable, { type Column } from "@/components/tables/DataTable";
import MediaDropzone, { type MediaDropzoneProps } from "./MediaDropzone";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof MediaDropzone> = {
  title: "Form/Media dropzone",
  component: MediaDropzone,
  parameters: {
    layout: "padded",
  },
  // The teaching card's settings, which every story starts from. There
  // is no default list in the component itself.
  args: {
    onDrop: () => {},
    accept: ["video/mp4", "video/webm", "video/quicktime"],
    label: "Drop a video or click to browse",
  },
};

export default meta;

type Story = StoryObj<typeof MediaDropzone>;

interface Lecture {
  id: string;
  title: string;
}

const lectures: Lecture[] = [
  { id: "intro", title: "Introduction to optical diagnosis" },
  { id: "polyps", title: "Classifying small polyps" },
  { id: "resect", title: "Resect and discard in practice" },
];

/**
 * The box on its own, then in a table row as the teaching media card
 * shows it, one per lecture waiting for its video.
 */
function OnItsOwnAndInATable({
  args,
  note,
}: {
  args: MediaDropzoneProps;
  note?: string;
}) {
  const columns: Column<Lecture>[] = [
    { header: "Lecture", render: (lecture) => lecture.title },
    { header: "Video", render: () => <MediaDropzone {...args} /> },
  ];

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <StoryNote>Neat drop zone button</StoryNote>
        <MediaDropzone {...args} />
        {note && <StoryNote>{note}</StoryNote>}
      </Stack>
      <Stack gap="sm">
        <StoryNote>Drop zone inside a table</StoryNote>
        <DataTable
          data={lectures}
          columns={columns}
          getRowKey={(lecture) => lecture.id}
        />
      </Stack>
    </Stack>
  );
}

export const Default: Story = {
  render: (args) => <OnItsOwnAndInATable args={args} />,
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <OnItsOwnAndInATable
      args={args}
      note="While another upload is in flight."
    />
  ),
};

/** On the dark theme: a lighter blue fill, so it shows on striped rows. */
export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
