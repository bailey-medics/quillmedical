/**
 * QuillSpinner Component
 *
 * The Quill feather, turning: the one spinner Quill shows for a wait.
 * Use it as it is for part of a page that is already on screen, and
 * `PageSpinner` where the wait stands in for the whole page. The small
 * ring inside a button is the only other spinner, and stays a plain
 * Mantine `Loader` with `aria-hidden`, because the button already says
 * what is happening and a quill cannot be read at that size.
 *
 * A picture with no text says nothing to a screen reader, so the graphic
 * is hidden from assistive technology and paired with a visually hidden
 * `role="status"` saying "Loading" (WCAG 4.1.3 Status messages).
 *
 * The animation is all in the CSS module, which also says why the quill is
 * drawn three times over. It stills itself for somebody who has asked
 * their device for less motion.
 *
 * Every quill on a page turns in step, by starting as far into the turn
 * as `quillSpinnerClock` says the first has reached. One spinner taking
 * over from another therefore carries on, and does not snap back to face
 * on.
 */

import { useState } from "react";
import { Box, VisuallyHidden, type BoxProps } from "@mantine/core";
import classes from "./QuillSpinner.module.css";
import { QUILL_OUTLINE } from "./quillOutline";
import { quillSpinnerElapsedMs } from "./quillSpinnerClock";

/** One copy of the quill, upright, with the tip of its shaft in place. */
function QuillLayer({ className }: { className: string | undefined }) {
  return (
    <svg
      className={`${classes.layer} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 829.9 829.9"
    >
      <path transform="translate(165.3 805.3)" d={QUILL_OUTLINE} />
    </svg>
  );
}

export interface QuillSpinnerProps {
  /** What is loading, read out by screen readers. Defaults to "Loading". */
  label?: string;
  /** Width and height, as Mantine's `w` and `h` take them. Defaults to 4rem. */
  size?: BoxProps["w"];
}

export default function QuillSpinner({
  label = "Loading",
  size = "4rem",
}: QuillSpinnerProps) {
  // Read once, as the spinner appears: the animation starts then, and a
  // later render must not move it.
  const [elapsedMs] = useState(quillSpinnerElapsedMs);

  return (
    <Box
      className={classes.spinner}
      w={size}
      h={size}
      __vars={{ "--quill-spinner-delay": `${-elapsedMs}ms` }}
    >
      <div className={classes.tilt} aria-hidden="true">
        <div className={classes.spin}>
          <QuillLayer className={classes.face} />
          <QuillLayer className={classes.lit} />
          <QuillLayer className={classes.shadow} />
        </div>
      </div>
      <VisuallyHidden role="status">{label}</VisuallyHidden>
    </Box>
  );
}
