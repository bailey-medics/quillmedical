/**
 * What goes round one guide: the whole app for somebody signed in, and a
 * plain page for anybody else.
 *
 * `/guides/:slug` sits outside `RequireAuth`, because some guides are
 * read before there is an account to sign in with. A signed-in reader
 * still gets the ribbon and the menu, through `RootLayout`. Somebody
 * signed out gets the bare page the other signed-out pages have: the
 * login form and the printed passport's verification page have no menu
 * either.
 *
 * Not part of the guides' lazy chunk. `routes.tsx` imports it directly,
 * as it does `RootLayout`, since it is needed before any page is.
 */

import { Center, Container } from "@mantine/core";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import LoadingSpinner from "@/components/loading-spinner";
import RootLayout from "@/RootLayout";

export default function GuideShell() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <Center mih="60dvh">
        <LoadingSpinner />
      </Center>
    );
  }

  if (state.status === "authenticated") {
    return <RootLayout />;
  }

  return (
    <Container component="main" size="lg" pt="md" pb="xl">
      <Outlet />
    </Container>
  );
}
