import type { Meta, StoryObj } from "@storybook/react-vite";
import { ItemManagementTable } from "./ItemManagementTable";

const meta: Meta<typeof ItemManagementTable> = {
  title: "Teaching/ItemManagementTable",
  component: ItemManagementTable,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ItemManagementTable>;

export const WithItems: Story = {
  args: {
    items: [
      {
        id: 1,
        question_bank_id: "colonoscopy-optical-diagnosis",
        bank_version: 1,
        images: [{ key: "img1" }, { key: "img2" }],
        text: null,
        options: null,
        correct_option_id: null,
        metadata_json: { diagnosis: "adenoma" },
        status: "published" as const,
        created_at: "2024-12-01T10:00:00Z",
      },
      {
        id: 2,
        question_bank_id: "colonoscopy-optical-diagnosis",
        bank_version: 1,
        images: [{ key: "img1" }, { key: "img2" }],
        text: null,
        options: null,
        correct_option_id: null,
        metadata_json: { diagnosis: "serrated" },
        status: "draft" as const,
        created_at: "2024-12-01T10:00:00Z",
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    items: [],
  },
};
