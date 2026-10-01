/**
 * Let's Do Digital Logo Component
 *
 * Renders the Let's Do Digital logo on a white panel. The logo is a grey
 * and blue mark on a transparent background, and the blue is lost against
 * the navy public pages without a light surface behind it.
 */

import BaseCard from "@components/base-card/BaseCard";
import Image from "@components/images/Image";
import publicAsset from "@lib/publicAsset";
import classes from "./LetsDoDigitalLogo.module.css";

/** The same file the branded emails use, so there is one copy to replace. */
const LOGO_PATH = "/email/ldd-logo.png";

type Props = {
  /** Alt text for accessibility (default: "Let's Do Digital") */
  alt?: string;
  /** Logo height in rem (default: 5) */
  height?: number | string;
};

/**
 * Let's Do Digital Logo
 *
 * Displays the logo inside a white card, so it reads the same on every
 * public background. The mark has no words, so the alt text names it.
 *
 * @param props - Component props
 * @returns Logo image on a white panel
 */
export default function LetsDoDigitalLogo({
  alt = "Let’s Do Digital",
  height = 5,
}: Props) {
  return (
    <BaseCard bg="white">
      <Image
        src={publicAsset(LOGO_PATH)}
        alt={alt}
        height={height}
        className={classes.mark}
      />
    </BaseCard>
  );
}
