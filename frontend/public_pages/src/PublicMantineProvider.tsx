// eslint-disable-next-line no-restricted-imports
import { MantineProvider } from "@mantine/core";
import { theme, cssVariablesResolver } from "@/theme";
import type { ReactNode } from "react";

interface PublicMantineProviderProps {
  children: ReactNode;
}

export default function PublicMantineProvider({
  children,
}: PublicMantineProviderProps) {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="light"
    >
      {children}
    </MantineProvider>
  );
}
