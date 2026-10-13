/**
 * QuillSpinner Component
 *
 * The Quill feather, turning. For the wait while the app itself starts or
 * reloads, where the brand mark says "Quill is coming" better than a
 * plain ring does. Spinners inside a page or a panel stay
 * `LoadingSpinner`.
 *
 * Like `LoadingSpinner`, the graphic is hidden from assistive technology
 * and paired with a visually hidden `role="status"` saying "Loading"
 * (WCAG 4.1.3 Status messages).
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
import { quillSpinnerElapsedMs } from "./quillSpinnerClock";

/** The feather's outline, drawn from the tip of its shaft. */
const QUILL_PATH =
  "M0 0C-0.1 -0.3 -0.6 -0.2 -0.8 -0.4C-1.3 -1 -4.3 -13.7 -4.8 -15.6C-7.8 -26.4 -10.9 -37.1 -13.6 -47.9C-14.6 -51.7 -15.9 -55.4 -17 -59.3C-18.6 -65.6 -19.5 -72.1 -21.2 -78.5C-24.4 -90.1 -26.6 -102.2 -28.7 -114.1C-30.1 -122.5 -32.1 -130.8 -33.6 -139.2C-37 -157.5 -39.9 -176 -42.2 -194.5C-44.6 -212.8 -47.3 -230.9 -49.2 -249.4C-50.4 -260.9 -51.2 -272.5 -52.5 -283.8C-53 -288.4 -53 -293.1 -53.4 -297.7C-55.3 -315 -55.6 -332.5 -56.9 -349.9C-57.4 -355.8 -57.3 -361.7 -57.6 -367.6C-58.5 -389.1 -58.9 -410.5 -59.1 -431.9C-59.3 -440.5 -58.7 -449.2 -59.2 -457.7C-59.7 -466.9 -58.1 -476.3 -58.6 -485.5C-58.9 -492.7 -58.2 -500.1 -58 -507.3C-57.6 -516.2 -57.7 -525.2 -57 -534.1C-56.5 -539.7 -56 -545.4 -56 -551C-56 -559 -54.6 -566.9 -54.4 -574.8C-54.2 -585 -52.1 -596.4 -51.4 -606.6C-50.7 -617.5 -49 -628.4 -47.8 -639.3C-45.3 -661.8 -41.7 -684.2 -37.8 -706.5C-35.2 -722 -29.8 -737.7 -28.2 -753.2C-34.5 -740 -38.5 -721 -42.4 -706.5C-49.1 -681.5 -55.2 -656.1 -59.9 -630.6C-62.7 -615.8 -65.7 -601.1 -67.8 -586.3C-79.4 -508.4 -83 -429.8 -78.9 -351.6C-77.4 -321.8 -75 -291.8 -71.8 -262.3C-70.7 -251.9 -69.3 -240.4 -67.9 -230.1C-67 -223.6 -65.5 -217.3 -66 -210.7C-68.7 -213.4 -72.4 -217 -74.8 -220.1C-75.6 -221.1 -76.2 -222.3 -77.2 -223.3C-77.9 -224 -78.7 -224.5 -79.3 -225.3C-82 -229.1 -84.3 -233.2 -87 -237.1C-88.5 -239.3 -90.6 -241 -92 -243.3C-93.2 -245.3 -93.9 -247.5 -95.1 -249.5C-98.7 -256 -102.5 -262.2 -105.9 -268.7C-106.5 -269.9 -106.7 -271.2 -107.3 -272.4C-109.3 -276.6 -111.1 -280.8 -113 -285.1C-123.3 -308.2 -131.1 -332.5 -136.6 -357.2C-139.1 -368.3 -141.9 -379.5 -143.5 -390.9C-144.8 -400.3 -146.2 -409.8 -147.4 -419.2C-148.3 -426.9 -148.6 -435 -149.4 -442.8C-149.7 -445 -149.5 -447.4 -149.7 -449.7C-151.3 -469.7 -151.1 -490 -150 -510.1C-147 -565.9 -139 -617.2 -123.3 -671.2C-113.9 -703.4 -101.9 -740.2 -87.7 -770.4C-83.5 -779.4 -78.8 -792.7 -74.1 -801.2C-68.9 -810.6 -65.2 -821 -59.8 -830.4C-55.4 -838.1 -51.9 -846.4 -47.3 -853.9C-40.2 -865.6 -33.3 -877.7 -26 -889.2C-19.5 -899.5 -11.3 -915.2 -4.2 -924.2C-3.1 -925.5 -1.4 -926 0 -926.7C2.8 -925.1 -0.8 -928 1.9 -926.2C5.3 -923.8 7.4 -919.3 9.8 -915.9C10.7 -914.6 11.9 -913.4 12.9 -912C14.9 -909.1 17.1 -903.7 18.7 -900.4C19.5 -898.6 20.7 -897 21.7 -895.2C23.5 -892.1 26.5 -885.2 28.1 -881.7C43.6 -847.3 57.6 -794.3 62.9 -756.8C64.4 -746.5 70.3 -720 68.2 -711.1C67.1 -706.4 55.7 -687.9 52.5 -682.7C47 -673.8 42.3 -664.2 36.8 -655.2C31.2 -646.4 25.9 -637.3 21 -628C24.4 -630.6 15.4 -621.1 22.1 -628.1C26.4 -632.6 30.8 -637.1 34.9 -641.8C35.5 -642.6 36.5 -642.9 37.2 -643.7C40.8 -648 44.9 -651.8 48.8 -655.8C55.9 -663 62.5 -670.9 70.1 -677.7C74.8 -668.1 67.1 -687.1 71.4 -676.4C73.7 -670.6 73.7 -657.9 74.6 -651.2C76.7 -635 76.9 -618.7 77.9 -602.2C78.1 -598.2 77.7 -594.3 77.9 -590.3C78.9 -569.5 76.3 -535.9 73.5 -514.9C72.2 -504.7 71 -494.5 69.4 -484.3C62 -434.9 47.5 -383.5 30.5 -336.7C21.3 -311.4 10.7 -286.7 -0.3 -262.3C-3.8 -254.7 -11.1 -241.5 -13.5 -234.6C-14.2 -232.5 -14.5 -229.9 -14.2 -227.7C-11.2 -204.4 -1.4 -180.6 12.7 -161.4C14.4 -159.2 21.2 -150.8 23 -149.3C26.9 -146 30.4 -142.8 33.2 -138.6C33.1 -137.6 33.4 -136.7 33.2 -135.6C32.2 -130.2 29.6 -124.8 27.8 -119.5C24.3 -108.8 21.1 -98 17.8 -87.1C9.3 -58.6 5.7 -29.1 0 0Z";

/** One copy of the quill, upright, with the tip of its shaft in place. */
function QuillLayer({ className }: { className: string | undefined }) {
  return (
    <svg
      className={`${classes.layer} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 829.9 829.9"
    >
      <path transform="translate(165.3 805.3)" d={QUILL_PATH} />
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
