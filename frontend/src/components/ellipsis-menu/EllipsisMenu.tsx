/**
 * EllipsisMenu Component
 *
 * A three-dot action menu that opens a dropdown of menu items.
 * Wraps Mantine's Menu with consistent styling and the design system's
 * IconButton trigger. Use for row-level actions in tables and cards.
 */

import type { ReactElement } from "react";
import { ActionIcon, Menu } from "@mantine/core";
import { IconDots } from "@/components/icons/appIcons";
import Icon from "@/components/icons";
import classes from "./EllipsisMenu.module.css";

export interface EllipsisMenuItem {
  /** Display label for the menu item */
  label: string;
  /** Icon element to show before the label */
  icon?: ReactElement;
  /** CSS variable for destructive actions (e.g. "var(--alert-color)") */
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
  return (
    <Menu position="bottom-end" shadow="md">
      <Menu.Target>
        <ActionIcon
          variant="transparent"
          color="gray"
          size={30}
          className={classes.trigger}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          aria-label={ariaLabel}
        >
          <Icon icon={<IconDots />} size="sm" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {items.map((item) => (
          <Menu.Item
            key={item.label}
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
