/**
 * Main Layout Component Module
 *
 * Primary application layout structure providing top navigation ribbon,
 * side navigation panel (desktop), navigation drawer (mobile), and main
 * content area. Responsive layout that adapts to screen size.
 */

import type { Patient } from "@/domains/patient";
import type { NavItem } from "@components/navigation/NestedNavLink";
import NavigationDrawer from "@components/drawers/NavigationDrawer";
import SideNav from "@components/navigation/SideNav";
import TopRibbon from "@components/ribbon/TopRibbon";
import Footer from "@components/footer/Footer";
import OfflineStrip from "@components/offline-strip/OfflineStrip";
import OfflineModal from "@components/offline-modal/OfflineModal";
import {
  PageMessageDisplay,
  PageMessageProvider,
} from "@components/page-message";
import { Box, Flex, Skeleton, Stack, useMantineTheme } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useSearch } from "@lib/search";
import { useLocation, useNavigate } from "react-router-dom";
import { useConnectivity } from "@lib/connectivity";
import {
  LAYOUT_RIBBON_Z_INDEX,
  LAYOUT_PADDING_BOTTOM,
  LAYOUT_PADDING_TOP,
  LAYOUT_PADDING_X,
  LAYOUT_SIDEBAR_WIDTH,
} from "./layoutConstants";

/**
 * MainLayout Props
 */
type Props = {
  /** Currently selected patient (displayed in ribbon) */
  patient: Patient | null;
  /** Whether patient data is loading */
  isLoading?: boolean;
  /** Patient navigation breadcrumbs for the side nav (flat array) */
  patientNav?: NavItem[];
  /** Page content to render in main area */
  children?: ReactNode;
  /** When true, hides burger, sidebar, drawer, search, and patient info */
  examMode?: boolean;
};

/**
 * Main Layout
 *
 * Renders complete application layout with responsive behavior:
 * - Desktop: Fixed side navigation panel
 * - Mobile: Hamburger menu with slide-out drawer
 * - Top ribbon always visible with patient info
 * - Main content area scrollable
 *
 * @param props - Component props
 * @returns Main application layout
 */
export default function MainLayout({
  patient,
  isLoading = false,
  patientNav,
  children,
  examMode = false,
}: Props) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const { state } = useAuth();
  const { showSearch } = useSearch();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Reset scroll position when navigating to a new page
  useEffect(() => {
    mainRef.current?.scrollTo?.(0, 0);
  }, [location.pathname]);

  // Connectivity state for offline strip/modal
  const {
    isOnline,
    isReconnected,
    lastSyncedAt,
    showOfflineModal,
    dismissOfflineModal,
    clearReconnected,
  } = useConnectivity();

  // Clear reconnected strip on route change
  useEffect(() => {
    if (isReconnected) {
      clearReconnected();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on path change
  }, [location.pathname]);

  // Prepare footer text based on auth state
  const footerText =
    state.status === "authenticated"
      ? `Logged in: ${state.user.username}`
      : undefined;

  const footerLoading = state.status === "loading";

  const handlePatientClick = useCallback(() => {
    const main = mainRef.current;
    if (!main) return;
    main.scrollTo({ top: 0, behavior: "smooth" });
    // Also scroll any nested scrollable containers (e.g. Mantine ScrollArea in Messaging)
    main.querySelectorAll<HTMLElement>("*").forEach((el) => {
      if (el.scrollTop > 0) {
        el.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }, []);

  const handlePatientDoubleClick = useCallback(() => {
    if (patient) {
      navigate(`/patients/${patient.id}`);
    }
  }, [patient, navigate]);

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
          onBurgerClick={toggle}
          isLoading={isLoading}
          patient={patient}
          navOpen={opened}
          isNarrow={isSm}
          onPatientClick={handlePatientClick}
          onPatientDoubleClick={handlePatientDoubleClick}
          examMode={examMode}
          showSearch={showSearch}
        />
      </Box>

      {(!isOnline || isReconnected) && lastSyncedAt && (
        <OfflineStrip
          state={isReconnected ? "reconnected" : "offline"}
          lastSyncedAt={lastSyncedAt}
        />
      )}

      <OfflineModal opened={showOfflineModal} onClose={dismissOfflineModal} />

      <Flex flex={1} style={{ overflow: "hidden", position: "relative" }}>
        {!examMode && (
          <NavigationDrawer
            opened={opened}
            onClose={close}
            topOffset={0}
            width={`${LAYOUT_SIDEBAR_WIDTH}px`}
          >
            <div style={{ width: LAYOUT_SIDEBAR_WIDTH }}>
              <SideNav
                showSearch={isSm}
                showIcons
                onNavigate={close}
                patientNav={patientNav}
              />
            </div>
          </NavigationDrawer>
        )}

        <Flex style={{ flex: 1, height: "100%" }}>
          {!isSm && !examMode && (
            <Box
              component="aside"
              w={LAYOUT_SIDEBAR_WIDTH}
              miw={LAYOUT_SIDEBAR_WIDTH}
              style={{
                borderRight: `1px solid var(--card-border, ${theme.colors.gray[2]})`,
                height: "100%",
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              <SideNav
                showSearch={false}
                showIcons={true}
                patientNav={patientNav}
              />
            </Box>
          )}
          <Flex direction="column" flex={1} style={{ height: "100%" }}>
            <Box
              component="main"
              ref={mainRef}
              flex={1}
              style={{ overflowY: "auto" }}
              px={isSm ? "md" : LAYOUT_PADDING_X}
              pt={LAYOUT_PADDING_TOP}
              pb={LAYOUT_PADDING_BOTTOM}
            >
              {isLoading ? (
                <Stack gap="md">
                  <Skeleton height={50} radius="md" />
                  <Skeleton height={200} radius="md" />
                  <Skeleton height={150} radius="md" />
                  <Skeleton height={100} radius="md" />
                </Stack>
              ) : (
                <PageMessageProvider>
                  <PageMessageDisplay />
                  {children}
                </PageMessageProvider>
              )}
            </Box>
            <Footer text={footerText} loading={footerLoading} />
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
}
