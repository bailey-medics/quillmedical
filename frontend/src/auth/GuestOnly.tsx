import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function GuestOnly({ children }: { children: JSX.Element }) {
  const { state } = useAuth();
  if (state.status === "loading") return null;
  if (state.status === "authenticated") return <Navigate to="/" replace />;
  return children;
}
