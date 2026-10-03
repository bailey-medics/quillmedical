/**
 * QuestionView Component
 *
 * Renders a single MCQ item based on the question bank type:
 * - uniform: N images with config-defined labels + config-defined options
 * - variable: item-provided images, text, and options
 *
 * Layout order:
 * 1. Images (max 2 per row on desktop, stacked on mobile). Images sharing
 *    a row are drawn at the same height, whatever their shapes.
 * 2. Question title (e.g. "Question 1")
 * 3. Patient history text (if any)
 * 4. Answer options
 * 5. Progress bar
 * 6. Previous/Next navigation buttons
 *
 * The timer and the "End exam" button are not here: the page puts them in
 * the ribbon, through TeachingLayout's `ribbonRight`.
 */

import { Box, Image, Stack } from "@mantine/core";
import { useState } from "react";
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

/** How many images share a row on a wide screen */
const IMAGES_PER_ROW = 2;

/** Width over height assumed for an image until it has loaded */
const DEFAULT_RATIO = 4 / 3;

/** One image on its own, at its natural shape */
function SingleImage({ image }: { image: ItemImage }) {
  return (
    <Stack gap="xs" align="center">
      <Box className={classes.imageWrapperSingle}>
        <Image
          src={image.url}
          alt={image.label ?? "Question image"}
          className={classes.imageSingle}
        />
      </Box>
      {image.label && <BodyTextInline>{image.label}</BodyTextInline>}
    </Stack>
  );
}

/**
 * Images side by side at one height.
 *
 * Each takes a share of the row's width in proportion to its own width
 * over height, which is what makes the heights come out equal with no
 * cropping and no bars: a narrower picture gets a narrower column. The
 * shapes are read from the images as they load.
 */
function ImageRow({ images }: { images: ItemImage[] }) {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const ratioOf = (image: ItemImage) => ratios[image.url] ?? DEFAULT_RATIO;
  const rowRatio = images.reduce((sum, image) => sum + ratioOf(image), 0);

  return (
    <Box
      className={
        images.length < IMAGES_PER_ROW
          ? `${classes.imageRow} ${classes.imageRowPartial}`
          : classes.imageRow
      }
      __vars={{ "--row-ratio": String(rowRatio) }}
    >
      {images.map((image) => (
        <Stack
          key={image.key}
          gap="xs"
          align="center"
          className={classes.imagePanel}
          __vars={{ "--image-ratio": String(ratioOf(image)) }}
        >
          <Box className={classes.imageWrapperMulti}>
            <Image
              src={image.url}
              alt={image.label ?? "Question image"}
              className={classes.image}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0) {
                  const ratio = naturalWidth / naturalHeight;
                  setRatios((known) => ({ ...known, [image.url]: ratio }));
                }
              }}
            />
          </Box>
          {image.label && <BodyTextInline>{image.label}</BodyTextInline>}
        </Stack>
      ))}
    </Box>
  );
}

/** Split a list into rows of at most `size` */
function inRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    rows.push(items.slice(start, start + size));
  }
  return rows;
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
      {item.images.length === 1 && <SingleImage image={item.images[0]} />}
      {item.images.length > 1 && (
        <Stack gap="md">
          {inRows(item.images, IMAGES_PER_ROW).map((row) => (
            <ImageRow
              key={row.map((image) => image.key).join("|")}
              images={row}
            />
          ))}
        </Stack>
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
