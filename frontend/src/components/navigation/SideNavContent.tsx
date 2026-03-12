/**
 * Side Navigation Content Component
 *
 * Renders the actual navigation links and items for the side navigation.
 * Includes Home, Settings, About, and Logout links with optional icons.
 * Admin section uses NestedNavLink for hierarchical navigation.
 * Dynamically adds patient name and username as children when viewing patient/user admin pages.
 * Separated from SideNav to allow reuse in drawer/desktop contexts.
 */

import { NavLink, Divider, Stack } from "@mantine/core";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "@/lib/api";
import type { Patient } from "@/domains/patient";
import NavIcon from "../icons/NavIcon";
import NestedNavLink, { type NavItem } from "./NestedNavLink";

/**
 * SideNavContent Props
 */
type Props = {
  /** Called after navigation (to close drawer on mobile) */
  onNavigate?: () => void;
  /** Whether to display icons next to labels */
  showIcons?: boolean;
  /** Font size for navigation labels (default: 1.25rem) */
  fontSize?: number;
  /** Currently selected patient (for patient-specific nav) */
  patient?: Patient | null;
};

/**
 * Side Navigation Content
 *
 * Renders navigation link items with optional icons. Handles navigation
 * via React Router and logout functionality via AuthContext.
 *
 * @param props - Component props
 * @returns Navigation links stack
 */
export default function SideNavContent({
  onNavigate,
  showIcons = false,
  fontSize = 1.25,
  patient,
}: Props) {
  const { logout, state } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [patientName, setPatientName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Check if user has admin or superadmin permissions
  const hasAdminAccess =
    state.status === "authenticated" &&
    (state.user.system_permissions === "admin" ||
      state.user.system_permissions === "superadmin");

  // Extract patient ID from URL if on patient admin page
  const patientIdMatch = location.pathname.match(
    /^\/admin\/patients\/([^/]+)$/,
  );
  const patientId = patientIdMatch ? patientIdMatch[1] : null;

  // Extract conversation ID from URL if on messages thread page
  const conversationIdMatch = location.pathname.match(/^\/messages\/([^/]+)$/);
  const conversationId = conversationIdMatch ? conversationIdMatch[1] : null;

  // TODO: Replace with API call when backend implements conversations
  const conversationPatientNames: Record<string, string> = {
    "conv-1": "John Smith",
    "conv-2": "Mary Johnson",
    "conv-3": "Robert Brown",
    "conv-4": "Sarah Davis",
  };
  const conversationPatientName = conversationId
    ? (conversationPatientNames[conversationId] ?? conversationId)
    : null;

  // Extract user ID from URL if on user admin page
  const userIdMatch = location.pathname.match(/^\/admin\/users\/([^/]+)$/);
  const userId = userIdMatch ? userIdMatch[1] : null;

  // Fetch patient name when on patient admin page
  useEffect(() => {
    async function fetchPatientName() {
      if (
        !patientId ||
        patientId === "new" ||
        patientId === "list" ||
        patientId === "edit" ||
        patientId === "deactivate"
      ) {
        setPatientName(null);
        return;
      }

      try {
        const patient = await api.get<{
          name: Array<{ given?: string[]; family?: string }>;
        }>(`/patients/${patientId}`);

        const name = patient.name?.[0];
        const givenName = name?.given?.[0] || "";
        const familyName = name?.family || "";
        const fullName = `${givenName} ${familyName}`.trim();
        setPatientName(fullName || "Unknown Patient");
      } catch (error) {
        console.error("Failed to fetch patient name:", error);
        setPatientName(null);
      }
    }

    fetchPatientName();
  }, [patientId]);

  // Fetch username when on user admin page
  useEffect(() => {
    async function fetchUsername() {
      if (
        !userId ||
        userId === "new" ||
        userId === "list" ||
        userId === "edit" ||
        userId === "deactivate"
      ) {
        setUsername(null);
        return;
      }

      try {
        const user = await api.get<{ username: string }>(`/users/${userId}`);
        setUsername(user.username || "Unknown User");
      } catch (error) {
        console.error("Failed to fetch username:", error);
        setUsername(null);
      }
    }

    fetchUsername();
  }, [userId]);

  const navLinkStyles = {
    root: { fontSize: `${fontSize}rem` },
    label: { fontSize: `${fontSize}rem` },
  };

  // Build Users nav item with optional username child
  const usersNavItem: NavItem = {
    label: "Users",
    href: "/admin/users",
    icon: showIcons ? "user" : undefined,
    children: username
      ? [
          {
            label: username,
            href: `/admin/users/${userId}`,
          },
        ]
      : undefined,
  };

  // Build Patients nav item with optional patient name child
  const patientsNavItem: NavItem = {
    label: "Patients",
    href: "/admin/patients",
    icon: showIcons ? "file" : undefined,
    children: patientName
      ? [
          {
            label: patientName,
            href: `/admin/patients/${patientId}`,
          },
        ]
      : undefined,
  };

  // Admin navigation structure with children
  const adminNavItem: NavItem = {
    label: "Admin",
    href: "/admin",
    icon: showIcons ? "adjustments" : undefined,
    children: [
      usersNavItem,
      patientsNavItem,
      {
        label: "Organisations",
        href: "/admin/organisations",
        icon: showIcons ? "building-community" : undefined,
      },
    ],
  };

  // Detect patient-specific pages (/patients/:id/...)
  const patientPageMatch = location.pathname.match(
    /^\/patients\/([^/]+)(?:\/(.+))?$/,
  );
  const isPatientPage = !!patientPageMatch;
  const patientSubPath = patientPageMatch?.[2] ?? null;

  // Map sub-paths to display labels
  const subPageLabels: Record<string, string> = {
    letters: "Clinical letters",
    messages: "Messages",
    notes: "Clinical notes",
    appointments: "Appointments",
  };

  // Build patient nav item when on a patient page
  let patientNavItem: NavItem | null = null;
  if (isPatientPage && patient) {
    const patientHref = `/patients/${patient.id}`;
    const children: NavItem[] = [];

    if (patientSubPath) {
      // e.g. "messages/gastro-clinic" → topSegment = "messages", rest = "gastro-clinic"
      const segments = patientSubPath.split("/");
      const topSegment = segments[0];
      const subLabel = subPageLabels[topSegment] ?? topSegment;
      const subHref = `${patientHref}/${topSegment}`;

      const subChildren: NavItem[] = [];
      if (segments.length > 1) {
        // Sub-page — show thread/letter with friendly label
        const threadId = segments.slice(1).join("/");
        // Map known fake IDs to friendly names
        const threadLabels: Record<string, Record<string, string>> = {
          messages: {
            "gastro-clinic": "Dr Corbett, Gemma",
            "gp-referral": "Dr Patel",
            "prescription-query": "Pharmacy",
          },
          letters: {
            "letter-1": "Gastro clinic letter",
            "letter-2": "GP referral letter",
            "letter-3": "Routine health review",
          },
        };
        const sectionLabels = threadLabels[topSegment] ?? {};
        subChildren.push({
          label: sectionLabels[threadId] ?? threadId,
          href: `${patientHref}/${patientSubPath}`,
        });
      }

      children.push({
        label: subLabel,
        href: subHref,
        children: subChildren.length > 0 ? subChildren : undefined,
      });
    }

    patientNavItem = {
      label: patient.name,
      href: patientHref,
      icon: showIcons ? "user" : undefined,
      children: children.length > 0 ? children : undefined,
    };
  }

  return (
    <Stack gap={0}>
      {patientNavItem && (
        <>
          <NestedNavLink
            item={patientNavItem}
            onNavigate={onNavigate}
            showIcons={showIcons}
            baseFontSize={fontSize}
          />
          <Divider my="xs" />
        </>
      )}
      <NavLink
        label="Home"
        styles={navLinkStyles}
        onClick={() => {
          navigate("/");
          if (onNavigate) onNavigate();
        }}
        leftSection={showIcons ? <NavIcon name="home" /> : undefined}
      />
      {conversationId ? (
        <NestedNavLink
          item={{
            label: "Messages",
            href: "/messages",
            icon: showIcons ? "message" : undefined,
            children: [
              {
                label: conversationPatientName ?? conversationId,
                href: `/messages/${conversationId}`,
              },
            ],
          }}
          onNavigate={onNavigate}
          showIcons={showIcons}
          baseFontSize={fontSize}
        />
      ) : (
        <NavLink
          label="Messages"
          styles={navLinkStyles}
          onClick={() => {
            navigate("/messages");
            if (onNavigate) onNavigate();
          }}
          leftSection={showIcons ? <NavIcon name="message" /> : undefined}
        />
      )}
      <NavLink
        label="Settings"
        styles={navLinkStyles}
        onClick={() => {
          navigate("/settings");
          if (onNavigate) onNavigate();
        }}
        leftSection={showIcons ? <NavIcon name="settings" /> : undefined}
      />
      {hasAdminAccess && (
        <NestedNavLink
          item={adminNavItem}
          onNavigate={onNavigate}
          showIcons={showIcons}
          baseFontSize={fontSize}
        />
      )}
      <NavLink
        label="Logout"
        styles={navLinkStyles}
        onClick={() => {
          void logout();
          if (onNavigate) onNavigate();
        }}
        leftSection={showIcons ? <NavIcon name="logout" /> : undefined}
      />
    </Stack>
  );
}
