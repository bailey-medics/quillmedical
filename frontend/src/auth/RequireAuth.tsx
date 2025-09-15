// src/auth/RequireAuth.tsx
import { Center, Loader } from "@mantine/core";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function RequireAuth({ children }: { children: JSX.Element }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return (
      <Center mih="60vh">
        <Loader />
      </Center>
    );
  }

  if (state.status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
