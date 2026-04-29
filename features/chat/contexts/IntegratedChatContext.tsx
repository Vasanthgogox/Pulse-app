import React, { createContext, useContext, useState, useCallback } from "react";

export interface DirectMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export interface IntegratedChat {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerRole: "dispatcher" | "owner";
  organization: string;
  avatar?: string;
  isOnline: boolean;
  messages: DirectMessage[];
  lastActivity: string;
  unreadCount: number;
}

interface IntegratedChatContextType {
  chats: IntegratedChat[];
  sendMessage: (chatId: string, content: string, viewerRole: "dispatcher" | "owner") => void;
  markAsRead: (chatId: string) => void;
  getUnreadCount: (chatId: string) => number;
  getTotalUnreadCount: () => number;
}

const IntegratedChatContext = createContext<IntegratedChatContextType | undefined>(undefined);

const mockIntegratedChats: IntegratedChat[] = [
  {
    id: "int-1",
    partnerId: "owner-1",
    partnerName: "Sharma Transport",
    partnerRole: "owner",
    organization: "Sharma Transport Co.",
    isOnline: true,
    messages: [
      { id: "dm1", senderId: "dispatcher-1", content: "Hi, I have a new requirement for next week", timestamp: "10:00 AM", isRead: true },
      { id: "dm2", senderId: "owner-1", content: "Sure, what route and vehicle type?", timestamp: "10:05 AM", isRead: true },
      { id: "dm3", senderId: "dispatcher-1", content: "Mumbai to Pune, need a 20ft container", timestamp: "10:08 AM", isRead: true },
      { id: "dm4", senderId: "owner-1", content: "I have availability. When do you need it?", timestamp: "10:10 AM", isRead: false },
    ],
    lastActivity: "2 hours ago",
    unreadCount: 1,
  },
  {
    id: "int-2",
    partnerId: "owner-2",
    partnerName: "Patel Logistics",
    partnerRole: "owner",
    organization: "Patel Logistics Pvt Ltd",
    isOnline: false,
    messages: [
      { id: "dm5", senderId: "dispatcher-1", content: "Can we discuss rates for regular Nashik trips?", timestamp: "Yesterday", isRead: true },
      { id: "dm6", senderId: "owner-2", content: "Yes, let me share our updated rate card", timestamp: "Yesterday", isRead: true },
    ],
    lastActivity: "Yesterday",
    unreadCount: 0,
  },
  {
    id: "int-3",
    partnerId: "dispatcher-2",
    partnerName: "Express Cargo",
    partnerRole: "dispatcher",
    organization: "Express Cargo Solutions",
    isOnline: true,
    messages: [
      { id: "dm7", senderId: "owner-1", content: "Do you have any loads for Chennai route?", timestamp: "3 hours ago", isRead: true },
      { id: "dm8", senderId: "dispatcher-2", content: "Yes, we have 3 indents for Chennai next week", timestamp: "3 hours ago", isRead: false },
      { id: "dm9", senderId: "dispatcher-2", content: "I'll share the details shortly", timestamp: "2 hours ago", isRead: false },
    ],
    lastActivity: "2 hours ago",
    unreadCount: 2,
  },
];

export const INTEGRATED_QUICK_MESSAGES = [
  "Do you have availability next week?",
  "What vehicles do you have free?",
  "Can we discuss rates?",
  "Please share your updated rate card",
  "I have a new requirement",
  "Let's schedule a call",
];

const MOCK_RESPONSES = [
  "Thanks for reaching out! Let me check and get back to you.",
  "Yes, I can help with that. What are the details?",
  "Sure, I'll send the information shortly.",
  "Let me check availability and confirm.",
  "That works for me. Please share more details.",
];

export const IntegratedChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [chats, setChats] = useState<IntegratedChat[]>(mockIntegratedChats);

  const sendMessage = useCallback((chatId: string, content: string, viewerRole: "dispatcher" | "owner") => {
    const timestamp = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const newMsg: DirectMessage = {
      id: `dm-${Date.now()}`,
      senderId: viewerRole === "dispatcher" ? "dispatcher-1" : "owner-1",
      content,
      timestamp,
      isRead: true,
    };
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId ? { ...chat, messages: [...chat.messages, newMsg], lastActivity: "Just now" } : chat
      )
    );
    setTimeout(() => {
      const responseMsg: DirectMessage = {
        id: `dm-${Date.now()}-r`,
        senderId: chatId.includes("owner") ? "owner-1" : "dispatcher-2",
        content: MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)],
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        isRead: false,
      };
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, responseMsg], lastActivity: "Just now", unreadCount: chat.unreadCount + 1 }
            : chat
        )
      );
    }, 1500);
  }, []);

  const markAsRead = useCallback((chatId: string) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? { ...chat, unreadCount: 0, messages: chat.messages.map((m) => ({ ...m, isRead: true })) }
          : chat
      )
    );
  }, []);

  const getUnreadCount = useCallback((chatId: string) => chats.find((c) => c.id === chatId)?.unreadCount ?? 0, [chats]);

  const getTotalUnreadCount = useCallback(() => chats.reduce((sum, c) => sum + c.unreadCount, 0), [chats]);

  return (
    <IntegratedChatContext.Provider value={{ chats, sendMessage, markAsRead, getUnreadCount, getTotalUnreadCount }}>
      {children}
    </IntegratedChatContext.Provider>
  );
};

export const useIntegratedChat = () => {
  const context = useContext(IntegratedChatContext);
  if (!context) throw new Error("useIntegratedChat must be used within an IntegratedChatProvider");
  return context;
};
