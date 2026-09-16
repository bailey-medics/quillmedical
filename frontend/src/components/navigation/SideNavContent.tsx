/**
 * Side Navigation Content Component
 *
 * Renders the actual navigation links and items for the side navigation.
 * Includes Home, Settings, About, and Logout links with optional icons.
 * Admin section uses NestedNavLink for hierarchical navigation.
 * Patient navigation is driven by the patientNav prop passed from the page.
 * Separated from SideNav to allow reuse in drawer/desktop contexts.
 */

import { NavLink, Stack } from "@mantine/core";
import Divider from "@/components/divider/Divider";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useHasFeature } from "@lib/features";
import { useHasCompetency } from "@/lib/cbac/hooks";
import { api } from "@/lib/api";
import { orgUnits } from "@/domains/orgUnit";
import NavIcon from "../icons/NavIcon";
import NestedNavLink, { type NavItem } from "./NestedNavLink";
import { navLinkStyles } from "./navStyles";

/**
 * SideNavContent Props
 */
type Props = {
  /** Called after navigation (to close drawer on mobile) */
  onNavigate?: () => void;
  /** Whether to display icons next to labels */
  showIcons?: boolean;
  /** Patient navigation breadcrumbs — flat array converted to nested tree */
  patientNav?: NavItem[];
};

/**
 * Side Navigation Content
 *
 * Renders navigation link items with optional icons. Handles navigation
 * via React Router and logout functionality via AuthContext.
 * Patient navigation is driven explicitly by the patientNav prop.
 *
 * @param props - Component props
 * @returns Navigation links stack
 */

export default function SideNavContent({
  onNavigate,
  showIcons = false,
  patientNav,
}: Props) {
  const { logout, state } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [patientName, setPatientName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [orgNavChildren, setOrgNavChildren] = useState<NavItem[] | undefined>(
    undefined,
  );
  const [bankTitle, setBankTitle] = useState<string | null>(null);

  // The admin link should advertise exactly what `/admin` requires, or
  // it offers a route that answers 404.
  const hasAdminAccess = useHasCompetency("manage_users");

  // Check if teaching feature is enabled for this user's organisation
  const hasTeaching = useHasFeature("teaching");
  const canManageContent = useHasCompetency("manage_teaching_content");

  // The passport link asks both questions the route asks, unlike
  // teaching, which gates its entry on the feature alone. The passport
  // routes carry RequireFeature *and* RequireCompetency, so an entry
  // shown on the feature alone would lead some users to a 404.
  // Both hooks are called unconditionally and combined afterwards: `&&`
  // between them short-circuits the second, so the hook order changes
  // with the feature flag.
  const passportEnabled = useHasFeature("passport");
  const canUsePassport = useHasCompetency("access_clinician_passport");
  const hasPassport = passportEnabled && canUsePassport;

  // Check if clinical services (FHIR/EHRbase) are available
  const hasClinicalServices =
    state.status === "authenticated" &&
    (state.user.clinical_services_enabled ?? true);

  // Don't render nav while auth is loading to avoid layout flicker
  // (Admin link appears after auth resolves, shifting Logout down)
  const isLoading = state.status === "loading";

  // Extract patient ID from URL if on patient admin page
  const patientIdMatch = location.pathname.match(
    /^\/admin\/patients\/([^/]+)$/,
  );
  const patientId = patientIdMatch ? patientIdMatch[1] : null;

  // Extract user ID from URL if on user admin page
  const userIdMatch = location.pathname.match(/^\/admin\/users\/([^/]+)/);
  const userId = userIdMatch ? userIdMatch[1] : null;

  // Extract org ID from URL if on organisation admin page
  const orgIdMatch = location.pathname.match(
    /^\/admin\/organisations\/([^/]+)/,
  );
  const orgId = orgIdMatch ? orgIdMatch[1] : null;

  // Detect org sub-page (e.g. "features")
  const orgSubPage =
    location.pathname.match(/^\/admin\/organisations\/[^/]+\/([^/]+)/)?.[1] ??
    null;

  // Extract site ID from URL if on site admin page
  const siteIdMatch = location.pathname.match(/^\/admin\/sites\/([^/]+)/);
  const siteId = siteIdMatch ? siteIdMatch[1] : null;

  // Detect site sub-page (e.g. "edit")
  const siteSubPage =
    location.pathname.match(/^\/admin\/sites\/[^/]+\/([^/]+)/)?.[1] ?? null;

  // Extract teaching sub-section from URL (centres, modules, or all-delegates)
  const teachingSectionMatch = location.pathname.match(
    /^\/admin\/teaching\/(centres|modules|all-delegates)/,
  );
  const teachingSection = teachingSectionMatch ? teachingSectionMatch[1] : null;

  // Extract bank ID from URL if on teaching bank admin page
  const bankIdMatch = location.pathname.match(
    /^\/admin\/teaching\/modules\/([^/]+)/,
  );
  const bankId = bankIdMatch ? bankIdMatch[1] : null;

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

  // Fetch org/site breadcrumb — single effect to avoid flicker during transitions
  useEffect(() => {
    let cancelled = false;

    async function fetchOrgNav() {
      // Sentence case, and named here rather than capitalised from the
      // address — "add-staff" became "Add-staff" on screen.
      const subPageLabels: Record<string, string> = {
        features: "Features",
        edit: "Edit",
        "add-staff": "Add staff",
        "add-patient": "Add patient",
        "add-site": "Add site",
      };

      // Both branches read the same address, because an organisation and
      // a site are the same kind of thing now. The old code asked
      // `/organisations/{id}` with what is a place id, which answered
      // about whichever organisation happened to hold that number.
      const placeId = orgId ?? siteId;
      // "new" is a page, not a place. Asking about it used to produce a
      // failed request on every visit to the create form.
      if (!placeId || !/^\d+$/.test(placeId)) {
        setOrgNavChildren(undefined);
        return;
      }

      try {
        const place = await orgUnits.get(Number(placeId));
        if (cancelled) return;

        const subPage = orgId ? orgSubPage : siteSubPage;
        const subPageLabel = subPage ? subPageLabels[subPage] : undefined;
        const base = orgId
          ? `/admin/organisations/${placeId}`
          : `/admin/sites/${placeId}`;

        const placeItem: NavItem = {
          label: place.name || "Unknown place",
          href: base,
          children: subPageLabel
            ? [{ label: subPageLabel, href: `${base}/${subPage}` }]
            : undefined,
        };

        // The place above may be a building rather than the trust, so
        // which page to link to comes from the server rather than from
        // assuming everything hangs straight off an organisation.
        if (place.parent_id !== null && place.parent_name) {
          setOrgNavChildren([
            {
              label: place.parent_name,
              href: place.parent_is_root
                ? `/admin/organisations/${place.parent_id}`
                : `/admin/sites/${place.parent_id}`,
              children: [placeItem],
            },
          ]);
        } else {
          setOrgNavChildren([placeItem]);
        }
      } catch (error) {
        console.error("Failed to fetch place name:", error);
        if (!cancelled) setOrgNavChildren(undefined);
      }
    }

    fetchOrgNav();
    return () => {
      cancelled = true;
    };
  }, [orgId, orgSubPage, siteId, siteSubPage]);

  // Fetch bank title when on teaching bank admin page
  useEffect(() => {
    async function fetchBankTitle() {
      if (!bankId) {
        setBankTitle(null);
        return;
      }

      try {
        const bank = await api.get<{ title: string }>(
          `/teaching/admin/banks/${bankId}`,
        );
        setBankTitle(bank.title || "Unknown bank");
      } catch (error) {
        console.error("Failed to fetch bank title:", error);
        setBankTitle(null);
      }
    }

    fetchBankTitle();
  }, [bankId]);

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

  // Compute Organisations nav children.
  // When on a site page, ensure the children include the site href so
  // isActiveOrParent keeps the nav expanded (prevents collapse flicker).
  const orgNavEffective: NavItem[] | undefined = (() => {
    if (siteId) {
      const siteHref = `/admin/sites/${siteId}`;
      const containsSiteHref = (items: NavItem[]): boolean =>
        items.some(
          (c) =>
            c.href === siteHref || (c.children && containsSiteHref(c.children)),
        );
      // If fetched children already contain the site link, use them
      if (orgNavChildren && containsSiteHref(orgNavChildren)) {
        return orgNavChildren;
      }
      // Otherwise show a loading placeholder so the nav stays expanded
      return orgNavChildren
        ? [...orgNavChildren, { label: "…", href: siteHref }]
        : [{ label: "…", href: siteHref }];
    }
    return orgNavChildren;
  })();

  // Admin navigation structure with children
  const adminNavItem: NavItem = {
    label: "Admin",
    href: "/admin",
    icon: showIcons ? "adjustments" : undefined,
    children: [
      usersNavItem,
      ...(hasClinicalServices ? [patientsNavItem] : []),
      {
        label: "Organisations",
        href: "/admin/organisations",
        icon: showIcons ? "building-community" : undefined,
        children: orgNavEffective,
      } satisfies NavItem,
      // The sites of one organisation already hang under it above. This
      // is the way in for somebody who knows the site but not which
      // organisation owns it, which until now was no way in at all.
      {
        label: "Sites",
        href: "/admin/sites",
        icon: showIcons ? "building-hospital" : undefined,
      } satisfies NavItem,
      ...(hasTeaching
        ? [
            {
              label: "Teaching",
              href: "/admin/teaching",
              icon: showIcons ? "teaching" : undefined,
              children:
                teachingSection === "centres"
                  ? [
                      {
                        label: "Centres",
                        href: "/admin/teaching/centres",
                      },
                    ]
                  : teachingSection === "modules"
                    ? [
                        {
                          label: "Modules",
                          href: "/admin/teaching/modules",
                          children: bankTitle
                            ? [
                                {
                                  label:
                                    bankTitle.length > 8
                                      ? `${bankTitle.slice(0, 8)}…`
                                      : bankTitle,
                                  href: `/admin/teaching/modules/${bankId}`,
                                },
                              ]
                            : undefined,
                        },
                      ]
                    : teachingSection === "all-delegates"
                      ? [
                          {
                            label: "All delegates",
                            href: "/admin/teaching/all-delegates",
                          },
                        ]
                      : undefined,
            } satisfies NavItem,
          ]
        : []),
    ],
  };

  // Teaching navigation structure — only built when feature is enabled
  // Educators get nested nav with manage/results sub-pages
  const teachingNavItem: NavItem = canManageContent
    ? {
        label: "Teaching",
        href: "/teaching",
        icon: showIcons ? "teaching" : undefined,
        children: [
          { label: "Assessments", href: "/teaching" },
          { label: "Manage items", href: "/teaching/manage" },
        ],
      }
    : {
        label: "Teaching",
        href: "/teaching",
        icon: showIcons ? "teaching" : undefined,
      };

  // Build nested patient nav item from flat patientNav array
  // [a, b, c] → a { children: [b { children: [c] }] }
  let patientNavItem: NavItem | null = null;
  if (patientNav && patientNav.length > 0) {
    // Build from the deepest item upward
    let current: NavItem = { ...patientNav[patientNav.length - 1] };
    for (let i = patientNav.length - 2; i >= 0; i--) {
      current = { ...patientNav[i], children: [current] };
    }
    // Add user icon to the top-level item when icons are enabled
    if (showIcons && !current.icon) {
      current = { ...current, icon: "user" };
    }
    patientNavItem = current;
  }

  if (isLoading) {
    return null;
  }

  return (
    <Stack gap={0}>
      {patientNavItem && (
        <>
          <NestedNavLink
            item={patientNavItem}
            onNavigate={onNavigate}
            showIcons={showIcons}
          />
          <Divider my="xs" />
        </>
      )}
      {hasClinicalServices && (
        <NavLink
          label="Home"
          styles={navLinkStyles}
          active={location.pathname === "/"}
          onClick={() => {
            navigate("/");
            if (onNavigate) onNavigate();
          }}
          leftSection={showIcons ? <NavIcon name="home" /> : undefined}
        />
      )}
      {hasClinicalServices && (
        <NavLink
          label="Messages"
          styles={navLinkStyles}
          active={location.pathname.startsWith("/messages")}
          onClick={() => {
            navigate("/messages");
            if (onNavigate) onNavigate();
          }}
          leftSection={showIcons ? <NavIcon name="message" /> : undefined}
        />
      )}
      {hasTeaching && (
        <NestedNavLink
          item={teachingNavItem}
          onNavigate={onNavigate}
          showIcons={showIcons}
        />
      )}
      {hasPassport && (
        <NavLink
          label="Passport"
          styles={navLinkStyles}
          active={location.pathname.startsWith("/passport")}
          onClick={() => {
            navigate("/passport");
            if (onNavigate) onNavigate();
          }}
          leftSection={showIcons ? <NavIcon name="passport" /> : undefined}
        />
      )}
      <NavLink
        label="Settings"
        styles={navLinkStyles}
        active={location.pathname.startsWith("/settings")}
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
