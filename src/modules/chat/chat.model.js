// src/modules/chat/chat.model.js
// =====================Latest Code====================
/* ===============================
   BLOCK CHECK
=============================== */
export const isUserBlocked = async (conn, userA, userB) => {
  const [rows] = await conn.query(
    `SELECT id FROM user_blocks
     WHERE (blocker_id = ? AND blocked_id = ?)
        OR (blocker_id = ? AND blocked_id = ?)`,
    [userA, userB, userB, userA]
  );
  return rows.length > 0;
};

/* ===============================
   FIND / CREATE CONVERSATION
=============================== */
export const findOrCreateOneToOneConversation = async (conn, userA, userB) => {
  const [existing] = await conn.query(
    `
    SELECT c.id
    FROM conversations c
    JOIN conversation_participants p1 ON p1.conversation_id = c.id
    JOIN conversation_participants p2 ON p2.conversation_id = c.id
    WHERE c.type = 'one_to_one'
      AND p1.user_id = ?
      AND p2.user_id = ?
    LIMIT 1
    `,
    [userA, userB]
  );

  if (existing.length) return existing[0].id;

  const [conv] = await conn.query(
    `INSERT INTO conversations (type, created_by)
     VALUES ('one_to_one', ?)`,
    [userA]
  );

  const conversationId = conv.insertId;

  await conn.query(
    `INSERT INTO conversation_participants
     (conversation_id, user_id)
     VALUES (?, ?), (?, ?)`,
    [conversationId, userA, conversationId, userB]
  );

  return conversationId;
};

/* ===============================
   CREATE MESSAGE
=============================== */
export const createMessage = async (
  conn,
  { conversationId, senderId, message_text, parent_message_id, media, story_id = null }
) => {
  const type =
    media.length && message_text
      ? "text_media"
      : media.length
      ? "media"
      : "text";

  const [msg] = await conn.query(
    `INSERT INTO messages
     (conversation_id, sender_id, message_text, message_type, parent_message_id, story_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [conversationId, senderId, message_text, type, parent_message_id, story_id]
  );

  const messageId = msg.insertId;

  if (media.length) {
    for (const m of media) {
      await conn.query(
        `INSERT INTO message_media
         (message_id, file_id, url, file_type, file_size, storage_key)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [messageId, m.file_id, m.url, m.file_type, m.file_size, m.key]
      );
    }
  }

  return messageId;
};

/* ===============================
   DELIVERY STATUS
=============================== */
export const createDeliveryStatus = async (conn, messageId, userId) => {
  await conn.query(
    `INSERT INTO message_delivery_status
     (message_id, user_id)
     VALUES (?, ?)`,
    [messageId, userId]
  );
};

/* ===============================
   FETCH MESSAGE
=============================== */
export const getMessageById = async (conn, messageId) => {
  const [[msg]] = await conn.query(
    `
    SELECT
      m.*,
      s.id AS story_id,
      s.media_url AS story_media_url,
      s.media_type AS story_media_type,
      s.caption AS story_caption,
      s.created_at AS story_created_at,
      u.full_name,
      u.profile_image,
      pm.id AS parent_id,
      pm.message_text AS parent_message_text,
      pm.message_type AS parent_message_type,
      pm.sender_id AS parent_sender_id,
      pm.created_at AS parent_created_at,
      pu.full_name AS parent_full_name,
      pu.profile_image AS parent_profile_image
    FROM messages m
    JOIN clients u ON u.id = m.sender_id
    LEFT JOIN stories s ON s.id = m.story_id
    LEFT JOIN messages pm ON pm.id = m.parent_message_id
    LEFT JOIN clients pu ON pu.id = pm.sender_id
    WHERE m.id = ?
    `,
    [messageId]
  );

  if (!msg) return null;

  const [media] = await conn.query(
    `SELECT * FROM message_media WHERE message_id = ?`,
    [messageId]
  );

  msg.media = media;
  msg.story = msg.story_id
    ? {
        id: msg.story_id,
        media_url: msg.story_media_url,
        media_type: msg.story_media_type,
        caption: msg.story_caption,
        created_at: msg.story_created_at,
      }
    : null;

  delete msg.story_media_url;
  delete msg.story_media_type;
  delete msg.story_caption;
  delete msg.story_created_at;
  msg.parent_message = msg.parent_id
    ? {
        id: msg.parent_id,
        message_text: msg.parent_message_text,
        message_type: msg.parent_message_type,
        sender_id: msg.parent_sender_id,
        created_at: msg.parent_created_at,
        full_name: msg.parent_full_name,
        profile_image: msg.parent_profile_image,
      }
    : null;

  delete msg.parent_id;
  delete msg.parent_message_text;
  delete msg.parent_message_type;
  delete msg.parent_sender_id;
  delete msg.parent_created_at;
  delete msg.parent_full_name;
  delete msg.parent_profile_image;

  return msg;
};

/* ===============================
   UPDATE STATUS
=============================== */
export const updateDeliveryStatus = async (conn, messageId, userId, status) => {
  await conn.query(
    `UPDATE message_delivery_status
     SET status = ?, updated_at = NOW()
     WHERE message_id = ? AND user_id = ?`,
    [status, messageId, userId]
  );
};

/* ===============================
   READ
=============================== */
export const markMessagesRead = async (conn, conversationId, messageIds, userId) => {
  if (!messageIds || messageIds.length === 0) return;

  const placeholders = messageIds.map(() => '?').join(',');
  
  await conn.query(
    `UPDATE message_delivery_status
     SET status = 'read', updated_at = NOW()
     WHERE message_id IN (${placeholders}) AND user_id = ?`,
    [...messageIds, userId]
  );

  await conn.query(
    `UPDATE conversation_participants
     SET last_read_at = NOW()
     WHERE conversation_id = ? AND user_id = ?`,
    [conversationId, userId]
  );
};

/* ===============================
   CONVERSATION / GROUP
=============================== */
export const createConversation = async (conn, type, createdBy) => {
  const [res] = await conn.query(
    `INSERT INTO conversations (type, created_by) VALUES (?, ?)`,
    [type, createdBy]
  );
  return res.insertId;
};

export const createGroupDetails = async (conn, data) => {
  const { conversationId, name, description, group_image } = data;
  await conn.query(
    `INSERT INTO groups (conversation_id, name, description, group_image)
     VALUES (?, ?, ?, ?)`,
    [conversationId, name, description, group_image]
  );
  return { conversation_id: conversationId, name, description, group_image };
};

/* ===============================
   PARTICIPANTS
=============================== */
export const addParticipant = async (conn, conversationId, userId, role) => {
  await conn.query(
    `INSERT IGNORE INTO conversation_participants
     (conversation_id, user_id, role)
     VALUES (?, ?, ?)`,
    [conversationId, userId, role]
  );
};

export const deactivateParticipant = async (conn, conversationId, userId) => {
  await conn.query(
    `UPDATE conversation_participants
     SET is_active = 0, left_at = NOW()
     WHERE conversation_id = ? AND user_id = ?`,
    [conversationId, userId]
  );
};

export const setMuteStatus = async (
  conn,
  conversationId,
  userId,
  isMuted,
  mutedUntil = null
) => {
  await conn.query(
    `UPDATE conversation_participants
     SET is_muted = ?, muted_until = ?, updated_at = NOW()
     WHERE conversation_id = ? AND user_id = ?`,
    [isMuted ? 1 : 0, mutedUntil, conversationId, userId]
  );
};

export const isParticipant = async (conn, conversationId, userId) => {
  const [r] = await conn.query(
    `SELECT id FROM conversation_participants
     WHERE conversation_id = ? AND user_id = ? AND is_active = 1`,
    [conversationId, userId]
  );
  return r.length > 0;
};

export const isAdmin = async (conn, conversationId, userId) => {
  const [r] = await conn.query(
    `SELECT id FROM conversation_participants
     WHERE conversation_id = ? AND user_id = ? AND role = 'admin'`,
    [conversationId, userId]
  );
  return r.length > 0;
};

export const getParticipants = async (conn, conversationId) => {
  const [rows] = await conn.query(
    `SELECT user_id FROM conversation_participants
     WHERE conversation_id = ? AND is_active = 1`,
    [conversationId]
  );
  return rows;
};

/* ===============================
   BLOCK CHECK (BOTH DIRECTIONS)
=============================== */
export const isBlockedBetweenUsers = async (conn, userA, userB) => {
  const [rows] = await conn.query(
    `
    SELECT id FROM user_blocks
    WHERE (blocker_id = ? AND blocked_id = ?)
       OR (blocker_id = ? AND blocked_id = ?)
    LIMIT 1
    `,
    [userA, userB, userB, userA]
  );
  return rows.length > 0;
};

/* ===============================
   BLOCK USER
=============================== */
export const blockUser = async (conn, blockerId, blockedId, reason = null) => {
  await conn.query(
    `
    INSERT IGNORE INTO user_blocks (blocker_id, blocked_id, reason)
    VALUES (?, ?, ?)
    `,
    [blockerId, blockedId, reason]
  );
};

/* ===============================
   UNBLOCK USER
=============================== */
export const unblockUser = async (conn, blockerId, blockedId) => {
  await conn.query(
    `
    DELETE FROM user_blocks
    WHERE blocker_id = ? AND blocked_id = ?
    `,
    [blockerId, blockedId]
  );
};

/* ===============================
   GET USER CONVERSATIONS
=============================== */
export const getUserConversations = async (conn, userId) => {
  const [rows] = await conn.query(
    `
    SELECT
      c.id AS conversation_id,
      c.type,

      g.name AS group_name,
      g.group_image,

      lm.id AS last_message_id,
      lm.sender_id AS last_sender_id,
      lm.message_text AS last_message,
      lm.message_type,
      lm.created_at AS last_message_time,
      CASE
        WHEN lm.sender_id = ? THEN (
          SELECT CASE
            WHEN SUM(CASE WHEN mds2.status = 'read' THEN 1 ELSE 0 END) > 0 THEN 'read'
            WHEN SUM(CASE WHEN mds2.status = 'delivered' THEN 1 ELSE 0 END) > 0 THEN 'delivered'
            ELSE 'sent'
          END
          FROM message_delivery_status mds2
          WHERE mds2.message_id = lm.id
        )
        ELSE COALESCE(mds_last.status, 'sent')
      END AS last_message_status,

      u_other.id AS opposite_user_id,
      u_other.full_name,
      u_other.profile_image,

      (
        SELECT COUNT(*)
        FROM message_delivery_status mds
        JOIN messages m ON m.id = mds.message_id
        WHERE m.conversation_id = c.id
          AND mds.user_id = ?
          AND mds.status != 'read'
          AND m.sender_id != ?
      ) AS unread_count
      ,
      CASE
        WHEN c.type = 'one_to_one' AND EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE b.blocker_id = ? AND b.blocked_id = u_other.id
        ) THEN 1 ELSE 0
      END AS blocked_by_me,
      CASE
        WHEN c.type = 'one_to_one' AND EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE b.blocker_id = u_other.id AND b.blocked_id = ?
        ) THEN 1 ELSE 0
      END AS blocked_me,
      cp.is_muted,
      cp.muted_until

    FROM conversations c

    JOIN conversation_participants cp
      ON cp.conversation_id = c.id
      AND cp.user_id = ?
      AND cp.is_active = 1

    LEFT JOIN conversation_participants cp_other
      ON cp_other.conversation_id = c.id
      AND cp_other.user_id != cp.user_id
      AND cp_other.is_active = 1
      AND c.type = 'one_to_one'

    LEFT JOIN messages lm
      ON lm.id = (
        SELECT id
        FROM messages
        WHERE conversation_id = c.id
          AND is_deleted = 0
        ORDER BY id DESC
        LIMIT 1
      )

    LEFT JOIN message_delivery_status mds_last
      ON mds_last.message_id = lm.id
     AND mds_last.user_id = ?

    LEFT JOIN clients u_other ON u_other.id = cp_other.user_id
    LEFT JOIN groups g ON g.conversation_id = c.id

    ORDER BY lm.created_at DESC
    `,
    [userId, userId, userId, userId, userId, userId, userId]
  );
console.log(rows ,"rows-------------rowssss------------")
  return rows;
};

/* ===============================
   UNREAD COUNT (PER CONVERSATION)
=============================== */
export const getUnreadCountForConversation = async (
  conn,
  conversationId,
  userId
) => {
  const [[row]] = await conn.query(
    `
    SELECT COUNT(*) AS unread_count
    FROM message_delivery_status mds
    JOIN messages m ON m.id = mds.message_id
    WHERE m.conversation_id = ?
      AND mds.user_id = ?
      AND mds.status != 'read'
      AND m.sender_id != ?
    `,
    [conversationId, userId, userId]
  );

  return row?.unread_count || 0;
};

/* ===============================
   GET CONVERSATION MESSAGES (PAGINATED)
=============================== */
export const getConversationMessages = async (
  conn,
  conversationId,
  userId,
  beforeMessageId = null,
  limit = 50
) => {
  const safeLimit = Math.min(Number(limit) || 50, 500);

  const params = [userId, userId, conversationId];
  let beforeClause = "";

  if (beforeMessageId) {
    beforeClause = "AND m.id < ?";
    params.push(beforeMessageId);
  }

  params.push(safeLimit);

  const [rows] = await conn.query(
    `
    SELECT
      m.*,
      u.full_name,
      u.profile_image,
      s.id AS story_id,
      s.media_url AS story_media_url,
      s.media_type AS story_media_type,
      s.caption AS story_caption,
      s.created_at AS story_created_at,
      pm.id AS parent_id,
      pm.message_text AS parent_message_text,
      pm.message_type AS parent_message_type,
      pm.sender_id AS parent_sender_id,
      pm.created_at AS parent_created_at,
      pu.full_name AS parent_full_name,
      pu.profile_image AS parent_profile_image,
      CASE
        WHEN m.sender_id = ? THEN (
          SELECT CASE
            WHEN SUM(CASE WHEN mds2.status = 'read' THEN 1 ELSE 0 END) > 0 THEN 'read'
            WHEN SUM(CASE WHEN mds2.status = 'delivered' THEN 1 ELSE 0 END) > 0 THEN 'delivered'
            ELSE 'sent'
          END
          FROM message_delivery_status mds2
          WHERE mds2.message_id = m.id
        )
        ELSE COALESCE(mds.status, 'sent')
      END AS status
    FROM messages m
    JOIN clients u ON u.id = m.sender_id
    LEFT JOIN stories s ON s.id = m.story_id
    LEFT JOIN messages pm ON pm.id = m.parent_message_id
    LEFT JOIN clients pu ON pu.id = pm.sender_id
    LEFT JOIN message_delivery_status mds
      ON mds.message_id = m.id
     AND mds.user_id = ?
    WHERE m.conversation_id = ?
      AND m.is_deleted = 0
      ${beforeClause}
    ORDER BY m.id DESC
    LIMIT ?
    `,
    params
  );

  console.log(rows,"rowssss====================")

  if (!rows.length) return [];

  const messageIds = rows.map((r) => r.id);
  const placeholders = messageIds.map(() => "?").join(",");

  const [media] = await conn.query(
    `
    SELECT *
    FROM message_media
    WHERE message_id IN (${placeholders})
    `,
    messageIds
  );

  const mediaByMessage = new Map();
  for (const m of media) {
    if (!mediaByMessage.has(m.message_id)) {
      mediaByMessage.set(m.message_id, []);
    }
    mediaByMessage.get(m.message_id).push(m);
  }

  for (const msg of rows) {
    msg.media = mediaByMessage.get(msg.id) || [];
    msg.parent_message = msg.parent_id
      ? {
          id: msg.parent_id,
          message_text: msg.parent_message_text,
          message_type: msg.parent_message_type,
          sender_id: msg.parent_sender_id,
          created_at: msg.parent_created_at,
          full_name: msg.parent_full_name,
          profile_image: msg.parent_profile_image,
        }
      : null;

    msg.story = msg.story_id
      ? {
          id: msg.story_id,
          media_url: msg.story_media_url,
          media_type: msg.story_media_type,
          caption: msg.story_caption,
          created_at: msg.story_created_at,
        }
      : null;

    delete msg.story_media_url;
    delete msg.story_media_type;
    delete msg.story_caption;
    delete msg.story_created_at;

    delete msg.parent_id;
    delete msg.parent_message_text;
    delete msg.parent_message_type;
    delete msg.parent_sender_id;
    delete msg.parent_created_at;
    delete msg.parent_full_name;
    delete msg.parent_profile_image;
  }

  return rows;
};

