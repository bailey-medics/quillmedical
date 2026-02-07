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
  ScrollArea,
  Skeleton,
  Text,
  Textarea,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import ProfilePic from "@/components/profile-pic/ProfilePic";

/**
 * Message
 *
 * Represents a single message in a conversation thread.
 */
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
};

type Props = {
  messages: Message[];
  currentUserId: string;
  onSend?: (text: string) => void;
  placeholder?: string;
  isLoading?: boolean;
};

export default function Messaging({
  messages,
  currentUserId,
  onSend,
  placeholder = "Type a message...",
  isLoading = false,
}: Props) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const avatarSize = isSm ? "sm" : "md";
  const avatarSizePixels = isSm ? 32 : 48;

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
          paddingLeft: 12,
          paddingRight: 12,
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
                          maxWidth: "80%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                        }}
                      >
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
                              padding: "8px 12px",
                              borderRadius: 12,
                              boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
                              wordBreak: "break-word",
                            }}
                          >
                            <Text size="sm">{m.text}</Text>
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
                            size="xs"
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
                      </div>
                    ) : (
                      <div
                        style={{
                          maxWidth: "80%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                        }}
                      >
                        {m.senderName && (
                          <Text
                            size="xs"
                            color="dimmed"
                            style={{
                              marginBottom: 2,
                              marginLeft: avatarSizePixels + 8,
                            }}
                          >
                            {m.senderName}
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
                              padding: "8px 12px",
                              borderRadius: 12,
                              boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
                              wordBreak: "break-word",
                            }}
                          >
                            <Text size="sm">{m.text}</Text>
                          </div>
                        </div>
                        {m.timestamp && (
                          <Text
                            size="xs"
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
