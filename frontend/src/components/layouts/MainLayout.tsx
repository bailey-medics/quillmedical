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
import { Box, Flex, Skeleton, Stack, useMantineTheme } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/auth/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";

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
}: Props) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const { state } = useAuth();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Reset scroll position when navigating to a new page
  useEffect(() => {
    mainRef.current?.scrollTo?.(0, 0);
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

  const DRAWER_W = 260;

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
        bg="white"
        style={{
          zIndex: 100,
          borderBottom: `1px solid ${theme.colors.gray[2]}`,
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
        />
      </Box>

      <Flex flex={1} style={{ overflow: "hidden", position: "relative" }}>
        <NavigationDrawer
          opened={opened}
          onClose={close}
          topOffset={0}
          width={`${DRAWER_W}px`}
        >
          <div style={{ width: DRAWER_W }}>
            <SideNav
              showSearch={isSm}
              showIcons
              onNavigate={close}
              patientNav={patientNav}
            />
          </div>
        </NavigationDrawer>

        <Flex style={{ flex: 1, height: "100%" }}>
          {!isSm && (
            <Box
              component="aside"
              style={{
                borderRight: `1px solid ${theme.colors.gray[2]}`,
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
              px={isSm ? 0 : "md"}
              py={isSm ? 0 : "md"}
            >
              {isLoading ? (
                <Stack gap="md">
                  <Skeleton height={50} radius="md" />
                  <Skeleton height={200} radius="md" />
                  <Skeleton height={150} radius="md" />
                  <Skeleton height={100} radius="md" />
                </Stack>
              ) : (
                children
              )}
            </Box>
            <Footer
              text={footerText}
              loading={footerLoading}
              size={isSm ? "md" : "lg"}
            />
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
}
