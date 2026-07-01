// // src/modules/chat/chat.service.js
// ===================Latest Code====================

import * as ChatModel from "./chat.model.js";
import { ApiError } from "../../utils/api.util.js";
import { withTransaction } from "../../utils/withTransaction.js";

export const sendOneToOneMessage = async ({ senderId, payload }) => {
  const {
    receiver_id,
    message_text = null,
    media = [],
    parent_message_id = null,
    temp_id,
  } = payload;

  return withTransaction(async (conn) => {
    /* 1️⃣ BLOCK CHECK */
    const blocked = await ChatModel.isUserBlocked(conn, senderId, receiver_id);
    if (blocked) {
      throw new ApiError([403, "User is blocked"]);
    }

    /* 2️⃣ FIND / CREATE CONVERSATION */
    const conversationId = await ChatModel.findOrCreateOneToOneConversation(
      conn,
      senderId,
      receiver_id
    );

    /* 3️⃣ CREATE MESSAGE */
    const messageId = await ChatModel.createMessage(conn, {
      conversationId,
      senderId,
      message_text,
      parent_message_id,
      media,
      story_id: payload.story_id || null,
    });

    /* 4️⃣ DELIVERY STATUS */
    await ChatModel.createDeliveryStatus(conn, messageId, receiver_id);

    /* 5️⃣ FULL MESSAGE */
    const fullMessage = await ChatModel.getMessageById(conn, messageId);

    return {
      receiverId: receiver_id,
      senderPayload: {
        temp_id,
        message: fullMessage,
      },
      receiverPayload: {
        message: fullMessage,
      },
    };
  });
};

/* ===============================
   DELIVERY
=============================== */
export const markDelivered = async (messageId, userId) => {
  return withTransaction(async (conn) => {
    await ChatModel.updateDeliveryStatus(conn, messageId, userId, "delivered");
  });
};

/* ===============================
   READ
=============================== */
export const markRead = async (conversationId, messageIds, userId) => {
  return withTransaction(async (conn) => {
    await ChatModel.markMessagesRead(conn, conversationId, messageIds, userId);
  });
};

/* ===============================
   CREATE GROUP
=============================== */
export const createGroup = async ({ creatorId, payload }) => {
  const { name, description = null, group_image = null, participant_ids = [] } = payload;

  return withTransaction(async (conn) => {
    // Create conversation
    const conversationId = await ChatModel.createConversation(conn, "group", creatorId);

    // Create group details
    const group = await ChatModel.createGroupDetails(conn, {
      conversationId,
      name,
      description,
      group_image,
    });

    // Add participants
    await ChatModel.addParticipant(conn, conversationId, creatorId, "admin");
    for (const uid of participant_ids) {
      await ChatModel.addParticipant(conn, conversationId, uid, "member");
    }

    return {
      conversation_id: conversationId,
      participantIds: participant_ids,
      group,
    };
  });
};

/* ===============================
   ENSURE PARTICIPANT
=============================== */
export const ensureParticipant = async (conversationId, userId) => {
  return withTransaction(async (conn) => {
    const ok = await ChatModel.isParticipant(conn, conversationId, userId);
    if (!ok) throw new ApiError([403, "Not a group member"]);
  });
};

/* ===============================
   SEND GROUP MESSAGE
=============================== */
export const sendGroupMessage = async ({ senderId, payload }) => {
  const {
    conversation_id,
    message_text = null,
    media = [],
    parent_message_id = null,
    temp_id,
  } = payload;

  return withTransaction(async (conn) => {
    // Participant check
    const ok = await ChatModel.isParticipant(conn, conversation_id, senderId);
    if (!ok) throw new ApiError([403, "Not a group member"]);

    // Create message
    const messageId = await ChatModel.createMessage(conn, {
      conversationId: conversation_id,
      senderId,
      message_text,
      parent_message_id,
      media,
      story_id: payload.story_id || null,
    });

    // Delivery for all except sender
    const members = await ChatModel.getParticipants(conn, conversation_id);
    for (const m of members) {
      if (m.user_id !== senderId) {
        await ChatModel.createDeliveryStatus(conn, messageId, m.user_id);
      }
    }

    const message = await ChatModel.getMessageById(conn, messageId);
    return { temp_id, message };
  });
};

/* ===============================
   PARTICIPANTS MGMT
=============================== */
export const addParticipants = async (conversationId, adminId, userIds) => {
  return withTransaction(async (conn) => {
    const isAdminUser = await ChatModel.isAdmin(conn, conversationId, adminId);
    if (!isAdminUser) throw new ApiError([403, "Only admin allowed"]);

    for (const uid of userIds) {
      await ChatModel.addParticipant(conn, conversationId, uid, "member");
    }
  });
};

export const removeParticipant = async (conversationId, adminId, userId) => {
  return withTransaction(async (conn) => {
    const isAdminUser = await ChatModel.isAdmin(conn, conversationId, adminId);
    if (!isAdminUser) throw new ApiError([403, "Only admin allowed"]);
    
    await ChatModel.deactivateParticipant(conn, conversationId, userId);
  });
};

export const leaveGroup = async (conversationId, userId) => {
  return withTransaction(async (conn) => {
    await ChatModel.deactivateParticipant(conn, conversationId, userId);
  });
};

/* ===============================
   MUTE / UNMUTE
=============================== */
export const muteConversation = async ({ conversationId, userId, duration }) => {
  return withTransaction(async (conn) => {
    const isMember = await ChatModel.isParticipant(conn, conversationId, userId);
    if (!isMember) throw new ApiError([403, "Not a conversation participant"]);

    const mutedUntil =
      duration && Number(duration) > 0
        ? new Date(Date.now() + Number(duration) * 60000)
        : null;

    await ChatModel.setMuteStatus(conn, conversationId, userId, true, mutedUntil);

    return { conversation_id: conversationId, muted_until: mutedUntil };
  });
};

export const unmuteConversation = async ({ conversationId, userId }) => {
  return withTransaction(async (conn) => {
    const isMember = await ChatModel.isParticipant(conn, conversationId, userId);
    if (!isMember) throw new ApiError([403, "Not a conversation participant"]);

    await ChatModel.setMuteStatus(conn, conversationId, userId, false, null);

    return { conversation_id: conversationId, muted_until: null };
  });
};

/* ===============================
   BLOCK
=============================== */
export const blockUser = async ({ blockerId, blockedId, reason }) => {
  if (blockerId === blockedId) {
    throw new ApiError([400, "You cannot block yourself"]);
  }

  return withTransaction(async (conn) => {
    await ChatModel.blockUser(conn, blockerId, blockedId, reason);
    return { blocked_id: blockedId };
  });
};

/* ===============================
   UNBLOCK
=============================== */
export const unblockUser = async ({ blockerId, blockedId }) => {
  return withTransaction(async (conn) => {
    await ChatModel.unblockUser(conn, blockerId, blockedId);
    return { unblocked_id: blockedId };
  });
};

/* ===============================
   ENFORCEMENT (REUSABLE)
=============================== */
export const ensureNotBlocked = async (conn, userA, userB) => {
  const blocked = await ChatModel.isBlockedBetweenUsers(conn, userA, userB);
  if (blocked) {
    throw new ApiError([403, "User is blocked"]);
  }
};

/* ===============================
   CONVERSATION BOOTSTRAP
=============================== */
export const getConversationBootstrap = async (userId) => {
  return withTransaction(async (conn) => {
    const conversations = await ChatModel.getUserConversations(conn, userId);

    return {
      conversations,
      fetched_at: new Date(),
    };
  });
};

/* ===============================
   UNREAD COUNT (PER CONVERSATION)
=============================== */
export const getUnreadCountForConversation = async (userId, conversationId) => {
  return withTransaction(async (conn) => {
    const isMember = await ChatModel.isParticipant(conn, conversationId, userId);
    if (!isMember) {
      throw new ApiError([403, "Not a conversation participant"]);
    }

    return await ChatModel.getUnreadCountForConversation(
      conn,
      conversationId,
      userId
    );
  });
};

/* ===============================
   PARTICIPANTS (IDS)
=============================== */
export const getParticipantIds = async (conversationId) => {
  return withTransaction(async (conn) => {
    const rows = await ChatModel.getParticipants(conn, conversationId);
    return rows.map((r) => r.user_id);
  });
};

/* ===============================
   GET CONVERSATION MESSAGES (PAGINATED)
=============================== */
export const getConversationMessages = async ({
  userId,
  conversationId,
  beforeMessageId = null,
  limit = 50,
}) => {
  return withTransaction(async (conn) => {
    console.log( userId,
  conversationId,"ggggggggggggggg")
    const isMember = await ChatModel.isParticipant(conn, conversationId, userId);
    if (!isMember) {
      throw new ApiError([403, "Not a conversation participant"]);
    }

    const messages = await ChatModel.getConversationMessages(
      conn,
      conversationId,
      userId,
      beforeMessageId,
      limit
    );

    return messages;
  });
};

/* ===============================
   MESSAGE DETAILS
=============================== */
export const getMessageById = async (messageId) => {
  return withTransaction(async (conn) => {
    return await ChatModel.getMessageById(conn, messageId);
  });
};
