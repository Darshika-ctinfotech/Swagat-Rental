// ================Latest Code=================
// // src/modules/chat/presence.store.js
// userId -> socketId
export const onlineUsers = new Map();

// conversationId -> Set(userId)
export const typingUsers = new Map();

/* ===============================
   ONLINE
=============================== */
export const setOnline = (userId, socketId) => {
  onlineUsers.set(userId, socketId);
};

export const setOffline = (userId) => {
  onlineUsers.delete(userId);
};

export const isOnline = (userId) => {
  return onlineUsers.has(userId);
};

/* ===============================
   TYPING
=============================== */
export const startTyping = (conversationId, userId) => {
  if (!typingUsers.has(conversationId)) {
    typingUsers.set(conversationId, new Set());
  }
  typingUsers.get(conversationId).add(userId);
};

export const stopTyping = (conversationId, userId) => {
  if (typingUsers.has(conversationId)) {
    typingUsers.get(conversationId).delete(userId);
    if (typingUsers.get(conversationId).size === 0) {
      typingUsers.delete(conversationId);
    }
  }
};