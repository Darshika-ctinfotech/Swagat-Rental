import path from 'path';
import { SERVER_ERROR } from './message.util.js';
import { isEmpty } from './misc.util.js';
import { __dirname } from '../constants.js';

const PROJECT_ROOT = path.resolve(__dirname, '../../');

/**
 * Custom API Error for structured error throwing
 */
export class ApiError extends Error {
  constructor([statusCode, msg], item = null, internal = null, isOperational = true) {
    super(msg.replace(/:item/g, item ?? ''));
    this.statusCode = statusCode;
    this.item = item;
    this.internal = internal;
    this.isOperational = isOperational;
  }
}

/**
 * Universal async error handler for controller functions
 */
export const apiHandler = (requestHandler) => {
  return async (req, res, next) => {
    try {
      await requestHandler(req, res, next);
    } catch (err) {
      const shouldLog = !(err instanceof ApiError && err.isOperational);
      const includeStack = shouldLog;

      if (shouldLog) {
        console.error(err?.internal ?? err);
      }

      if (err instanceof ApiError) {
        return apiError([err.statusCode, err.message], err.item, includeStack ? err : null, res);
      }

      return apiError(SERVER_ERROR, null, includeStack ? err : null, res);
    }
  };
};

/**
 * Success response formatter
 */
export const apiResponse = ([statusCode, msg], item = null, data = null, res = null, type = "array", token = null) => {
  const message = msg.replace(/:item/g, item ?? '');
  const success = statusCode < 400;

  const response = {
    success,
    message,
    code: statusCode,
  };



  if (!isEmpty(data)) {
    response.data = data;
  } else {
    if (type == "array") {
      response.data = [];
    } else if (type === "object") {
      response.data = {};
    } else {
      response.data = null;
    }
  }

  if (token) {
    response.token = token;
  }

  if (res) {
    return res.status(statusCode).json(response);
  }

  return response;
};

/**
 * Error response formatter (with cleaned stack trace)
 */
export const apiError = ([statusCode, msg], item = null, err = null, res = null) => {
  const message = msg.replace(/:item/g, item ?? '');

  const errorResponse = {
    success: false,
    message,
    code: statusCode,
  };

  if (err) {
    if (Array.isArray(err)) {
      errorResponse.errors = err;
    } else {
      errorResponse.error = err.message;

      const stackLines = err.stack?.split('\n');
      if (stackLines?.length >= 2) {
        const rawPath = stackLines[1];
        const match = rawPath.match(/only-golf[\\/].*/);
        const relativePath = match ? match[0].replace(/\\/g, '/') : rawPath;
        errorResponse.stack = relativePath.trim();
      }
    }
  }

  if (res) {
    return res.status(statusCode).json(errorResponse);
  }

  return errorResponse;
};

// --- Helper to emit errors safely ---
export const handleSocketError = (socket, err) => {
  if (err instanceof ApiError) {
    socket.emit("error_message", { status: err.statusCode, message: err.message });
  } else {
    console.error("❌ Socket error:", err ? err.message : "Internal server error");
    socket.emit("error_message", { status: 500, message: err ? err.message : "Internal server error" });
  }
};
