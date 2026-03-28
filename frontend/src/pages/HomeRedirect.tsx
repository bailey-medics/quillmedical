/**
 * Home Redirect Module
 *
 * Redirects to /teaching when clinical services are disabled (teaching-only
 * deployment), otherwise renders the patient-list Home page.
 */

/* eslint-disable no-restricted-syntax */
// Routing wrapper — delegates layout to Home component

import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Home from "./Home";

export default function HomeRedirect() {
  const { state } = useAuth();
  if (
    state.status === "authenticated" &&
    !state.user.clinical_services_enabled
  ) {
    return <Navigate to="/teaching" replace />;
  }
  return <Home />;
}
