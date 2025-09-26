// src/components/navigation/InlineDrawer.tsx
import { FocusTrap, Overlay, Paper } from "@mantine/core";

type Props = {
  opened: boolean;
  onClose: () => void;
  width?: number;
  topOffset?: number; // e.g. header height
  children: React.ReactNode;
};

export default function NavigationDrawer({
  opened,
  onClose,
  width = 260,
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
