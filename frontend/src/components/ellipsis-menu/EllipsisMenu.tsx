/**
 * EllipsisMenu Component
 *
 * A three-dot action menu that opens a dropdown of menu items.
 * Wraps Mantine's Menu with consistent styling and the design system's
 * IconButton trigger. Use for row-level actions in tables and cards.
 * The trigger is 30px on desktop, where table rows stay compact, and 44px
 * below the sm breakpoint for a finger, as is each item in the dropdown.
 */

import type { ReactElement } from "react";
import { ActionIcon, Menu, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconDots } from "@/components/icons/appIcons";
import Icon from "@/components/icons";
import classes from "./EllipsisMenu.module.css";

export interface EllipsisMenuItem {
  /** Display label for the menu item */
  label: string;
  /** Icon element to show before the label */
  icon?: ReactElement;
  /**
   * A status text colour for a destructive action, such as
   * "var(--alert-text-color)". The item's label is drawn in it, so it
   * must be a text colour: a fill colour such as `--alert-color` is too
   * dark to read on the navy menu in dark mode.
   */
  color?: string;
  /** Click handler */
  onClick: () => void;
}

export interface EllipsisMenuProps {
  /** Menu items to display */
  items: EllipsisMenuItem[];
  /** Accessible label for the trigger button */
  "aria-label": string;
}

export default function EllipsisMenu({
  items,
  "aria-label": ariaLabel,
}: EllipsisMenuProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(
    `(max-width: ${theme.breakpoints.sm})`,
    false,
    { getInitialValueInEffect: false },
  );

  // A trigger that opens an empty menu offers an action that is not there.
  if (items.length === 0) return null;

  // No hidden focus placeholder: a menu may hold only menu items, and
  // focus lands on the first item when it opens.
  return (
    <Menu position="bottom-end" shadow="md" withInitialFocusPlaceholder={false}>
      <Menu.Target>
        <ActionIcon
          variant="transparent"
          color="gray"
          size={isMobile ? 44 : 30}
          className={classes.trigger}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          aria-label={ariaLabel}
        >
          <Icon icon={<IconDots />} size={isMobile ? "md" : "sm"} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {items.map((item) => (
          <Menu.Item
            key={item.label}
            className={classes.touchItem}
            color={item.color}
            leftSection={
              item.icon ? <Icon icon={item.icon} size="md" /> : undefined
            }
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
            }}
          >
            {item.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
