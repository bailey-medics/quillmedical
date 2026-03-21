import { colours } from "@/styles/colours";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";

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
  const filled = variant === "filled";

  // Map sizes up one level for ~30% larger buttons
  const sizeMap = { sm: "md", md: "lg", lg: "xl" } as const;
  const mantineSize = sizeMap[size];

  const baseStyles = {
    fontSize: "calc(var(--button-fz) * 1.3)",
    paddingInline: "calc(var(--button-padding-x) * 1.3)",
  };

  const styles = filled
    ? {
        root: {
          ...baseStyles,
          backgroundColor: colours.amber,
          color: "#333",
          border: "none",
          "&:hover": { backgroundColor: colours.amberHover },
        },
      }
    : {
        root: {
          ...baseStyles,
          backgroundColor: "transparent",
          color: colours.amber,
          border: `1px solid ${colours.amber}`,
          "&:hover": { backgroundColor: "rgba(200,150,62,0.1)" },
        },
      };

  if (href && !disabled) {
    return (
      <Button
        component="a"
        href={href}
        size={mantineSize}
        styles={styles}
        onClick={onClick}
      >
        {children}
      </Button>
    );
  }

  return (
    <Button
      size={mantineSize}
      disabled={disabled}
      styles={styles}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
