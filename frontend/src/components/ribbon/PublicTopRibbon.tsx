/**
 * PublicTopRibbon Component
 *
 * Top navigation bar for public-facing pages. Displays logo and
 * navigation links on desktop, or a hamburger menu on mobile.
 */

import BurgerButton from "@/components/button/BurgerButton";
import PublicButton from "@/components/button/PublicButton";
import { Anchor, Group } from "@mantine/core";
import classes from "./PublicTopRibbon.module.scss";
import publicNavLinks, { LOGIN_URL } from "./publicNavLinks";

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
          <BurgerButton navOpen={navOpen} onClick={onBurgerClick} />
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
          <Group component="nav" gap="sm" className={classes.navLinks}>
            {publicNavLinks.map((link) =>
              link.disabled ? (
                <span
                  key={link.label}
                  className={classes.navLink}
                  style={{ opacity: 0.5, cursor: "default" }}
                >
                  {link.label}
                </span>
              ) : (
                <Anchor
                  key={link.label}
                  href={link.href}
                  className={classes.navLink}
                  underline="never"
                  c="inherit"
                  fw={500}
                >
                  {link.label}
                </Anchor>
              ),
            )}
          </Group>
          {/*
            Outside the nav group, hard right. Logging in leaves the public
            site for the application, so it is an action rather than another
            page, and a returning visitor looks for it in the corner. It is
            the same PublicButton as the "Log in" in the home page hero, so
            the two read as one action.
          */}
          <div className={classes.login}>
            <PublicButton href={LOGIN_URL} size="sm">
              Log in
            </PublicButton>
          </div>
        </>
      )}
    </div>
  );
}
