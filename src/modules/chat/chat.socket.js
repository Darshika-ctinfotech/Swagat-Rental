
// ================Latest Code====================
// // src/modules/chat/chat.socket.js
import * as ChatService from "./chat.service.js";
import { registerPresenceSocket } from "./presence.socket.js";
// import * as StoryService from "../story/story.service.js";

export const registerChatSocket = (io) => {
  io.on("connection", (socket) => {
    const userId = socket.user.user_id;

    console.log(userId,"userIdddddddddddddddddddddddddddddddddddddddddddddddd")

    console.log("✅ Chat socket connected:", userId);
    console.log("🆔 Socket ID:", socket.id);

    // Personal room (for direct emits) - consistent naming
    socket.join(`user:${userId}`);
    console.log(`📦 Joined room: user:${userId}`);

    // Register presence handlers
    registerPresenceSocket(io, socket);

    const isUserActiveInConversation = (targetUserId, conversationId) => {
      const room = io.sockets.adapter.rooms.get(`user:${targetUserId}`);
      if (!room) return false;

      for (const socketId of room) {
        const s = io.sockets.sockets.get(socketId);
        if (s?.data?.activeConversationId === conversationId) {
          return true;
        }
      }

      return false;
    };

    const emitUnreadCount = async (targetUserId, conversationId) => {
      try {
        const unreadCount = await ChatService.getUnreadCountForConversation(
          targetUserId,
          conversationId
        );
        io.to(`user:${targetUserId}`).emit("unread_count_updated", {
          conversation_id: conversationId,
          unread_count: unreadCount,
        });
      } catch (err) {
        console.error("Unread count error:", err);
      }
    };

    const buildLastMessagePreview = (message) => {
      if (!message) return "";
      if (message.message_text && message.message_text.trim().length > 0) {
        return message.message_text.trim();
      }
      if (message.message_type) {
        return `[${message.message_type}]`;
      }
      return "New message";
    };

    const emitInboxList = async (targetUserId) => {
      try {
        const data = await ChatService.getConversationBootstrap(targetUserId);
        io.to(`user:${targetUserId}`).emit("inbox_list", {
          inbox: data.conversations,
        });
      } catch (err) {
        console.error("Inbox list error:", err);
      }
    };

    const emitChatHistory = async (conversationId, targetUserIds) => {
      try {
        const messages = await ChatService.getConversationMessages({
          userId,
          conversationId,
          beforeMessageId: null,
          limit: 500,
        });

        targetUserIds.forEach((uid) => {
          io.to(`user:${uid}`).emit("chat_history", {
            conversation_id: conversationId,
            messages,
          });
        });
      } catch (err) {
        console.error("Chat history emit error:", err);
      }
    };

    const getOnlineUserIds = () => {
      const ids = [];
      for (const roomId of io.sockets.adapter.rooms.keys()) {
        if (roomId.startsWith("user:")) {
          ids.push(roomId.replace("user:", ""));
        }
      }
      return ids;
    };

    const isUserOnline = (targetUserId) => {
      return io.sockets.adapter.rooms.has(`user:${targetUserId}`);
    };

    // Auto-load inbox list on connect
    emitInboxList(userId);

    /* ===============================
       BOOTSTRAP CONVERSATIONS
    =============================== */
    socket.on("bootstrap_conversations", async () => {
      try {
        const data = await ChatService.getConversationBootstrap(userId);
        socket.emit("conversation_bootstrap", data);
      } catch (err) {
        console.error("Bootstrap error:", err);
        socket.emit("bootstrap_error", {
          message: err.message,
        });
      }
    });

    /* ===============================
       GET INBOX
    =============================== */
    socket.on("get_inbox", async () => {
      await emitInboxList(userId);
    });

    /* ===============================
       JOIN CONVERSATION
    =============================== */
    socket.on("join_conversation", async ({ conversation_id }) => {
      try {
        await ChatService.ensureParticipant(conversation_id, userId);
        socket.join(`conversation:${conversation_id}`);
        socket.data.activeConversationId = conversation_id;
        console.log(`📦 User ${userId} joined conversation:${conversation_id}`);
      } catch (err) {
        socket.emit("join_error", {
          conversation_id,
          message: err.message,
        });
      }
    });

    /* ===============================
       LEAVE CONVERSATION
    =============================== */
    socket.on("leave_conversation", ({ conversation_id }) => {
      socket.leave(`conversation:${conversation_id}`);
      if (socket.data.activeConversationId === conversation_id) {
        socket.data.activeConversationId = null;
      }
    });

    /* ===============================
       SEND ONE-TO-ONE MESSAGE
    =============================== */
    socket.on("send_message", async (payload) => {
      try {
        const result = await ChatService.sendOneToOneMessage({
          senderId: userId,
          payload,
        });

        // Confirm to sender (sent)
        socket.emit("message_sent", {
          ...result.senderPayload,
          status: "sent",
        });

        // Send to receiver
        io.to(`user:${result.receiverId}`).emit(
          "new_message",
          {
            ...result.receiverPayload,
            status: "delivered",
          }
        );

        const message = result.senderPayload?.message;
        const conversationId = message?.conversation_id;
        const messageId = message?.id;
        const lastMessagePreview = buildLastMessagePreview(message);

        if (conversationId) {
          io.to(`user:${result.receiverId}`).emit("inbox_update", {
            conversation_id: conversationId,
            last_message: lastMessagePreview,
            last_message_at: message?.created_at || new Date().toISOString(),
            sender_id: userId,
            unread_increment: true,
          });

          socket.emit("inbox_update", {
            conversation_id: conversationId,
            last_message: lastMessagePreview,
            last_message_at: message?.created_at || new Date().toISOString(),
            unread_count: 0,
          });

          await emitInboxList(userId);
          await emitInboxList(result.receiverId);

          await emitChatHistory(conversationId, [userId, result.receiverId]);
        }

        if (conversationId && messageId) {
          const isActive = isUserActiveInConversation(
            result.receiverId,
            conversationId
          );
          if (isActive) {
            await ChatService.markRead(conversationId, [messageId], result.receiverId);
            io.to(`conversation:${conversationId}`).emit("messages_read", {
              conversation_id: conversationId,
              user_id: result.receiverId,
              message_ids: [messageId],
            });
            await emitUnreadCount(result.receiverId, conversationId);
          } else {
            await emitUnreadCount(result.receiverId, conversationId);
          }
        }
      } catch (err) {
        console.error("Send message error:", err);
        socket.emit("message_error", {
          temp_id: payload.temp_id,
          message: err.message,
        });
      }
    });

    /* ===============================
       MESSAGE DELIVERED
    =============================== */
    socket.on("message_delivered", async ({ message_id }) => {
      try {
        await ChatService.markDelivered(message_id, userId);
        const msg = await ChatService.getMessageById(message_id);
        if (msg?.sender_id) {
          io.to(`user:${msg.sender_id}`).emit("delivery_status_update", {
            message_id,
            conversation_id: msg.conversation_id,
            user_id: userId,
            status: "delivered",
            delivered_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error("Mark delivered error:", err);
      }
    });

    /* ===============================
       MESSAGE READ
    =============================== */
    socket.on("message_read", async ({ conversation_id, message_ids }) => {
      try {
        await ChatService.markRead(conversation_id, message_ids, userId);
        
        // Notify other participants
        socket.to(`conversation:${conversation_id}`).emit("messages_read", {
          conversation_id,
          user_id: userId,
          message_ids,
        });

        await emitUnreadCount(userId, conversation_id);

        // Emit per-message read status to original senders
        for (const messageId of message_ids || []) {
          const msg = await ChatService.getMessageById(messageId);
          if (msg?.sender_id) {
            io.to(`user:${msg.sender_id}`).emit("delivery_status_update", {
              message_id: messageId,
              conversation_id,
              user_id: userId,
              status: "read",
              read_at: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error("Mark read error:", err);
      }
    });

    /* ===============================
       CREATE GROUP
    =============================== */
    socket.on("create_group", async (payload) => {
      try {
        const result = await ChatService.createGroup({
          creatorId: userId,
          payload,
        });

        // Join creator
        socket.join(`conversation:${result.conversation_id}`);

        // Notify and join other participants
        result.participantIds.forEach((uid) => {
          io.to(`user:${uid}`).emit("group_created", result.group);
          // Make their sockets join the room when they connect
        });

        socket.emit("group_created", result.group);
      } catch (err) {
        console.error("Create group error:", err);
        socket.emit("group_error", { message: err.message });
      }
    });

    /* ===============================
       JOIN / LEAVE GROUP ROOM
    =============================== */
    socket.on("join_group", async ({ conversation_id }) => {
      try {
        await ChatService.ensureParticipant(conversation_id, userId);
        socket.join(`conversation:${conversation_id}`);
        
        // Notify other members
        socket.to(`conversation:${conversation_id}`).emit("participant_joined", {
          conversation_id,
          user_id: userId,
        });
      } catch (err) {
        console.error("Join group error:", err);
        socket.emit("join_error", { message: err.message });
      }
    });

    socket.on("leave_group", async ({ conversation_id }) => {
      try {
        await ChatService.leaveGroup(conversation_id, userId);
        socket.leave(`conversation:${conversation_id}`);
        
        io.to(`conversation:${conversation_id}`).emit("participant_left", {
          conversation_id,
          user_id: userId,
        });
      } catch (err) {
        console.error("Leave group error:", err);
        socket.emit("leave_error", { message: err.message });
      }
    });

    /* ===============================
       SEND GROUP MESSAGE
    =============================== */
    socket.on("send_group_message", async (payload) => {
      try {
        const result = await ChatService.sendGroupMessage({
          senderId: userId,
          payload,
        });

        io.to(`conversation:${payload.conversation_id}`).emit(
          "new_group_message",
          { message: result.message }
        );

        const conversationId = payload.conversation_id;
        const messageId = result?.message?.id;
        if (conversationId && messageId) {
          const participantIds = await ChatService.getParticipantIds(conversationId);

          const lastMessagePreview = buildLastMessagePreview(result?.message);
          for (const uid of participantIds) {
            io.to(`user:${uid}`).emit("inbox_update", {
              conversation_id: conversationId,
              last_message: lastMessagePreview,
              last_message_at: result?.message?.created_at || new Date().toISOString(),
              sender_id: userId,
              unread_increment: uid !== userId,
            });
            await emitInboxList(uid);
          }

          await emitChatHistory(conversationId, participantIds);

          for (const uid of participantIds) {
            if (uid === userId) continue;

            const isActive = isUserActiveInConversation(uid, conversationId);
            if (isActive) {
              await ChatService.markRead(conversationId, [messageId], uid);
              io.to(`conversation:${conversationId}`).emit("messages_read", {
                conversation_id: conversationId,
                user_id: uid,
                message_ids: [messageId],
              });
            }

            await emitUnreadCount(uid, conversationId);
          }
        }
      } catch (err) {
        console.error("Send group message error:", err);
        socket.emit("message_error", {
          temp_id: payload.temp_id,
          message: err.message,
        });
      }
    });

    /* ===============================
       ADD / REMOVE PARTICIPANTS
    =============================== */
    socket.on("add_group_participants", async ({ conversation_id, user_ids }) => {
      try {
        await ChatService.addParticipants(conversation_id, userId, user_ids);

        // Notify new participants
        user_ids.forEach((uid) => {
          io.to(`user:${uid}`).emit("added_to_group", {
            conversation_id,
          });
        });

        // Notify existing participants
        io.to(`conversation:${conversation_id}`).emit("participants_added", {
          conversation_id,
          user_ids,
        });
      } catch (err) {
        console.error("Add participants error:", err);
        socket.emit("participant_error", { message: err.message });
      }
    });

    /* ===============================
       MUTE / UNMUTE CONVERSATION
    =============================== */
    socket.on("mute_conversation", async ({ conversation_id, duration }) => {
      try {
        const result = await ChatService.muteConversation({
          conversationId: conversation_id,
          userId,
          duration,
        });

        socket.emit("conversation_muted", result);
      } catch (err) {
        console.error("Mute error:", err);
        socket.emit("mute_error", { message: err.message });
      }
    });

    socket.on("unmute_conversation", async ({ conversation_id }) => {
      try {
        const result = await ChatService.unmuteConversation({
          conversationId: conversation_id,
          userId,
        });

        socket.emit("conversation_unmuted", result);
      } catch (err) {
        console.error("Unmute error:", err);
        socket.emit("unmute_error", { message: err.message });
      }
    });

    socket.on("remove_group_participant", async ({ conversation_id, user_id }) => {
      try {
        await ChatService.removeParticipant(conversation_id, userId, user_id);
        
        // Notify removed user
        io.to(`user:${user_id}`).emit("removed_from_group", {
          conversation_id,
        });

        // Notify group
        io.to(`conversation:${conversation_id}`).emit("participant_removed", {
          conversation_id,
          user_id,
        });
      } catch (err) {
        console.error("Remove participant error:", err);
        socket.emit("participant_error", { message: err.message });
      }
    });

    /* ===============================
       BLOCK USER
    =============================== */
    socket.on("block_user", async ({ user_id, reason }) => {
      try {
        const result = await ChatService.blockUser({
          blockerId: userId,
          blockedId: user_id,
          reason,
        });

        socket.emit("user_blocked", result);

        // Notify blocked user (optional)
        io.to(`user:${user_id}`).emit("blocked_by_user", {
          user_id: userId,
        });
      } catch (err) {
        console.error("Block user error:", err);
        socket.emit("block_error", { message: err.message });
      }
    });

    /* ===============================
       UNBLOCK USER
    =============================== */
    socket.on("unblock_user", async ({ user_id }) => {
      try {
        const result = await ChatService.unblockUser({
          blockerId: userId,
          blockedId: user_id,
        });

        socket.emit("user_unblocked", result);
      } catch (err) {
        console.error("Unblock user error:", err);
        socket.emit("unblock_error", { message: err.message });
      }
    });

    // /* ===============================
    //    STORY VIEW (REALTIME)
    // =============================== */
    // socket.on("story_view", async ({ story_id }) => {
    //   try {
    //     const result = await StoryService.viewStory({
    //       storyId: Number(story_id),
    //       viewerId: userId,
    //     });

    //     io.to(`user:${result.owner_id}`).emit("story_viewed", {
    //       story_id: result.story_id,
    //       view_count: result.view_count,
    //       viewer_id: userId,
    //     });

    //     socket.emit("story_view_ack", {
    //       story_id: result.story_id,
    //       view_count: result.view_count,
    //     });
    //   } catch (err) {
    //     socket.emit("story_view_error", { message: err.message });
    //   }
    // });

    /* ===============================
       STORY REPLY (DIRECT MESSAGE)
    =============================== */
    socket.on("story_reply", async ({ story_id, receiver_id, message_text }) => {
      try {
        const payload = {
          receiver_id,
          message_text,
          story_id,
        };

        const result = await ChatService.sendOneToOneMessage({
          senderId: userId,
          payload,
        });

        socket.emit("message_sent", {
          ...result.senderPayload,
          status: "sent",
        });

        io.to(`user:${result.receiverId}`).emit("new_message", {
          ...result.receiverPayload,
          status: "delivered",
        });
      } catch (err) {
        socket.emit("story_reply_error", { message: err.message });
      }
    });

    /* ===============================
       GET MESSAGES (PAGINATED)
    =============================== */
    socket.on("get_messages", async ({ conversation_id, before_message_id, limit }) => {
      try {
        const messages = await ChatService.getConversationMessages({
          userId,
          conversationId: conversation_id,
          beforeMessageId: before_message_id || null,
          limit: limit || 50,
        });

        socket.join(`conversation:${conversation_id}`);
        socket.data.activeConversationId = conversation_id;

        const readableIds = messages
          .filter((m) => m.sender_id !== userId)
          .map((m) => m.id);

        if (readableIds.length > 0) {
          await ChatService.markRead(conversation_id, readableIds, userId);
          socket.to(`conversation:${conversation_id}`).emit("messages_read", {
            conversation_id,
            user_id: userId,
            message_ids: readableIds,
          });
        }

        socket.emit("messages_loaded", {
          conversation_id,
          messages,
          has_more: messages.length === Math.min(Number(limit) || 50, 100),
        });

        await emitUnreadCount(userId, conversation_id);
      } catch (err) {
        console.error("Load messages error:", err);
        socket.emit("load_error", { message: err.message });
      }
    });

    /* ===============================
       ONLINE USERS
    =============================== */
    socket.on("get_online_users", () => {
      const users = getOnlineUserIds();
      socket.emit("online_users_list", { users });
    });

    socket.on("check_user_online", ({ user_id }) => {
      const is_online = isUserOnline(String(user_id));
      socket.emit("user_online_status", { user_id, is_online });
    });

    /* ===============================
       DISCONNECT
    =============================== */
    socket.on("disconnect", (reason) => {
      socket.data.activeConversationId = null;
      console.log("❌ Chat socket disconnected:", userId);
      console.log("📴 Reason:", reason);
    });
  });
};
