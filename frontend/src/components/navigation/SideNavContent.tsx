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
import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useHasFeature } from "@lib/features";
import { useHasCompetency } from "@/lib/cbac/hooks";
import { mayUseNewsletter } from "@/lib/newsletter/access";
import { api } from "@/lib/api";
import { orgUnits } from "@/domains/orgUnit";
import NavIcon from "../icons/NavIcon";
import SendFeedbackNavLink from "@/components/feedback/SendFeedbackNavLink";
import NestedNavLink, { type NavItem } from "./NestedNavLink";
import { useFeatureNavItems } from "./featureNavItems";
import { navLinkStyles } from "./navStyles";

/**
 * SideNavContent Props
 */
type Props = {
  /** Called after navigation (to close drawer on mobile) */
  onNavigate?: () => void;
  /** Whether to display icons next to labels */
  showIcons?: boolean;
  /** Patient navigation breadcrumbs - flat array converted to nested tree */
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
  const location = useLocation();
  const [patientName, setPatientName] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  // The open org_unit, and the org_unit above it when there is one. Kept
  // apart so the breadcrumb can hang under Organisations or under Sites.
  const [placeNav, setPlaceNav] = useState<
    { parent?: NavItem; place: NavItem } | undefined
  >(undefined);
  // Whether the caller administers any organisation; null until known.
  const [hasOrganisations, setHasOrganisations] = useState<boolean | null>(
    null,
  );
  const [bankTitle, setBankTitle] = useState<string | null>(null);

  // Teaching, Passport, Settings and Admin, with their gates. Shared
  // with the teaching sidebar so the two cannot disagree about which
  // features exist - see `featureNavItems.ts`.
  const featureItems = useFeatureNavItems();
  const showsAdmin = featureItems.some((item) => item.href === "/admin");

  // Still needed here: the admin section has its own teaching sub-nav,
  // which is about administering the feature rather than using it.
  const hasTeaching = useHasFeature("teaching");

  // What hangs under Teaching belongs to the sidebar rather than to the
  // shared list: here an educator gets the teaching pages, whereas the
  // teaching sidebar hangs the current module there instead.
  const canManageContent = useHasCompetency("manage_teaching");
  // The patient admin pages stay `manage_users`-only, so their entry does
  // too; a teaching admin reaches the rest of Admin.
  const canManagePatients = useHasCompetency("manage_users");

  // Check if clinical services (FHIR/EHRbase) are available
  const hasClinicalServices =
    state.status === "authenticated" &&
    (state.user.clinical_services_enabled ?? true);

  // Operating Quill itself, which is true everywhere or nowhere. Read
  // the same way `RequireOperator` reads it, so the link and the route
  // it points at cannot disagree: a link to a page that 404s is worse
  // than no link.
  const isOperator =
    state.status === "authenticated" &&
    state.user.platform_role === "superadmin";

  const showsNewsletter =
    state.status === "authenticated" && mayUseNewsletter(state.user);

  // Don't render nav while auth is loading to avoid layout flicker
  // (Admin link appears after auth resolves, shifting Logout down)
  const isLoading = state.status === "loading";

  // Extract patient ID from URL if on patient admin page
  const patientIdMatch = location.pathname.match(/^\/admin\/patients\/([^/]+)/);
  const patientId = patientIdMatch ? patientIdMatch[1] : null;

  // The page open beneath one patient or one user: editing them, or
  // putting a patient in or out of use.
  const recordSubPage =
    location.pathname.match(
      /^\/admin\/(?:patients|users)\/[^/]+\/(edit|deactivate|activate)$/,
    )?.[1] ?? null;
  const recordSubPageItem: NavItem[] | undefined = recordSubPage
    ? [
        {
          label: {
            edit: "Edit",
            deactivate: "Deactivate",
            activate: "Activate",
          }[recordSubPage] as string,
          href: location.pathname,
        },
      ]
    : undefined;

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

  // Detect one member's page at an organisation or a site
  const memberId =
    location.pathname.match(
      /^\/admin\/(?:organisations|sites)\/[^/]+\/members\/(\d+)/,
    )?.[1] ?? null;

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

  // Fetch org/site breadcrumb - single effect to avoid flicker during transitions
  useEffect(() => {
    let cancelled = false;

    async function fetchOrgNav() {
      // Sentence case, and named here rather than capitalised from the
      // address - "add-staff" became "Add-staff" on screen.
      const subPageLabels: Record<string, string> = {
        features: "Features",
        edit: "Edit",
        "add-staff": "Add staff",
        "add-patient": "Add patient",
        "add-site": "Add site",
      };

      // Both branches read the same address, because an organisation and
      // a site are the same kind of thing now. The old code asked
      // `/organisations/{id}` with what is an org_unit id, which answered
      // about whichever organisation happened to hold that number.
      const placeId = orgId ?? siteId;
      // "new" is a page, not an org_unit. Asking about it used to produce a
      // failed request on every visit to the create form.
      if (!placeId || !/^\d+$/.test(placeId)) {
        setPlaceNav(undefined);
        return;
      }

      try {
        const place = await orgUnits.get(Number(placeId));
        if (cancelled) return;

        const subPage = orgId ? orgSubPage : siteSubPage;
        const base = orgId
          ? `/admin/organisations/${placeId}`
          : `/admin/sites/${placeId}`;

        // A member's page is named after the member, by username, as
        // the Users entry names somebody. A member who cannot be read
        // leaves the place's own link standing.
        let subPageItem: NavItem | undefined;
        if (subPage === "members" && memberId) {
          const member = await orgUnits
            .memberPractice(Number(placeId), Number(memberId))
            .catch(() => null);
          if (cancelled) return;
          subPageItem = member
            ? { label: member.username, href: `${base}/members/${memberId}` }
            : undefined;
        } else if (subPage && subPageLabels[subPage]) {
          subPageItem = {
            label: subPageLabels[subPage],
            href: `${base}/${subPage}`,
          };
        }

        const placeItem: NavItem = {
          label: place.name || "Unknown place",
          href: base,
          children: subPageItem ? [subPageItem] : undefined,
        };

        // The org_unit above may be a building rather than the trust, so
        // which page to link to comes from the server rather than from
        // assuming everything hangs straight off an organisation.
        setPlaceNav({
          place: placeItem,
          parent:
            place.parent_id !== null && place.parent_name
              ? {
                  label: place.parent_name,
                  href: place.parent_is_root
                    ? `/admin/organisations/${place.parent_id}`
                    : `/admin/sites/${place.parent_id}`,
                }
              : undefined,
        });
      } catch (error) {
        console.error("Failed to fetch place name:", error);
        if (!cancelled) setPlaceNav(undefined);
      }
    }

    fetchOrgNav();
    return () => {
      cancelled = true;
    };
  }, [orgId, orgSubPage, siteId, siteSubPage, memberId]);

  // Whether to offer Organisations. Somebody who administers only a site
  // has none, and the list would be empty, so the entry goes and Sites
  // is their way in. Asked of the same list the Organisations page
  // shows, so the link and the page cannot disagree. An operator
  // administers every organisation and is not asked.
  useEffect(() => {
    if (!showsAdmin || isOperator) return;
    let cancelled = false;
    orgUnits
      .list({ roots: true })
      .then((organisations) => {
        if (!cancelled) setHasOrganisations(organisations.length > 0);
      })
      .catch(() => {
        // Fail closed: an entry leading to an empty or refused page is
        // worse than no entry.
        if (!cancelled) setHasOrganisations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showsAdmin, isOperator]);
  // Offered until the answer says otherwise. Most administrators have
  // one, and holding the entry back until the list answered made the
  // breadcrumb under it arrive late on every organisation page.
  const showsOrganisations = isOperator || hasOrganisations !== false;

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

  // Pages under Users and Patients that are not one record: the forms
  // and lists reached from the section's own page. Named here so each
  // has a link of its own while open; without one the section stayed
  // lit and the menu could not tell its pages apart.
  const fixedPages: Record<string, string> = {
    "/admin/users/new": "New user",
    "/admin/users/edit": "Edit user",
    "/admin/patients/new": "New patient",
    "/admin/patients/list": "All patients",
    "/admin/patients/edit": "Edit patient",
    "/admin/patients/deactivate": "Deactivate patient",
    "/admin/organisations/new": "New organisation",
    "/admin/sites/new": "New site",
  };
  const fixedPageLabel = fixedPages[location.pathname];
  const fixedPageItem: NavItem[] | undefined = fixedPageLabel
    ? [{ label: fixedPageLabel, href: location.pathname }]
    : undefined;

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
            children: recordSubPageItem,
          },
        ]
      : location.pathname.startsWith("/admin/users/")
        ? fixedPageItem
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
            children: recordSubPageItem,
          },
        ]
      : location.pathname.startsWith("/admin/patients/")
        ? fixedPageItem
        : undefined,
  };

  // The breadcrumb for the open org_unit. Under Organisations it starts
  // at the parent, whatever that is. Under Sites, for somebody offered no
  // Organisations, a parent organisation is left out: its page would
  // refuse them.
  const orgNavChildren: NavItem[] | undefined = (() => {
    if (!placeNav) return undefined;
    const { parent, place } = placeNav;
    const keepsParent =
      parent !== undefined &&
      (showsOrganisations || parent.href?.startsWith("/admin/sites/"));
    return keepsParent ? [{ ...parent, children: [place] }] : [place];
  })();

  // Compute the breadcrumb's children.
  // When on a site page, ensure the children include the site href so
  // isActiveOrParent keeps the nav expanded (prevents collapse flicker).
  const orgNavEffective: NavItem[] | undefined = (() => {
    if (siteId && /^\d+$/.test(siteId)) {
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
    // As the shared entry this one replaces has it: see `featureNavItems`.
    keepsDrawerOpen: true,
    children: [
      usersNavItem,
      ...(hasClinicalServices && canManagePatients ? [patientsNavItem] : []),
      ...(showsOrganisations
        ? [
            {
              label: "Organisations",
              href: "/admin/organisations",
              icon: showIcons ? "building-community" : undefined,
              children: orgId === "new" ? fixedPageItem : orgNavEffective,
            } satisfies NavItem,
          ]
        : []),
      // Always offered. The sites of one organisation already hang under
      // it above, so this is the way in for somebody who knows the site
      // but not which organisation owns it, and the only way in for
      // somebody who administers a site and no organisation.
      {
        label: "Sites",
        href: "/admin/sites",
        icon: showIcons ? "building-hospital" : undefined,
        // With Organisations offered, one site's own pages are named
        // under it, so Sites stays lit for the list and the create form
        // only: lit on both, the menu said you were in two places.
        // Without it, the site's pages hang here instead.
        ...(siteId === "new"
          ? { children: fixedPageItem }
          : showsOrganisations
            ? { exact: siteId !== null && /^\d+$/.test(siteId) }
            : { children: orgNavEffective }),
      } satisfies NavItem,
      // Operator-only, matching the route guard and the API: feedback
      // spans every organisation. Shares its label with the top-level
      // Feedback link, which opens the modal; nested under Admin, this one
      // plainly means the submissions.
      ...(isOperator
        ? [
            {
              label: "Feedback",
              href: "/admin/feedback",
              icon: showIcons ? "feedback" : undefined,
              // One submission, named while it is open.
              children: /^\/admin\/feedback\/[^/]+$/.test(location.pathname)
                ? [{ label: "Submission", href: location.pathname }]
                : undefined,
            } satisfies NavItem,
          ]
        : []),
      // Shown to whoever `RequireNewsletter` lets through: both read
      // `mayUseNewsletter`, so the link and the route cannot disagree.
      ...(showsNewsletter
        ? [
            {
              label: "Newsletter",
              href: "/admin/newsletter",
              icon: showIcons ? "mail" : undefined,
            } satisfies NavItem,
          ]
        : []),
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
                                  // The module's settings for one
                                  // organisation.
                                  children:
                                    /^\/admin\/teaching\/modules\/[^/]+\/org\/[^/]+$/.test(
                                      location.pathname,
                                    )
                                      ? [
                                          {
                                            label: "Organisation",
                                            href: location.pathname,
                                          },
                                        ]
                                      : undefined,
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

  // A message thread hands its trail over the same way a patient page
  // does, starting at Messages. That part is hung under the Messages
  // entry below rather than shown as a block of its own: as a block it
  // put Messages in the menu twice, and lit one of them and the thread
  // together.
  const isMessagesTrail = patientNav?.[0]?.href === "/messages";
  const threadItems: NavItem[] = isMessagesTrail
    ? (patientNav ?? [])
        .slice(1)
        .reduceRight<NavItem[]>(
          (inner, page) => [
            { ...page, ...(inner.length > 0 ? { children: inner } : {}) },
          ],
          [],
        )
    : [];

  // Build nested patient nav item from flat patientNav array
  // [a, b, c] → a { children: [b { children: [c] }] }
  let patientNavItem: NavItem | null = null;
  if (patientNav && patientNav.length > 0 && !isMessagesTrail) {
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
          component={Link}
          to="/"
          label="Home"
          styles={navLinkStyles}
          active={location.pathname === "/"}
          onClick={() => {
            if (onNavigate) onNavigate();
          }}
          leftSection={showIcons ? <NavIcon name="home" /> : undefined}
        />
      )}
      {hasClinicalServices && (
        <NestedNavLink
          item={{
            label: "Messages",
            href: "/messages",
            icon: showIcons ? "message" : undefined,
            children: threadItems.length > 0 ? threadItems : undefined,
          }}
          onNavigate={onNavigate}
          showIcons={showIcons}
        />
      )}
      {/* The cross-feature entries, from the one module that owns them.
          Two get their children here rather than there, because what
          hangs under them depends on this sidebar: Admin grows a
          breadcrumb for whichever record is open, and Teaching offers
          an educator the teaching pages. */}
      {featureItems.map((item) => (
        <NestedNavLink
          key={item.label}
          item={
            item.href === "/admin"
              ? adminNavItem
              : item.href === "/teaching" && canManageContent
                ? {
                    ...item,
                    children: [
                      { label: "Assessments", href: "/teaching" },
                      { label: "Manage items", href: "/teaching/manage" },
                    ],
                  }
                : item
          }
          onNavigate={onNavigate}
          showIcons={showIcons}
        />
      ))}
      <SendFeedbackNavLink showIcons={showIcons} onNavigate={onNavigate} />
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
