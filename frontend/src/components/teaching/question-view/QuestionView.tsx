/**
 * QuestionView Component
 *
 * Renders a single MCQ item based on the question bank type:
 * - uniform: N images with config-defined labels + config-defined options
 * - variable: item-provided images, text, and options
 *
 * Layout order:
 * 1. Images (max 2 per row on desktop, stacked on mobile)
 * 2. Question title (e.g. "Question 1")
 * 3. Patient history text (if any)
 * 4. Answer options
 * 5. Progress bar
 * 6. Previous/Next navigation buttons
 *
 * The timer and the "End exam" button are not here: the page puts them in
 * the ribbon, through TeachingLayout's `ribbonRight`.
 */

import { Box, Image, SimpleGrid, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import PreviousNextButton from "@components/button/PreviousNextButton";
import RadioField from "@/components/form/RadioField";
import { BodyTextInline, Heading } from "@/components/typography";
import type { CandidateItem, ItemImage } from "@/features/teaching/types";
import { TeachingProgressBar } from "@components/teaching/teaching-progress-bar/TeachingProgressBar";
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

function ImagePanel({ image, single }: { image: ItemImage; single: boolean }) {
  return (
    <Stack gap="xs" align="center" className={classes.imagePanel}>
      <Box
        className={
          single ? classes.imageWrapperSingle : classes.imageWrapperMulti
        }
      >
        <Image
          src={image.url}
          alt={image.label ?? "Question image"}
          className={single ? classes.imageSingle : classes.image}
        />
      </Box>
      {image.label && <BodyTextInline>{image.label}</BodyTextInline>}
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
      {/* Images */}
      {item.images.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: item.images.length > 1 ? 2 : 1 }}>
          {item.images.map((img) => (
            <ImagePanel
              key={img.key}
              image={img}
              single={item.images.length === 1}
            />
          ))}
        </SimpleGrid>
      )}

      {/* Question title */}
      <Heading>Question {item.display_order}</Heading>

      {/* Patient history */}
      {item.text && (
        <BaseCard>
          <BodyTextInline>{item.text}</BodyTextInline>
        </BaseCard>
      )}

      {/* Options */}
      <RadioField
        options={item.options.map((opt) => ({
          value: opt.id,
          label: opt.label,
        }))}
        value={selectedOption}
        onChange={onSelectOption}
        disabled={disabled}
      />

      {/* Progress bar */}
      {currentQuestion != null && totalQuestions != null && (
        <TeachingProgressBar
          label="Question progress"
          current={currentQuestion}
          total={totalQuestions}
        />
      )}

      {/* Navigation buttons */}
      {(onPrevious || onNext || onSubmit) && (
        <PreviousNextButton
          onPrevious={onPrevious}
          onNext={(isLastQuestion ? onSubmit : onNext) ?? (() => {})}
          nextLabel={
            isLastQuestion ? (disabled ? "Finish" : "Submit & finish") : "Next"
          }
          nextDisabled={!selectedOption}
          nextLoading={submitting}
        />
      )}
    </Stack>
  );
}
