/**
 * Application Icon Registry
 *
 * Single source of truth for all Tabler icons used in the application.
 * When adding a new icon anywhere in the app, it MUST be registered here first.
 * The Icon stories in Storybook display this list automatically.
 */

import type { ReactElement } from "react";
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconBell,
  IconBook,
  IconBuildingCommunity,
  IconCalendar,
  IconCalendarWeek,
  IconChalkboardTeacher,
  IconChartBar,
  IconCurrencyPound,
  IconCheck,
  IconChevronLeft,
  IconClock,
  IconDatabase,
  IconDownload,
  IconEdit,
  IconFileText,
  IconGenderAgender,
  IconGenderFemale,
  IconGenderMale,
  IconHeartPlus,
  IconHome,
  IconLogout,
  IconMail,
  IconMenu2,
  IconMessage,
  IconPencil,
  IconPhoneRinging,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShieldCheck,
  IconSlice,
  IconStack2,
  IconTrash,
  IconUser,
  IconUserCheck,
  IconUserMinus,
  IconUserOff,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react";

export interface AppIcon {
  name: string;
  icon: ReactElement;
}

/** All icons registered for use in the application */
const appIcons: AppIcon[] = [
  { name: "AdjustmentsHorizontal", icon: <IconAdjustmentsHorizontal /> },
  { name: "AlertCircle", icon: <IconAlertCircle /> },
  { name: "AlertTriangle", icon: <IconAlertTriangle /> },
  { name: "ArrowLeft", icon: <IconArrowLeft /> },
  { name: "Bell", icon: <IconBell /> },
  { name: "Book", icon: <IconBook /> },
  { name: "BuildingCommunity", icon: <IconBuildingCommunity /> },
  { name: "Calendar", icon: <IconCalendar /> },
  { name: "CalendarWeek", icon: <IconCalendarWeek /> },
  { name: "ChalkboardTeacher", icon: <IconChalkboardTeacher /> },
  { name: "ChartBar", icon: <IconChartBar /> },
  { name: "CurrencyPound", icon: <IconCurrencyPound /> },
  { name: "Check", icon: <IconCheck /> },
  { name: "ChevronLeft", icon: <IconChevronLeft /> },
  { name: "Clock", icon: <IconClock /> },
  { name: "Database", icon: <IconDatabase /> },
  { name: "Download", icon: <IconDownload /> },
  { name: "Edit", icon: <IconEdit /> },
  { name: "FileText", icon: <IconFileText /> },
  { name: "GenderAgender", icon: <IconGenderAgender /> },
  { name: "GenderFemale", icon: <IconGenderFemale /> },
  { name: "GenderMale", icon: <IconGenderMale /> },
  { name: "HeartPlus", icon: <IconHeartPlus /> },
  { name: "Home", icon: <IconHome /> },
  { name: "Logout", icon: <IconLogout /> },
  { name: "Mail", icon: <IconMail /> },
  { name: "Menu2", icon: <IconMenu2 /> },
  { name: "Message", icon: <IconMessage /> },
  { name: "Pencil", icon: <IconPencil /> },
  { name: "PhoneRinging", icon: <IconPhoneRinging /> },
  { name: "Plus", icon: <IconPlus /> },
  { name: "Search", icon: <IconSearch /> },
  { name: "Settings", icon: <IconSettings /> },
  { name: "ShieldCheck", icon: <IconShieldCheck /> },
  { name: "Slice", icon: <IconSlice /> },
  { name: "Stack2", icon: <IconStack2 /> },
  { name: "Trash", icon: <IconTrash /> },
  { name: "User", icon: <IconUser /> },
  { name: "UserCheck", icon: <IconUserCheck /> },
  { name: "UserMinus", icon: <IconUserMinus /> },
  { name: "UserOff", icon: <IconUserOff /> },
  { name: "UserPlus", icon: <IconUserPlus /> },
  { name: "X", icon: <IconX /> },
];

export default appIcons;
