import PublicFooter from "@/components/footer/PublicFooter";
import PublicTopRibbon from "@/components/ribbon/PublicTopRibbon";
import { Box, Stack, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { type ReactNode, useState } from "react";

interface PublicLayoutProps {
  /** Page content */
  children: ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const theme = useMantineTheme();
  const isNarrow = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const [navOpen, setNavOpen] = useState(false);

  return (
    <Stack gap={0} style={{ minHeight: "100dvh", background: "#0A1628" }}>
      <Box component="header">
        <PublicTopRibbon
          isNarrow={isNarrow}
          navOpen={navOpen}
          onBurgerClick={() => setNavOpen((o) => !o)}
        />
      </Box>

      <Box component="main" style={{ flex: 1 }}>
        {children}
      </Box>

      <PublicFooter />
    </Stack>
  );
}
