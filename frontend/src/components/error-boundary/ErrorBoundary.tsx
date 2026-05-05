/**
 * Error Boundary Component
 *
 * Catches unhandled React errors and displays a friendly fallback UI
 * instead of crashing the entire application to a white screen.
 * Logs errors to console.error for monitoring.
 */

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Center, Stack } from "@mantine/core";
import { IconAlertTriangle } from "@/components/icons/appIcons";
import Icon from "@/components/icons";
import IconTextButton from "@/components/button/IconTextButton";
import { BodyText, Heading } from "@/components/typography";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}

type FallbackProps = {
  onReload: () => void;
};

/** Exported for Storybook rendering */
export function ErrorFallback({ onReload }: FallbackProps) {
  return (
    <Center mih="60vh" data-testid="error-boundary-fallback">
      <Stack align="center" gap="lg">
        <Icon icon={<IconAlertTriangle />} size="xl" c="red.6" />
        <Heading>Something went wrong</Heading>
        <BodyText c="gray.5">
          An unexpected error occurred. Please try reloading the page.
        </BodyText>
        <IconTextButton icon="refresh" label="Reload page" onClick={onReload} />
      </Stack>
    </Center>
  );
}
