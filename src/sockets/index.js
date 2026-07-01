// ========Latest Code=================
import { Server } from "socket.io";
import { socketAuthGuard } from "../middlewares/auth.middleware.js";
import { registerChatSocket } from "../modules/chat/chat.socket.js";

export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  console.log("🧩 Socket.IO initializing...");

  // 🔐 Auth middleware
  io.use(socketAuthGuard);

  // Register chat socket handlers
  registerChatSocket(io);

  return io;
};