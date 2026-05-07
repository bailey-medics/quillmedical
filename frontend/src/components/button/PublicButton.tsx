import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./PublicButton.module.css";

export interface PublicButtonProps {
  /** Button label */
  children: ReactNode;
  /** Link URL — renders as an anchor when provided */
  href?: string;
  /** Size variant — defaults to md */
  size?: "sm" | "md" | "lg";
  /** Disabled state */
  disabled?: boolean;
  /** Outline variant instead of filled */
  variant?: "filled" | "outline";
  /** Click handler */
  onClick?: () => void;
}

export default function PublicButton({
  children,
  href,
  size = "md",
  disabled = false,
  variant = "filled",
  onClick,
}: PublicButtonProps) {
  // Map sizes up one level for ~30% larger buttons
  const sizeMap = { sm: "md", md: "lg", lg: "xl" } as const;
  const mantineSize = sizeMap[size];

  const sizeStyles = {
    root: {
      fontSize: "calc(var(--button-fz) * 1.3)",
      paddingInline: "calc(var(--button-padding-x) * 1.3)",
    },
  };

  const className = variant === "filled" ? classes.filled : classes.outline;

  if (href && !disabled) {
    return (
      <Button
        component="a"
        href={href}
        size={mantineSize}
        styles={sizeStyles}
        className={className}
        onClick={onClick}
      >
        {children}
      </Button>
    );
  }

  return (
    <Button
      size={mantineSize}
      aria-disabled={disabled || undefined}
      styles={
        disabled
          ? {
              ...sizeStyles,
              root: {
                ...sizeStyles.root,
                opacity: 0.6,
                cursor: "not-allowed",
              },
            }
          : sizeStyles
      }
      className={className}
      onClick={disabled ? (e: React.MouseEvent) => e.preventDefault() : onClick}
    >
      {children}
    </Button>
  );
}
