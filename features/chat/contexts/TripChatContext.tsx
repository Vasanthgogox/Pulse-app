import { createContext, useContext, useState, ReactNode, useCallback } from "react";

export type TripChatRole = "dispatcher" | "owner" | "driver";
export type MessageType = "text" | "challenge" | "update" | "question";

export interface TripChatParticipant {
  id: string;
  name: string;
  role: TripChatRole;
}

export interface TripChatMessage {
  id: string;
  tripId: string;
  senderId: string;
  senderName: string;
  senderRole: TripChatRole;
  content: string;
  timestamp: string;
  isRead: boolean;
  messageType: MessageType;
}

export interface TripChat {
  tripId: string;
  tripNumber: string;
  pickupArea: string;
  dropLocation: string;
  messages: TripChatMessage[];
  participants: TripChatParticipant[];
  lastActivity: string;
}

export const TRIP_QUICK_MESSAGES = {
  challenges: [
    "Vehicle breakdown - need assistance",
    "Traffic delay - updated ETA",
    "Weather issue - route change required",
    "Loading/unloading delay",
    "Documentation issue at checkpoint",
  ],
  questions: [
    "What is the exact pickup address?",
    "Any special handling instructions?",
    "Who is the receiver contact?",
    "Is the consignment ready?",
    "Any access restrictions at location?",
  ],
  updates: [
    "Driver has departed",
    "Reached pickup location",
    "Loading completed",
    "In transit - all good",
    "Delivered successfully",
  ],
};

interface TripChatContextType {
  chats: TripChat[];
  getChat: (tripId: string) => TripChat | undefined;
  sendMessage: (tripId: string, content: string, senderRole: TripChatRole, messageType?: MessageType) => void;
  getUnreadCount: (tripId: string, viewerRole: TripChatRole) => number;
  getTotalUnreadCount: (viewerRole: TripChatRole) => number;
  markAsRead: (tripId: string, viewerRole: TripChatRole) => void;
  initializeChat: (tripId: string, tripNumber: string, pickupArea: string, dropLocation: string, participants: TripChatParticipant[]) => void;
}

const TripChatContext = createContext<TripChatContextType | undefined>(undefined);

export const useTripChat = () => {
  const context = useContext(TripChatContext);
  if (!context) throw new Error("useTripChat must be used within a TripChatProvider");
  return context;
};

const formatTime = (date: Date) =>
  date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

const getSenderInfo = (role: TripChatRole) => {
  switch (role) {
    case "dispatcher": return { id: "dispatcher-1", name: "Express Logistics" };
    case "owner": return { id: "owner-1", name: "Sharma Transport" };
    case "driver": return { id: "driver-1", name: "Ramesh Kumar" };
  }
};

const initialChats: TripChat[] = [
  {
    tripId: "1",
    tripNumber: "TRP-2026-001",
    pickupArea: "Mumbai",
    dropLocation: "Delhi",
    messages: [
      { id: "msg1", tripId: "1", senderId: "dispatcher-1", senderName: "Express Logistics", senderRole: "dispatcher", content: "What is the exact pickup address for this consignment?", timestamp: "10:30 AM", isRead: true, messageType: "question" },
      { id: "msg2", tripId: "1", senderId: "owner-1", senderName: "Sharma Transport", senderRole: "owner", content: "Gate 3, Industrial Area, Andheri East. Ask for Mr. Patil.", timestamp: "10:32 AM", isRead: true, messageType: "text" },
      { id: "msg3", tripId: "1", senderId: "dispatcher-1", senderName: "Express Logistics", senderRole: "dispatcher", content: "Driver has departed. ETA 3 hours.", timestamp: "10:45 AM", isRead: false, messageType: "update" },
    ],
    participants: [
      { id: "dispatcher-1", name: "Express Logistics", role: "dispatcher" },
      { id: "owner-1", name: "Sharma Transport", role: "owner" },
    ],
    lastActivity: "10:45 AM",
  },
  {
    tripId: "2",
    tripNumber: "TRP-2026-002",
    pickupArea: "Pune",
    dropLocation: "Bangalore",
    messages: [
      { id: "msg4", tripId: "2", senderId: "owner-1", senderName: "Patel Logistics", senderRole: "owner", content: "Vehicle is ready for pickup. Driver will reach in 30 mins.", timestamp: "9:00 AM", isRead: true, messageType: "update" },
    ],
    participants: [
      { id: "dispatcher-1", name: "Express Logistics", role: "dispatcher" },
      { id: "owner-1", name: "Patel Logistics", role: "owner" },
    ],
    lastActivity: "9:00 AM",
  },
];

export const TripChatProvider = ({ children }: { children: ReactNode }) => {
  const [chats, setChats] = useState<TripChat[]>(initialChats);

  const getChat = useCallback((tripId: string) => chats.find((c) => c.tripId === tripId), [chats]);

  const sendMessage = useCallback(
    (tripId: string, content: string, senderRole: TripChatRole, messageType: MessageType = "text") => {
      const senderInfo = getSenderInfo(senderRole);
      const newMessage: TripChatMessage = {
        id: `msg-${Date.now()}`,
        tripId,
        senderId: senderInfo.id,
        senderName: senderInfo.name,
        senderRole,
        content,
        timestamp: formatTime(new Date()),
        isRead: false,
        messageType,
      };
      setChats((prev) =>
        prev.map((chat) =>
          chat.tripId === tripId
            ? { ...chat, messages: [...chat.messages, newMessage], lastActivity: formatTime(new Date()) }
            : chat
        )
      );
      const AUTO = ["Got it, will update you shortly.", "Understood. Thanks for the update.", "Noted. Driver has been informed.", "Okay, will coordinate accordingly.", "Thanks for letting me know."];
      setTimeout(() => {
        const otherRole: TripChatRole = senderRole === "dispatcher" ? "owner" : "dispatcher";
        const otherInfo = getSenderInfo(otherRole);
        const auto: TripChatMessage = {
          id: `msg-auto-${Date.now()}`,
          tripId,
          senderId: otherInfo.id,
          senderName: otherInfo.name,
          senderRole: otherRole,
          content: AUTO[Math.floor(Math.random() * AUTO.length)],
          timestamp: formatTime(new Date()),
          isRead: false,
          messageType: "text",
        };
        setChats((prev) =>
          prev.map((chat) =>
            chat.tripId === tripId
              ? { ...chat, messages: [...chat.messages, auto], lastActivity: formatTime(new Date()) }
              : chat
          )
        );
      }, 1500);
    },
    []
  );

  const getUnreadCount = useCallback(
    (tripId: string, viewerRole: TripChatRole) => {
      const chat = chats.find((c) => c.tripId === tripId);
      return chat ? chat.messages.filter((m) => !m.isRead && m.senderRole !== viewerRole).length : 0;
    },
    [chats]
  );

  const getTotalUnreadCount = useCallback(
    (viewerRole: TripChatRole) =>
      chats.reduce((total, chat) => total + chat.messages.filter((m) => !m.isRead && m.senderRole !== viewerRole).length, 0),
    [chats]
  );

  const markAsRead = useCallback(
    (tripId: string, viewerRole: TripChatRole) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.tripId === tripId
            ? { ...chat, messages: chat.messages.map((m) => (m.senderRole !== viewerRole ? { ...m, isRead: true } : m)) }
            : chat
        )
      );
    },
    []
  );

  const initializeChat = useCallback(
    (tripId: string, tripNumber: string, pickupArea: string, dropLocation: string, participants: TripChatParticipant[]) => {
      setChats((prev) => {
        if (prev.find((c) => c.tripId === tripId)) return prev;
        return [...prev, { tripId, tripNumber, pickupArea, dropLocation, messages: [], participants, lastActivity: formatTime(new Date()) }];
      });
    },
    []
  );

  return (
    <TripChatContext.Provider value={{ chats, getChat, sendMessage, getUnreadCount, getTotalUnreadCount, markAsRead, initializeChat }}>
      {children}
    </TripChatContext.Provider>
  );
};
