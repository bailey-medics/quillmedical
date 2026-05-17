/**
 * TeachingLayout Component
 *
 * Dedicated layout for all teaching pages (learning + assessments).
 * Deliberately excludes patient context for clinical safety — teaching
 * pages have zero access to PHI by design, not by flag.
 *
 * Uses an optional sidebar slot for context-specific navigation:
 * - Learning slides: LearningNav (slide list)
 * - Module hub: ModuleNav (dashboard / learn / assess)
 * - Assessments: no sidebar (full-width content)
 */

import { Box, Flex, useMantineTheme } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import TopRibbon from "@/components/ribbon/TopRibbon";
import Footer from "@/components/footer/Footer";
import NavigationDrawer from "@/components/drawers/NavigationDrawer";
import { useAuth } from "@/auth/AuthContext";
import {
  LAYOUT_RIBBON_Z_INDEX,
  LAYOUT_PADDING_BOTTOM,
  LAYOUT_PADDING_TOP,
  LAYOUT_PADDING_X,
} from "./layoutConstants";

export interface TeachingLayoutProps {
  /** Optional sidebar content (e.g. LearningNav). No sidebar when omitted */
  sidebar?: ReactNode;
  /** Optional sidebar content for mobile drawer. Falls back to sidebar */
  drawerContent?: ReactNode;
  /** Page content */
  children: ReactNode;
  /** Override footer text (defaults to auth context) */
  footerText?: string;
}

export default function TeachingLayout({
  sidebar,
  drawerContent,
  children,
  footerText,
}: TeachingLayoutProps) {
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const [opened, { toggle, close }] = useDisclosure(false);
  const { state } = useAuth();
  const mainRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    mainRef.current?.scrollTo?.(0, 0);
  }, [location.pathname]);

  const resolvedFooterText =
    footerText ??
    (state.status === "authenticated"
      ? `Logged in: ${state.user.username}`
      : undefined);
  const footerLoading = !footerText && state.status === "loading";

  const drawerBody = drawerContent ?? sidebar;
  const hasSidebar = !!sidebar;

  return (
    <Flex
      direction="column"
      h="100dvh"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <Box
        component="header"
        pos="sticky"
        top={0}
        bg="var(--mantine-color-body)"
        style={{
          zIndex: LAYOUT_RIBBON_Z_INDEX,
          flexShrink: 0,
        }}
      >
        <TopRibbon
          onBurgerClick={hasSidebar ? toggle : () => {}}
          isLoading={false}
          patient={null}
          navOpen={opened}
          isNarrow={isSm}
          showSearch={false}
        />
      </Box>

      <Flex flex={1} style={{ overflow: "hidden", position: "relative" }}>
        {hasSidebar && drawerBody && (
          <NavigationDrawer opened={opened} onClose={close}>
            {drawerBody}
          </NavigationDrawer>
        )}

        {!isSm && hasSidebar && (
          <Box
            component="aside"
            style={{
              borderRight: `1px solid var(--card-border, ${theme.colors.gray[2]})`,
              overflowY: "auto",
              flexShrink: 0,
            }}
          >
            {sidebar}
          </Box>
        )}

        <Flex direction="column" flex={1} style={{ height: "100%" }}>
          <Box
            component="main"
            ref={mainRef}
            flex={1}
            style={{ overflowY: "auto" }}
            px={isSm ? 0 : LAYOUT_PADDING_X}
            pt={LAYOUT_PADDING_TOP}
            pb={LAYOUT_PADDING_BOTTOM}
          >
            {children}
          </Box>
          <Footer text={resolvedFooterText} loading={footerLoading} />
        </Flex>
      </Flex>
    </Flex>
  );
}
