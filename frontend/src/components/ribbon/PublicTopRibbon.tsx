import PublicBurgerButton from "@/components/button/PublicBurgerButton";
import { Anchor, Group } from "@mantine/core";
import classes from "./PublicTopRibbon.module.scss";
import publicNavLinks from "./publicNavLinks";

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
        <>
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
              width={143}
              height={24}
              style={{ height: "1.5rem", width: "auto" }}
            />
          </a>
          <Group component="nav" gap="lg" className={classes.navLinks}>
            {publicNavLinks.map((link) => (
              <Anchor
                key={link.label}
                href={link.href}
                className={classes.navLink}
                underline="never"
                c="inherit"
                fz="xl"
                fw={500}
              >
                {link.label}
              </Anchor>
            ))}
          </Group>
        </>
      )}
    </div>
  );
}
