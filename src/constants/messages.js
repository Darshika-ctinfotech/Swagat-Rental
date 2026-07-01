/**
 * Common API Messages
 */
const MESSAGES = Object.freeze({
  // General
  SUCCESS: "Success",
  SERVER_ERROR: "Something went wrong. Please try again later.",

  // Auth
  LOGIN_SUCCESS: "Login successful",
  LOGOUT_SUCCESS: "Logout successful",
  INVALID_CREDENTIALS: "Invalid email or password",
  UNAUTHORIZED: "Unauthorized access",
  FORBIDDEN: "You do not have permission to perform this action",

  // User
  USER_CREATED: "User created successfully",
  USER_UPDATED: "User updated successfully",
  USER_NOT_FOUND: "User not found",

  // Validation
  VALIDATION_ERROR: "Validation error",

  // Chat
  MESSAGE_SENT: "Message sent successfully",
});

export default MESSAGES;
