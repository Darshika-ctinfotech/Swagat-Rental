# Swagat Rentals Admin/App Backend


## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js (ES Modules) |
| API | Express 5 |
| Realtime | Socket.IO |
| Database | MySQL (`mysql2/promise`) |
| File Upload | `multer` + `multer-s3` |
| Media Storage | AWS S3 / S3-compatible bucket |
| Auth | JWT |
| Email | Nodemailer (SMTP), SendGrid (optional/inactive path) |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start server with nodemon |
| `npm start` | Start server in normal mode |
| `npm test` | Placeholder test script |

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env`.
3. Start dev server:

```bash
npm run dev
```

4. API base URL:

```text
http://localhost:5000/api
```

## Environment Variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | No | `5000` | API server port |
| `DB_HOST` | Yes | - | MySQL host |
| `DB_USER` | Yes | - | MySQL username |
| `DB_PASSWORD` | Yes | - | MySQL password |
| `DB_NAME` | Yes | - | MySQL database name |
| `DB_PORT` | No | `3306` | MySQL port |
| `JWT_SECRET` | Yes | - | JWT signing key |
| `JWT_EXPIRY` | Recommended | - | JWT expiry duration |
| `CORS_ORIGIN` | Recommended | - | Allowed frontend origin |
| `APP_NAME` | No | `Swagat Rental` | App branding in templates |
| `APP_URL` | No | `http://localhost:<PORT>` | Public app/base URL |
| `SMTP_HOST` | Yes (if SMTP) | - | SMTP server host |
| `SMTP_PORT` | Yes (if SMTP) | - | SMTP server port |
| `EMAIL_USER` | Yes (if SMTP) | - | SMTP username |
| `EMAIL_PASS` | Yes (if SMTP) | - | SMTP password |
| `ADMIN_EMAIL` | Optional | - | Admin contact email |
| `SMTP_FROM_EMAIL` | Recommended | - | Sender email |
| `AWS_ACCESS_KEY_ID` | Yes (for uploads) | - | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | Yes (for uploads) | - | S3 secret key |
| `AWS_REGION` | Yes (for uploads) | - | Bucket region |
| `S3_BUCKET_NAME` | Yes (for uploads) | - | Bucket name |

## Authentication

| Item | Value |
| --- | --- |
| Auth type | Bearer JWT |
| HTTP header | `Authorization: Bearer <token>` |
| Socket auth | `socket.handshake.auth.token` or `Authorization` header |

## REST API Endpoints

### Auth (`/api/auth`)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/register` | No | Register new client |
| `POST` | `/verify-email` | No | Verify email via OTP |
| `POST` | `/resend-otp` | No | Resend verification OTP |
| `POST` | `/login` | No | Login client |
| `POST` | `/forgot-password` | No | Send reset password link |
| `GET` | `/reset-password/:token` | No | Render reset password page |
| `POST` | `/reset-password` | No | Submit new password |

### Clients (`/api/clients`)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/me` | Yes | Get logged-in client profile |
| `PUT` | `/profile` | Yes | Update profile (supports `profile_image` upload) |
| `GET` | `/chat-list` | Yes | List clients for chat/inbox |
| `GET` | `/:id` | Yes | Get client profile by id |

### Chat (`/api/chat`)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/upload-file` | No | Upload chat files (`files`, max 10) |
| `POST` | `/block` | Yes | Block user |
| `POST` | `/unblock` | Yes | Unblock user |

### Stories (`/api/stories`)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/` | Yes | Create story (file field: `media`) |
| `GET` | `/me` | Yes | Get my active stories |
| `GET` | `/feed` | Yes | Get story feed (self + conversation audience) |
| `POST` | `/:id/view` | Yes | Mark story as viewed |
| `GET` | `/:id/viewers` | Yes | Get viewers of my story |
| `DELETE` | `/:id` | Yes | Delete my story |

## Socket Events (Realtime)

### Client -> Server

| Event | Purpose |
| --- | --- |
| `bootstrap_conversations` | Load initial conversation bootstrap payload |
| `get_inbox` | Fetch inbox list |
| `join_conversation` | Join direct/group conversation room |
| `leave_conversation` | Leave conversation room |
| `send_message` | Send one-to-one message |
| `send_group_message` | Send message to group conversation |
| `message_delivered` | Mark message as delivered |
| `message_read` | Mark messages as read |
| `get_messages` | Fetch paginated message history |
| `create_group` | Create new group chat |
| `join_group` | Join group room |
| `leave_group` | Leave group |
| `add_group_participants` | Add clients in group |
| `remove_group_participant` | Remove user from group |
| `mute_conversation` | Mute conversation |
| `unmute_conversation` | Unmute conversation |
| `block_user` | Block a user |
| `unblock_user` | Unblock a user |
| `typing_start` | Start typing indicator |
| `typing_stop` | Stop typing indicator |
| `get_user_status` | Request online/offline status of clients |
| `get_online_users` | Get currently online user IDs |
| `check_user_online` | Check one user online status |
| `story_view` | Realtime story view action |
| `story_reply` | Reply to story as direct message |

### Server -> Client

| Event | Purpose |
| --- | --- |
| `conversation_bootstrap` | Initial conversation payload |
| `inbox_list` | Full inbox listing |
| `inbox_update` | Update latest message/unread state |
| `chat_history` | Push full conversation history |
| `message_sent` | Ack sent to sender |
| `new_message` | Receive direct message |
| `new_group_message` | Receive group message |
| `messages_loaded` | Paginated history response |
| `messages_read` | Read receipt update |
| `delivery_status_update` | Per-message delivery/read status |
| `unread_count_updated` | Updated unread count |
| `group_created` | Group created notification |
| `participant_joined` | User joined group |
| `participant_left` | User left group |
| `participants_added` | Participants added in group |
| `participant_removed` | Participant removed from group |
| `added_to_group` | You were added to a group |
| `removed_from_group` | You were removed from a group |
| `conversation_muted` | Conversation muted confirmation |
| `conversation_unmuted` | Conversation unmuted confirmation |
| `user_blocked` | Block success confirmation |
| `user_unblocked` | Unblock success confirmation |
| `blocked_by_user` | Notification when another user blocks you |
| `user_online` | Presence online broadcast |
| `user_offline` | Presence offline broadcast |
| `online_users_list` | Online clients snapshot |
| `user_online_status` | Single user online status response |
| `user_typing` | Typing indicator |
| `user_stopped_typing` | Typing indicator stop |
| `user_statuses` | Bulk user statuses |
| `story_created` | Story created broadcast to audience |
| `story_viewed` | Story viewed notification to story owner |
| `story_view_ack` | Story view acknowledgement to viewer |

## Database Tables (Used in Code)

| Table | Purpose |
| --- | --- |
| `clients` | Client account/profile records |
| `conversations` | Chat conversation metadata |
| `conversation_participants` | Members of conversations |
| `groups` | Group-chat specific details |
| `messages` | Message records |
| `message_media` | Media attached to messages |
| `message_delivery_status` | Sent/delivered/read tracking |
| `user_blocks` | Block/unblock mapping |
| `stories` | Story posts |
| `story_views` | Story view tracking |

## Story Tables Reference

### `stories`

| Column (used in code) | Description |
| --- | --- |
| `id` | Story primary identifier |
| `user_id` | Story owner user id |
| `media_url` | Story media URL |
| `media_type` | Story media MIME/type |
| `caption` | Optional story caption |
| `created_at` | Story creation timestamp |
| `is_deleted` | Soft delete flag |
| `deleted_at` | Soft delete timestamp |

### `story_views`

| Column (used in code) | Description |
| --- | --- |
| `story_id` | Viewed story id |
| `viewer_id` | User id who viewed the story |
| `viewed_at` | Story view timestamp |

## Project Structure

| Path | Responsibility |
| --- | --- |
| `src/app.js` | Express app and middleware setup |
| `src/server.js` | HTTP server bootstrap + Socket init |
| `src/routes` | API route registry |
| `src/modules/auth` | Auth controller/service/model/validation |
| `src/modules/user` | User profile and chat list APIs |
| `src/modules/chat` | Chat REST + realtime handlers |
| `src/modules/story` | Story REST + realtime integration |
| `src/middlewares` | Auth, validation, error handling |
| `src/utils` | Shared helpers (API, JWT, email, AWS) |
| `src/sockets` | Socket.IO bootstrap and IO store |
| `src/views` | Email and reset-password templates |

## Notes

| Item | Details |
| --- | --- |
| Story lifecycle | Stories are considered active for 24 hours |
| Upload target | S3-compatible storage is used via `multer-s3` |
| Default socket room | Each user joins room `user:<user_id>` |

