// =========================Latest Code=====================
// // src/modules/chat/presence.socket.js
import {
  setOnline,
  setOffline,
  startTyping,
  stopTyping,
  isOnline,
} from "./presence.store.js";

export const registerPresenceSocket = (io, socket) => {
  const userId = socket.user.user_id;

  /* ===============================
     ONLINE
  =============================== */
  setOnline(userId, socket.id);

  socket.broadcast.emit("user_online", {
    user_id: userId,
  });

  /* ===============================
     TYPING START
  =============================== */
  socket.on("typing_start", ({ conversation_id }) => {
    startTyping(conversation_id, userId);

    socket.to(`conversation:${conversation_id}`).emit("user_typing", {
      conversation_id,
      user_id: userId,
    });
  });

  /* ===============================
     TYPING STOP
  =============================== */
  socket.on("typing_stop", ({ conversation_id }) => {
    stopTyping(conversation_id, userId);

    socket.to(`conversation:${conversation_id}`).emit("user_stopped_typing", {
      conversation_id,
      user_id: userId,
    });
  });

  /* ===============================
     USER STATUS REQUEST
  =============================== */
  socket.on("get_user_status", ({ user_ids }) => {
    const statuses = user_ids.map((id) => ({
      user_id: id,
      online: isOnline(id),
    }));

    socket.emit("user_statuses", statuses);
  });

  /* ===============================
     DISCONNECT
  =============================== */
  socket.on("disconnect", () => {
    setOffline(userId);

    socket.broadcast.emit("user_offline", {
      user_id: userId,
      last_seen: new Date(),
    });
  });
};