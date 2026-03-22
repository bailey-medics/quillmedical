/**
 * QuestionView Component
 *
 * Renders a single MCQ item based on the question bank type:
 * - uniform: N images with config-defined labels + config-defined options
 * - variable: item-provided images, text, and options
 *
 * Optional text block shown below images when present.
 */

import { Card, Group, Image, Radio, Stack, Text, Title } from "@mantine/core";
import type { CandidateItem, ItemImage } from "@/features/teaching/types";
import classes from "./QuestionView.module.css";

interface QuestionViewProps {
  /** The candidate item to display */
  item: CandidateItem;
  /** Currently selected option ID (controlled) */
  selectedOption: string | null;
  /** Called when the user selects an option */
  onSelectOption: (optionId: string) => void;
  /** Whether interaction is disabled (e.g. already answered) */
  disabled?: boolean;
}

function ImagePanel({ image }: { image: ItemImage }) {
  return (
    <Stack gap="xs" align="center" className={classes.imagePanel}>
      <Image
        src={image.url}
        alt={image.label ?? "Question image"}
        radius="md"
        className={classes.image}
      />
      {image.label && (
        <Text size="sm" c="dimmed">
          {image.label}
        </Text>
      )}
    </Stack>
  );
}

export function QuestionView({
  item,
  selectedOption,
  onSelectOption,
  disabled = false,
}: QuestionViewProps) {
  return (
    <Stack gap="lg">
      {/* Images */}
      {item.images.length > 0 && (
        <Group gap="md" justify="center" wrap="wrap">
          {item.images.map((img) => (
            <ImagePanel key={img.key} image={img} />
          ))}
        </Group>
      )}

      {/* Optional item text */}
      {item.text && (
        <Card withBorder p="md">
          <Text>{item.text}</Text>
        </Card>
      )}

      {/* Question number */}
      <Title order={4}>Question {item.display_order}</Title>

      {/* Options */}
      <Radio.Group value={selectedOption ?? ""} onChange={onSelectOption}>
        <Stack gap="sm">
          {item.options.map((opt) => (
            <Radio
              key={opt.id}
              value={opt.id}
              label={opt.label}
              disabled={disabled}
              className={classes.option}
            />
          ))}
        </Stack>
      </Radio.Group>
    </Stack>
  );
}
