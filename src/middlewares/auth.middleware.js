import jwt from "jsonwebtoken";
import { ApiError } from "../utils/api.util.js";
import STATUS_CODES from "../constants/statusCodes.js";
import ROLES from "../constants/roles.js";
import { env } from "../config/env.js";
import { isEmpty } from "../utils/misc.util.js";
import { getClientById } from "../modules/user/user.model.js";
import { getEmployeeById } from "../modules/employee/employee.model.js";

/* ------------------ helpers ------------------ */

const PUBLIC_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/auth/verify-email",
  "/auth/resend-otp",
  "/auth/forgot-password",
];

const isPublicRoute = (path) =>
  PUBLIC_ROUTES.some((route) => path.startsWith(route));

const extractToken = (authHeader) => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1];
};

const verifyAndGetUser = async (token) => {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  // Admin / super admin ko DB check skip kar sakte ho
  if (decoded.role === ROLES.ADMIN || decoded.role === ROLES.SUPER_ADMIN) {
    return decoded;
  }

  if (
    decoded.role === ROLES.EMPLOYEE ||
    decoded.role === ROLES.SUB_ADMIN ||
    decoded.employee_id
  ) {
    const employee = await getEmployeeById(decoded.employee_id);
    if (isEmpty(employee)) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Employee not found"]);
    }

    if (employee.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Account not found"]);
    }

    if (employee.is_disabled) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, "Account disabled by admin"]);
    }

    return decoded;
  }

  const client = await getClientById(decoded.user_id);
  if (isEmpty(client)) {
    throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Client not found"]);
  }

  if (client.is_deleted) {
    throw new ApiError([STATUS_CODES.NOT_FOUND, "Account not found"]);
  }

  if (client.is_disabled) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Account disabled by admin"]);
  }

  return decoded;
};

/* ------------------ HTTP AUTH GUARD ------------------ */

export const authGuard = async (req, res, next) => {
  try {
    if (isPublicRoute(req.path)) return next();

    const token = extractToken(req.headers.authorization);
    if (!token) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Missing or invalid token"]);
    }

    const user = await verifyAndGetUser(token);
    req.user = user;

    next();
  } catch (err) {
    next(err);
  }
};

export const adminGuard = (req, res, next) => {
  try {
    const role = req.user?.role;
    if (
      (req.user?.admin_id === undefined && req.user?.employee_id === undefined) ||
      (role !== ROLES.ADMIN && role !== ROLES.SUPER_ADMIN && role !== ROLES.SUB_ADMIN)
    ) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
    }

    next();
  } catch (err) {
    next(err);
  }
};

/* ------------------ SOCKET AUTH GUARD ------------------ */

export const socketAuthGuard = async (socket, next) => {
  try {
    let token = socket.handshake.auth?.token;

    if (!token) {
      const authHeader = socket.handshake.headers?.authorization;
      token = extractToken(authHeader);
    }

    if (!token) {
      return next(new Error("Authentication error: token missing"));
    }

    const user = await verifyAndGetUser(token);
    socket.user = user;

    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
};


