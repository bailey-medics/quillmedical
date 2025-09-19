import { Avatar, Box, Button, ScrollArea, Text, Textarea } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

export type Message = {
  id: string;
  senderId: string;
  senderName?: string;
  text: string;
  timestamp?: string; // ISO
  avatar?: string;
};

type Props = {
  messages: Message[];
  currentUserId: string;
  onSend?: (text: string) => void;
  placeholder?: string;
};

export default function Messaging({
  messages,
  currentUserId,
  onSend,
  placeholder = "Type a message...",
}: Props) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

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
      <ScrollArea style={{ flex: 1, padding: 12 }} type="auto">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: mine ? "flex-end" : "flex-start",
                }}
              >
                {!mine && (
                  <Avatar
                    src={m.avatar}
                    size={32}
                    radius="xl"
                    style={{ marginRight: 8 }}
                  />
                )}
                <div
                  style={{
                    maxWidth: "70%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: mine ? "flex-end" : "flex-start",
                  }}
                >
                  {!mine && m.senderName && (
                    <Text size="xs" color="dimmed" style={{ marginBottom: 2 }}>
                      {m.senderName}
                    </Text>
                  )}
                  <div
                    style={{
                      background: mine ? "#DCF8C6" : "#FFFFFF",
                      padding: "8px 12px",
                      borderRadius: 12,
                      boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
                      wordBreak: "break-word",
                    }}
                  >
                    <Text size="sm">{m.text}</Text>
                  </div>
                  {m.timestamp && (
                    <Text size="xs" color="dimmed" style={{ marginTop: 4 }}>
                      {new Date(m.timestamp).toLocaleString()}
                    </Text>
                  )}
                </div>
                {mine && (
                  <Avatar
                    src={m.avatar}
                    size={32}
                    radius="xl"
                    style={{ marginLeft: 8 }}
                  />
                )}
              </div>
            );
          })}
          <div ref={endRef} />
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button onClick={submit}>Send</Button>
      </div>
    </Box>
  );
}
