import PublicBurgerButton from "@/components/button/PublicBurgerButton";
import classes from "./PublicTopRibbon.module.scss";

type Props = {
  /** Callback when hamburger menu is clicked (opens drawer) */
  onBurgerClick: () => void;
  /** Whether the nav drawer/rail is currently open (for a11y) */
  navOpen?: boolean;
  /** Whether to use narrow/mobile layout */
  isNarrow?: boolean;
};

export default function PublicTopRibbon({
  onBurgerClick,
  navOpen = false,
  isNarrow = false,
}: Props) {
  return (
    <div className={classes.cq}>
      {isNarrow ? (
        <div className={classes.left}>
          <PublicBurgerButton navOpen={navOpen} onClick={onBurgerClick} />
        </div>
      ) : (
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            paddingTop: 3,
            marginLeft: "0.8rem",
          }}
        >
          <img
            src="/quill-name-long-white-amber.png"
            alt="Quill Medical"
            style={{ height: "1.5rem" }}
          />
        </a>
      )}
    </div>
  );
}
