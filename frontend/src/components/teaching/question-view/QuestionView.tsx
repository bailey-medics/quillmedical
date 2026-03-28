/**
 * QuestionView Component
 *
 * Renders a single MCQ item based on the question bank type:
 * - uniform: N images with config-defined labels + config-defined options
 * - variable: item-provided images, text, and options
 *
 * Optional text block shown below images when present.
 */

import { Card, Image, Radio, SimpleGrid, Stack } from "@mantine/core";
import PreviousNextButton from "@components/button/PreviousNextButton";
import { BodyText, BodyTextBlack, BodyTextBold } from "@/components/typography";
import type { CandidateItem, ItemImage } from "@/features/teaching/types";
import { AssessmentProgress } from "@components/teaching/assessment-progress/AssessmentProgress";
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
  /** Current question number (1-based) for progress bar */
  currentQuestion?: number;
  /** Total number of questions for progress bar */
  totalQuestions?: number;
  /** Called when Previous is clicked (hidden when undefined) */
  onPrevious?: () => void;
  /** Called when Next is clicked */
  onNext?: () => void;
  /** Called when Submit & finish is clicked (last question) */
  onSubmit?: () => void;
  /** Whether this is the last question (shows Submit & finish) */
  isLastQuestion?: boolean;
  /** Whether the next/submit action is in progress */
  submitting?: boolean;
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
      {image.label && <BodyText>{image.label}</BodyText>}
    </Stack>
  );
}

export function QuestionView({
  item,
  selectedOption,
  onSelectOption,
  disabled = false,
  currentQuestion,
  totalQuestions,
  onPrevious,
  onNext,
  onSubmit,
  isLastQuestion = false,
  submitting = false,
}: QuestionViewProps) {
  return (
    <Stack gap="lg">
      {/* Progress bar */}
      {currentQuestion != null && totalQuestions != null && (
        <AssessmentProgress current={currentQuestion} total={totalQuestions} />
      )}
      {/* Images */}
      {item.images.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: item.images.length > 1 ? 2 : 1 }}>
          {item.images.map((img) => (
            <ImagePanel key={img.key} image={img} />
          ))}
        </SimpleGrid>
      )}

      {/* Optional item text */}
      {item.text && (
        <Card withBorder p="md">
          <BodyTextBlack>{item.text}</BodyTextBlack>
        </Card>
      )}

      {/* Question number */}
      <BodyTextBold>Question {item.display_order}</BodyTextBold>

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

      {/* Navigation buttons */}
      {(onPrevious || onNext || onSubmit) && (
        <PreviousNextButton
          onPrevious={onPrevious}
          onNext={(isLastQuestion ? onSubmit : onNext) ?? (() => {})}
          nextLabel={isLastQuestion ? "Submit & finish" : "Next"}
          nextDisabled={!selectedOption}
          nextLoading={submitting}
        />
      )}
    </Stack>
  );
}
