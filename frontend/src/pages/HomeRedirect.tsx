/**
 * Home Redirect Module
 *
 * Decides where somebody lands at `/`, which is where login sends them:
 * the first link in their side navigation.
 *
 * With clinical services on, that link is Home, so the patient list is
 * rendered here. With them off, it is the first feature they can reach,
 * Teaching or the Passport. Somebody who reaches no feature has Settings
 * as their first link: an administrator is sent on to Admin, and
 * anybody else is told they have no access rather than being left on a
 * settings page wondering where the app is.
 */

// Routing wrapper - delegates layout to Home component

import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { NoAccessLayout } from "@/components/layouts";
import {
  GUIDES_PATH,
  useFeatureNavItems,
} from "@/components/navigation/featureNavItems";
import Home from "./Home";

export default function HomeRedirect() {
  const { state } = useAuth();

  // The same list the side navigation renders, so where somebody lands
  // and what their first link says cannot disagree.
  const featureItems = useFeatureNavItems();

  // Read as the side navigation reads it when deciding to show Home.
  const hasClinicalServices =
    state.status !== "authenticated" ||
    (state.user.clinical_services_enabled ?? true);

  if (hasClinicalServices) {
    return <Home />;
  }

  // Settings is always offered, so it is never a place to land: the
  // first link other than it is. That is a feature where there is one,
  // and Admin for somebody who administers Quill but uses none of it.
  // With neither, or a link with nowhere to go, they are told so.
  // Guides are the same: they describe the features, so they are read
  // on the way to one and are never where somebody starts.
  const landing = featureItems.find(
    (item) => item.href !== "/settings" && item.href !== GUIDES_PATH,
  )?.href;
  if (!landing) {
    return <NoAccessLayout />;
  }

  return <Navigate to={landing} replace />;
}
