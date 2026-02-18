/**
 * Navigation Drawer Component
 *
 * Mobile slide-out navigation drawer with overlay backdrop. Displays
 * navigation content in a panel that slides in from the left side.
 * Includes focus trap for accessibility.
 */

// src/components/navigation/InlineDrawer.tsx
import { FocusTrap, Overlay, Paper } from "@mantine/core";

/**
 * NavigationDrawer Props
 */
type Props = {
  /** Whether the drawer is currently open */
  opened: boolean;
  /** Callback when user closes drawer (clicks overlay or navigates) */
  onClose: () => void;
  /** Width of the drawer panel (default: "16.25rem") */
  width?: string;
  /** Offset from top to account for header height (default: 0) */
  topOffset?: number;
  /** Navigation content to render inside drawer */
  children: React.ReactNode;
};

/**
 * Navigation Drawer
 *
 * Renders slide-out navigation drawer for mobile with:
 * - Animated slide-in from left
 * - Semi-transparent backdrop overlay
 * - Focus trap to keep keyboard navigation within drawer
 * - Click-outside-to-close functionality
 *
 * @param props - Component props
 * @returns Navigation drawer with overlay
 */
export default function NavigationDrawer({
  opened,
  onClose,
  width = "16.25rem",
  topOffset = 0,
  children,
}: Props) {
  return (
    <>
      {opened && (
        <Overlay
          onClick={onClose}
          opacity={0.4}
          blur={2}
          radius={0}
          style={{
            position: "absolute",
            top: topOffset,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 15,
          }}
        />
      )}

      <FocusTrap active={opened}>
        <Paper
          id="app-navbar"
          role="dialog"
          aria-modal="true"
          shadow="md"
          p="xs"
          withBorder
          style={{
            position: "absolute",
            top: topOffset,
            bottom: 0,
            left: 0,
            width,
            zIndex: 16,
            transform: opened ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 150ms ease",
            background: "white",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </Paper>
      </FocusTrap>
    </>
  );
}
