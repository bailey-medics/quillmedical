/**
 * Messaging Component Module
 *
 * Chat/messaging interface for patient-clinician conversations. Displays
 * message thread with sent/received messages, profile pictures, and a
 * message input box with send functionality.
 */

import {
  Box,
  Button,
  Group,
  ScrollArea,
  Skeleton,
  Text,
  Textarea,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import React, { useEffect, useRef, useState } from "react";
import ProfilePic from "@/components/profile-pic";

/** Renders **bold** markdown syntax as <strong> elements. */
function renderBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

/**
 * Message
 *
 * Represents a single message in a conversation thread.
 */
export type MessageAction = {
  label: string;
  value: string;
  variant?: "filled" | "outline" | "light";
  color?: string;
};

export type Message = {
  id: string;
  senderId: string;
  senderName?: string;
  givenName?: string;
  familyName?: string;
  text: string;
  timestamp?: string; // ISO
  avatar?: string;
  gradientIndex?: number;
  actions?: MessageAction[];
};

type Props = {
  messages: Message[];
  currentUserId: string;
  onSend?: (text: string) => void;
  onAction?: (messageId: string, actionValue: string) => void;
  placeholder?: string;
  isLoading?: boolean;
};

export default function Messaging({
  messages,
  currentUserId,
  onSend,
  onAction,
  placeholder = "Type a message...",
  isLoading = false,
}: Props) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const avatarSize: "sm" | "md" | "lg" = "lg";
  const avatarSizePixels = 64;
  const theme = useMantineTheme();
  const isSmall = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const scrollPaddingLeft = isSmall ? "1rem" : 12;
  const scrollPaddingRight = isSmall ? "1rem" : 12;
  const bubbleMaxWidth = isSmall ? "100%" : "80%";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function submit() {
    const txt = input.trim();
    if (!txt) return;
    onSend?.(txt);
    setInput("");
  }

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <ScrollArea
        style={{
          flex: 1,
          paddingLeft: scrollPaddingLeft,
          paddingRight: scrollPaddingRight,
          paddingBottom: 12,
        }}
        type="auto"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            paddingTop: 10,
          }}
        >
          {isLoading ? (
            // Loading skeleton
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: i % 2 === 0 ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: "70%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {i % 2 === 1 && <ProfilePic isLoading size={avatarSize} />}
                    <Skeleton height={60} radius="md" style={{ flex: 1 }} />
                    {i % 2 === 0 && <ProfilePic isLoading size={avatarSize} />}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {messages.map((m) => {
                const mine = m.senderId === currentUserId;
                const displayName =
                  m.senderName ||
                  [m.givenName, m.familyName].filter(Boolean).join(" ") ||
                  undefined;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: mine ? "flex-end" : "flex-start",
                      marginBottom: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    {mine ? (
                      <div
                        style={{
                          maxWidth: bubbleMaxWidth,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                        }}
                      >
                        {displayName && (
                          <Text
                            size="lg"
                            color="dimmed"
                            style={{
                              marginBottom: 2,
                              marginRight: avatarSizePixels + 8,
                            }}
                          >
                            {displayName}
                          </Text>
                        )}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              background: "#BBDEFB",
                              padding: "0.5rem 0.75rem",
                              borderRadius: 12,
                              boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
                              wordBreak: "break-word",
                            }}
                          >
                            <Text size="lg" style={{ whiteSpace: "pre-wrap" }}>
                              {renderBold(m.text)}
                            </Text>
                          </div>
                          <ProfilePic
                            src={m.avatar}
                            givenName={m.givenName}
                            familyName={m.familyName}
                            gradientIndex={m.gradientIndex}
                            size={avatarSize}
                          />
                        </div>
                        {m.timestamp && (
                          <Text
                            size="lg"
                            color="dimmed"
                            style={{
                              marginTop: 4,
                              marginRight: avatarSizePixels + 8,
                            }}
                          >
                            {new Date(m.timestamp).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}{" "}
                            {new Date(m.timestamp).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </Text>
                        )}
                        {m.actions && m.actions.length > 0 && (
                          <Group
                            gap="xs"
                            mt={6}
                            style={{ marginRight: avatarSizePixels + 8 }}
                          >
                            {m.actions.map((action) => (
                              <Button
                                key={action.value}
                                size="xs"
                                variant={action.variant ?? "light"}
                                color={action.color}
                                onClick={() => onAction?.(m.id, action.value)}
                              >
                                {action.label}
                              </Button>
                            ))}
                          </Group>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{
                          maxWidth: bubbleMaxWidth,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                        }}
                      >
                        {displayName && (
                          <Text
                            size="lg"
                            color="dimmed"
                            style={{
                              marginBottom: 2,
                              marginLeft: avatarSizePixels + 8,
                            }}
                          >
                            {displayName}
                          </Text>
                        )}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <ProfilePic
                            src={m.avatar}
                            givenName={m.givenName}
                            familyName={m.familyName}
                            gradientIndex={m.gradientIndex}
                            size={avatarSize}
                          />
                          <div
                            style={{
                              background: "#FFF3E0",
                              padding: "0.5rem 0.75rem",
                              borderRadius: 12,
                              boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
                              wordBreak: "break-word",
                            }}
                          >
                            <Text size="lg" style={{ whiteSpace: "pre-wrap" }}>
                              {renderBold(m.text)}
                            </Text>
                          </div>
                        </div>
                        {m.timestamp && (
                          <Text
                            size="lg"
                            color="dimmed"
                            style={{
                              marginTop: 4,
                              marginLeft: avatarSizePixels + 8,
                            }}
                          >
                            {new Date(m.timestamp).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}{" "}
                            {new Date(m.timestamp).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </Text>
                        )}
                        {m.actions && m.actions.length > 0 && (
                          <Group
                            gap="xs"
                            mt={6}
                            style={{ marginLeft: avatarSizePixels + 8 }}
                          >
                            {m.actions.map((action) => (
                              <Button
                                key={action.value}
                                size="xs"
                                variant={action.variant ?? "light"}
                                color={action.color}
                                onClick={() => onAction?.(m.id, action.value)}
                              >
                                {action.label}
                              </Button>
                            ))}
                          </Group>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={endRef} />
            </>
          )}
        </div>
      </ScrollArea>

      <div
        style={{
          padding: 12,
          borderTop: "1px solid rgba(0,0,0,0.06)",
          display: "flex",
          gap: 8,
        }}
      >
        <Textarea
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          autosize
          minRows={1}
          maxRows={6}
          style={{ flex: 1 }}
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button onClick={submit} disabled={isLoading}>
          Send
        </Button>
      </div>
    </Box>
  );
}
