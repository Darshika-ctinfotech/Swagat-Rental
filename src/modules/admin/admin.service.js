import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import { withTransaction } from "../../utils/withTransaction.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as AdminModel from "./admin.model.js";
import * as AuthModel from "../auth/auth.model.js";
import * as UserModel from "../user/user.model.js";
import * as EmployeeModel from "../employee/employee.model.js";
import * as SystemModel from "../system/system.model.js";
import * as InventoryModel from "../inventory/inventory.model.js";
import {
  sendClientCreatedEmail,
  sendClientCreatedWhatsApp,
  sendEmployeeCreatedEmail,
  sendForgotPasswordLinkEmail,
  sendOtpVerificationEmail,
} from "../../utils/email.util.js";
import { comparePassword, hashPassword } from "../../utils/password.utils.js";
import { APP_URL, JWT_EXPIRY, JWT_SECRET } from "../../constants.js";
import { generateResetToken } from "../../utils/token.util.js";
import { buildPublicFileUrl, buildPublicUploadUrl, mapDocumentsWithUrl } from "../../utils/file-url.util.js";
import { deleteFileFromS3 } from "../../utils/aws.util.js";
import ROLES from "../../constants/roles.js";
import { syncClientSystemCounts } from "../system/system.service.js";
import * as PaymentModel from "../payment/payment.model.js";

//code by Drashika
import * as AgreementModel from "./admin.model.js";
// import { sendPushToAllClients } from "../../../notificationService.js";
import { pool } from "../../config/db.js"; 
import { sendPushToClient } from "../../../notificationService.js";
//=============================================================


const buildPaymentDashboardFromRow = (row = {}) => {
  const totalReceivable = Number(row.total_receivable || 0);
  const totalReceived = Number(row.total_received || 0);
  const totalOverdue = Number(row.total_overdue || 0);

  return {
    total_receivable: totalReceivable,
    total_received: totalReceived,
    total_pending: totalReceivable - totalReceived,
    total_overdue: totalOverdue,
  };
};

const hashResetToken = (token) =>
  createHash("sha256").update(token).digest("hex");

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const generatePassword = (length = 8) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let password = "";

  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return password;
};

const normalizeAssetField = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return String(value).trim();
};

const normalizeSpecJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
};

const normalizeNullableString = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};


const normalizeOptionalString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};

const normalizeNullableInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeNullableNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// moved to system.service.js

const pickPrimaryNetwork = (list = []) => {
  if (!Array.isArray(list)) return null;
  return (
    list.find(
      (n) => n && !n.internal && n.mac && n.mac !== "00:00:00:00:00:00"
    ) || list.find((n) => n && n.mac)
  );
};

const parseFullResponse = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return null;
  }
};

const deriveSystemMeta = (system) => {
  const info = parseFullResponse(system?.full_response);
  const systemInfo = info?.system_info || info;
  const osInfo = systemInfo?.osInfo || {};
  const osName = systemInfo?.os || osInfo.distro || osInfo.platform || null;
  const deviceName =
    systemInfo?.device_name ||
    systemInfo?.hostname ||
    osInfo.hostname ||
    osInfo.fqdn ||
    null;
  const network = systemInfo?.network || [];
  const primaryNetwork = pickPrimaryNetwork(network);

  return {
    device_name: deviceName || system?.device_name || null,
    device_type: osName || system?.device_type || null,
    ip_address:
      primaryNetwork?.ip4 ||
      systemInfo?.ip_address ||
      system?.ip_address ||
      null,
    mac_address:
      primaryNetwork?.mac ||
      systemInfo?.mac_address ||
      system?.mac_address ||
      null,
  };
};

const formatClientResponse = (client, documents = []) => ({
  ...client,
  profile_image_url: buildPublicFileUrl(client?.profile_image),
  documents: mapDocumentsWithUrl(documents),
});

const formatEmployeeResponse = (employee, documents = []) => ({
  ...employee,
  profile_image_url: buildPublicFileUrl(employee?.profile_image),
  documents: mapDocumentsWithUrl(documents),
});

export const registerAdmin = async (payload) => {
  return withTransaction(async (conn) => {
    const emailExists = await AdminModel.getAdminByEmail(conn, payload.email);
    if (emailExists) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyExists]);
    }

    const rawPassword = payload.password;
    const hashedPassword = await hashPassword(rawPassword);
    const otp = generateOtp();

    const adminData = {
      full_name: `${payload.full_name?.trim()}`,
      email: payload.email,
      password: hashedPassword,
      show_password: rawPassword,
      profile_image: payload.profile_image || null,
      role: payload.role || "admin",
      email_otp: otp,
      is_verified: 0,
    };

    const adminId = await AdminModel.createAdmin(conn, adminData);

    await sendOtpVerificationEmail({
      email: payload.email,
      otp,
    });

    return {
      id: adminId,
      full_name: adminData.full_name,
      email: adminData.email,
      role: adminData.role,
    };
  });
};

export const verifyEmailOtp = async ({ email, otp }) => {
  return withTransaction(async (conn) => {
    const admin = await AdminModel.getAdminForEmailVerification(conn, email);

    if (!admin) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (admin.is_verified) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyVerified]);
    }

    if (!admin.email_otp || admin.email_otp !== otp) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.invalidOtp]);
    }

    await AdminModel.markEmailVerified(conn, admin.id);

    return {
      email,
      is_verified: true,
    };
  });
};

export const resendEmailOtp = async (email) => {
  return withTransaction(async (conn) => {
    const admin = await AdminModel.getAdminForEmailVerification(conn, email);

    if (!admin) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (admin.is_verified) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyVerified]);
    }

    const newOtp = generateOtp();

    await AdminModel.updateEmailOtp(conn, admin.id, newOtp);

    await sendOtpVerificationEmail({
      email,
      otp: newOtp,
    });

    return {
      email,
    };
  });
};

export const loginAdmin = async ({ email, password, role }) => {
  return withTransaction(async (conn) => {
    const loginRole = role === "sub_admin" ? "sub_admin" : "admin";

    if (loginRole === "sub_admin") {
      const employee = await EmployeeModel.getEmployeeForLoginByEmail(conn, email);

      if (!employee) {
        throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
      }

      if (employee.is_deleted) {
        throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
      }

      if (employee.is_disabled) {
        throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.accountDisabled]);
      }

      if (!employee.is_verified) {
        throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.emailNotVerified]);
      }

      if (String(employee.role || "").toLowerCase() !== "sub_admin") {
        throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
      }

      const isPasswordMatch = await comparePassword(password, employee.password);
      if (!isPasswordMatch) {
        throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
      }

      const tokenPayload = {
        employee_id: employee.id,
        role: employee.role,
      };

      const token = jwt.sign(tokenPayload, JWT_SECRET, {
        expiresIn: JWT_EXPIRY || "7d",
      });

      return {
        token,
        role: employee.role,
        employee: {
          id: employee.id,
          e_unique_id: employee.e_unique_id,
          full_name: employee.full_name,
          email: employee.email,
          profile_image: employee.profile_image,
          is_verified: employee.is_verified,
          is_disabled: employee.is_disabled,
        },
      };
    }

    const admin = await AdminModel.getAdminForLogin(conn, email);

    if (!admin) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
    }

    if (admin.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (admin.is_disabled) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.accountDisabled]);
    }

    if (!admin.is_verified) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.emailNotVerified]);
    }

    const isPasswordMatch = await comparePassword(password, admin.password);
    if (!isPasswordMatch) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
    }

    const tokenPayload = {
      admin_id: admin.id,
      role: admin.role,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRY || "7d",
    });

    return {
      token,
      role: admin.role,
      admin: {
        id: admin.id,
        full_name: admin.full_name,
        email: admin.email,
        profile_image: admin.profile_image,
        is_verified: admin.is_verified,
        is_disabled: admin.is_disabled,
      },
    };
  });
};

export const forgotPassword = async (email) => {
  return withTransaction(async (conn) => {
    const admin = await AdminModel.getAdminByEmail(conn, email);

    if (!admin) {
      const employee = await EmployeeModel.getEmployeeByEmail(conn, email);

      if (!employee || String(employee.role || "").toLowerCase() !== "sub_admin") {
        // Security: same response even if account not found
        return { email };
      }

      const { token, hashedToken } = generateResetToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await EmployeeModel.saveEmployeeForgotToken(
        conn,
        employee.id,
        hashedToken,
        expiresAt
      );

      const resetLink = `${APP_URL}/api/admin/reset-password/${token}`;

      await sendForgotPasswordLinkEmail({
        email,
        resetLink,
      });

      return { email };
    }

    const { token, hashedToken } = generateResetToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await AdminModel.saveForgotToken(conn, admin.id, hashedToken, expiresAt);

    const resetLink = `${APP_URL}/api/admin/reset-password/${token}`;

    await sendForgotPasswordLinkEmail({
      email,
      resetLink,
    });

    return { email };
  });
};

export const resetPassword = async ({ token, password }) => {
  return withTransaction(async (conn) => {
    const hashedToken = hashResetToken(token);

    const admin = await AdminModel.findAdminByResetToken(conn, hashedToken);

    if (admin) {
      if (new Date(admin.forgot_code_expires_at) < new Date()) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.resetLinkExpired]);
      }

      const hashedPassword = await hashPassword(password);

      await AdminModel.updatePasswordAfterReset(
        conn,
        admin.id,
        hashedPassword,
        password
      );

      return;
    }

    const employee = await EmployeeModel.findEmployeeByResetToken(conn, hashedToken);

    if (!employee || new Date(employee.forgot_code_expires_at) < new Date()) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.resetLinkExpired]);
    }

    const hashedPassword = await hashPassword(password);

    await EmployeeModel.updateEmployeePasswordAfterReset(
      conn,
      employee.id,
      hashedPassword,
      password
    );
  });
};

export const getMyProfile = async (adminId) => {
  return withTransaction(async (conn) => {
    const admin = await AdminModel.getAdminByIdTx(conn, adminId);

    if (!admin) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    return admin;
  });
};

export const updateMyProfile = async (adminId, payload) => {
  return withTransaction(async (conn) => {
    const admin = await AdminModel.getAdminByIdTx(conn, adminId);

    if (!admin) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    const allowedFields = ["full_name", "profile_image"];
    const updateData = {};

    for (const field of allowedFields) {
      if (payload[field] !== undefined) {
        updateData[field] = payload[field];
      }
    }

    if (updateData.full_name) {
      updateData.full_name =
        `${updateData.full_name ?? admin.full_name}`.trim();
    }

    if (Object.keys(updateData).length === 0) {
      return admin;
    }

    await AdminModel.updateAdminDynamic(conn, adminId, updateData);

    return await AdminModel.getAdminByIdTx(conn, adminId);
  });
};

export const changePassword = async (adminId, payload) => {
  return withTransaction(async (conn) => {
    const admin = await AdminModel.getAdminPasswordByIdTx(conn, adminId);

    if (!admin) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (admin.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (admin.is_disabled) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.accountDisabled]);
    }

    const isPasswordMatch = await comparePassword(
      payload.current_password,
      admin.password
    );
    if (!isPasswordMatch) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.oldPasswordNotMatch]);
    }

    const hashedPassword = await hashPassword(payload.new_password);
    await AdminModel.updateAdminDynamic(conn, adminId, {
      password: hashedPassword,
      show_password: payload.new_password,
    });

    return { id: adminId };
  });
};

export const changeSubAdminPassword = async (employeeId, payload) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeePasswordByIdTx(
      conn,
      employeeId
    );

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    if (employee.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (employee.is_disabled) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.accountDisabled]);
    }

    if (!employee.is_verified) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.emailNotVerified]);
    }

    const isPasswordMatch = await comparePassword(
      payload.current_password,
      employee.password
    );
    if (!isPasswordMatch) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.oldPasswordNotMatch]);
    }

    const hashedPassword = await hashPassword(payload.new_password);
    await EmployeeModel.updateEmployeeDynamic(conn, employeeId, {
      password: hashedPassword,
      show_password: payload.new_password,
    });

    return { id: employeeId };
  });
};

export const createClientByAdmin = async ({ creatorId, creatorRole }, payload) => {
  return withTransaction(async (conn) => {
    const emailExists = await AuthModel.getClientByEmail(conn, payload.email);
    if (emailExists) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyExists]);
    }

    const rawPassword =
      payload.password && payload.password.trim().length > 0
        ? payload.password
        : generatePassword(8);
    const hashedPassword = await hashPassword(rawPassword);

    const clientData = {
      u_unique_id: normalizeNullableString(payload.u_unique_id),
      full_name: payload.full_name?.trim(),
      email: normalizeNullableString(payload.email),
      password: hashedPassword,
      show_password: rawPassword,
      email_otp: null,
      is_verified: 1,
      role: "user",
      created_by: creatorId,
      created_by_role: creatorRole === "sub_admin" ? "sub_admin" : "admin",
      kyc_status: creatorRole === "sub_admin" ? "pending" : "approved",
      is_initial_password_changed: "false",
      country_code: normalizeNullableString(
        payload.country_code || payload.mobile_country_code
      ),
      phone_number: normalizeNullableString(payload.mobile_no || payload.phone_number),
      company_name: normalizeNullableString(payload.company_name),
      company_address: normalizeNullableString(payload.company_address),
      gst_number: normalizeNullableString(
        (payload.gst_number || payload.gst_no || "").toUpperCase()
      ),
      it_person_name: normalizeNullableString(payload.it_person_name),
      it_person_contact_number: normalizeNullableString(
        payload.it_person_contact_number || payload.it_person_contact
      ),
      total_computers: normalizeNullableInt(payload.total_computers),
      total_laptops: normalizeNullableInt(payload.total_laptops),
      total_servers: normalizeNullableInt(payload.total_servers),
      total_gsm_gateways: normalizeNullableInt(payload.total_gsm_gateways),
      administration_contact_name: normalizeNullableString(
        payload.administration_contact_name
      ),
      administration_contact_number: normalizeNullableString(
        payload.administration_contact_number
      ),
    };

    const clientId = await AuthModel.createClient(conn, clientData);

    // Agreements are managed via dedicated agreement APIs.

    if (Array.isArray(payload.gateway_allocations)) {
      const allocationMap = new Map();
      for (const entry of payload.gateway_allocations) {
        const gatewayId = Number(entry?.gateway_id);
        const allocatedQuantity = Number(entry?.allocated_quantity);
        if (!Number.isInteger(gatewayId) || gatewayId <= 0) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "gateway_allocations.gateway_id must be a positive integer",
          ]);
        }
        if (!Number.isInteger(allocatedQuantity) || allocatedQuantity < 0) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "gateway_allocations.allocated_quantity must be a non-negative integer",
          ]);
        }
        allocationMap.set(gatewayId, allocatedQuantity);
      }

      const allocations = Array.from(allocationMap.entries()).map(
        ([gateway_id, allocated_quantity]) => ({
          gateway_id,
          allocated_quantity,
        })
      );

      await UserModel.replaceClientGsmGatewayAllocations(
        conn,
        clientId,
        allocations
      );

      const totalAllocated = allocations.reduce(
        (sum, item) => sum + item.allocated_quantity,
        0
      );

      const columns = await UserModel.getClientColumnSet(conn);
      const allocationUpdate = {};
      if (columns.has("number_of_gateways")) {
        allocationUpdate.number_of_gateways = totalAllocated;
      }
      if (columns.has("total_gsm_gateways")) {
        allocationUpdate.total_gsm_gateways = totalAllocated;
      }

      if (Object.keys(allocationUpdate).length) {
        await UserModel.updateClientDynamic(conn, clientId, allocationUpdate);
      }
    }

    if (Array.isArray(payload.server_allocations)) {
      const allocationMap = new Map();
      for (const entry of payload.server_allocations) {
        const serverId = Number(entry?.server_id);
        const allocatedQuantity = Number(entry?.allocated_quantity);
        if (!Number.isInteger(serverId) || serverId <= 0) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "server_allocations.server_id must be a positive integer",
          ]);
        }
        if (!Number.isInteger(allocatedQuantity) || allocatedQuantity < 0) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "server_allocations.allocated_quantity must be a non-negative integer",
          ]);
        }
        allocationMap.set(serverId, allocatedQuantity);
      }

      const allocations = Array.from(allocationMap.entries()).map(
        ([server_id, allocated_quantity]) => ({
          server_id,
          allocated_quantity,
        })
      );

      await UserModel.replaceClientServerAllocations(conn, clientId, allocations);

      const totalAllocated = allocations.reduce(
        (sum, item) => sum + item.allocated_quantity,
        0
      );

      await UserModel.updateClientDynamic(conn, clientId, {
        total_servers: totalAllocated,
      });
    }

    if (Array.isArray(payload.kyc_documents) && payload.kyc_documents.length) {
      await UserModel.replaceClientKycDocuments(conn, clientId, payload.kyc_documents);
    }

    const now = new Date();
    if (creatorRole === "sub_admin") {
      await UserModel.updateClientDynamic(conn, clientId, {
        kyc_status: "pending",
        kyc_submitted_at: now,
        kyc_approved_at: null,
        kyc_rejected_at: null,
        kyc_reject_reason: null,
        kyc_verified_by_admin_id: null,
      });
    } else {
      await UserModel.updateClientDynamic(conn, clientId, {
        kyc_status: "approved",
        kyc_submitted_at: now,
        kyc_approved_at: now,
        kyc_rejected_at: null,
        kyc_reject_reason: null,
        kyc_verified_by_admin_id: creatorId,
      });
    }

    if (Array.isArray(payload.asset_allocations)) {
      await UserModel.replaceClientAssetAllocations(
        conn,
        clientId,
        payload.asset_allocations
      );
    }

    await syncClientSystemCounts(conn, clientId);

    const client = await UserModel.getClientByIdTx(conn, clientId);

    const { token, hashedToken } = generateResetToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await AuthModel.saveForgotToken(conn, clientId, hashedToken, expiresAt);

    const resetLink = `${APP_URL}/api/auth/reset-password/${token}`;
    await sendClientCreatedEmail({
      email: client.email,
      full_name: client.full_name,
      resetLink,
    });

    await sendClientCreatedWhatsApp({
      country_code: client.country_code,
      mobile_no: client.phone_number,
      full_name: client.full_name,
      resetLink,
    });

    return {
      id: client.id,
      u_unique_id: client.u_unique_id,
      full_name: client.full_name,
      email: client.email,
      is_verified: client.is_verified,
      role: client.role,
    };
  });
};

export const updateClientByAdmin = async (clientId, payload, actor = {}) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);
    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }
    const actorRole =
      actor?.role === ROLES.SUB_ADMIN ? "sub_admin" : "admin";

    const updateData = {};
    const email = normalizeNullableString(payload.email);
    if (email !== null && email !== client.email) {
      const emailExists = await AuthModel.getClientByEmail(conn, email);
      if (emailExists && emailExists.id !== clientId) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyExists]);
      }
      updateData.email = email;
    }

    const phoneNumber = normalizeNullableString(
      payload.mobile_no || payload.phone_number
    );
    if (phoneNumber !== null && phoneNumber !== client.phone_number) {
      const phoneExists = await UserModel.getClientByPhoneNumberTx(
        conn,
        phoneNumber,
        clientId
      );
      if (phoneExists) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "Mobile number already registered",
        ]);
      }
      updateData.phone_number = phoneNumber;
    }

    if (payload.full_name !== undefined) {
      updateData.full_name = normalizeNullableString(payload.full_name);
    }
    if (payload.u_unique_id !== undefined) {
      updateData.u_unique_id = normalizeNullableString(payload.u_unique_id);
    }
    if (payload.country_code !== undefined || payload.mobile_country_code !== undefined) {
      updateData.country_code = normalizeNullableString(
        payload.country_code || payload.mobile_country_code
      );
    }
    if (payload.company_name !== undefined) {
      updateData.company_name = normalizeNullableString(payload.company_name);
    }
    if (payload.company_address !== undefined) {
      updateData.company_address = normalizeNullableString(payload.company_address);
    }
    if (payload.gst_number !== undefined || payload.gst_no !== undefined) {
      updateData.gst_number = normalizeNullableString(
        (payload.gst_number || payload.gst_no || "").toUpperCase()
      );
    }
    if (payload.it_person_name !== undefined) {
      updateData.it_person_name = normalizeNullableString(payload.it_person_name);
    }
    if (
      payload.it_person_contact_number !== undefined ||
      payload.it_person_contact !== undefined
    ) {
      updateData.it_person_contact_number = normalizeNullableString(
        payload.it_person_contact_number || payload.it_person_contact
      );
    }
    if (payload.administration_contact_name !== undefined) {
      updateData.administration_contact_name = normalizeNullableString(
        payload.administration_contact_name
      );
    }
    if (payload.administration_contact_number !== undefined) {
      updateData.administration_contact_number = normalizeNullableString(
        payload.administration_contact_number
      );
    }

    if (actor?.role === ROLES.SUB_ADMIN) {
      updateData.kyc_status = "pending";
      updateData.kyc_approved_at = null;
      updateData.kyc_rejected_at = null;
      updateData.kyc_reject_reason = null;
      updateData.kyc_verified_by_admin_id = null;
      updateData.kyc_submitted_at = new Date();
    }
    if (payload.total_computers !== undefined) {
      updateData.total_computers = normalizeNullableInt(payload.total_computers);
    }
    if (payload.total_laptops !== undefined) {
      updateData.total_laptops = normalizeNullableInt(payload.total_laptops);
    }
    if (payload.total_servers !== undefined) {
      updateData.total_servers = normalizeNullableInt(payload.total_servers);
    }
    if (payload.total_gsm_gateways !== undefined) {
      updateData.total_gsm_gateways = normalizeNullableInt(payload.total_gsm_gateways);
    }
    if (payload.password) {
      updateData.password = await hashPassword(payload.password);
      updateData.show_password = payload.password;
    }

    if (Object.keys(updateData).length) {
      await UserModel.updateClientDynamic(conn, clientId, updateData);
    }

    // Agreements are managed via dedicated agreement APIs.

    if (Array.isArray(payload.gateway_allocations)) {
      const allocationMap = new Map();
      for (const entry of payload.gateway_allocations) {
        const gatewayId = Number(entry?.gateway_id);
        const allocatedQuantity = Number(entry?.allocated_quantity);
        if (!Number.isInteger(gatewayId) || gatewayId <= 0) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "gateway_allocations.gateway_id must be a positive integer",
          ]);
        }
        if (!Number.isInteger(allocatedQuantity) || allocatedQuantity < 0) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "gateway_allocations.allocated_quantity must be a non-negative integer",
          ]);
        }
        allocationMap.set(gatewayId, allocatedQuantity);
      }

      const allocations = Array.from(allocationMap.entries()).map(
        ([gateway_id, allocated_quantity]) => ({
          gateway_id,
          allocated_quantity,
        })
      );

      await UserModel.replaceClientGsmGatewayAllocations(
        conn,
        clientId,
        allocations
      );

      const totalAllocated = allocations.reduce(
        (sum, item) => sum + item.allocated_quantity,
        0
      );

      const columns = await UserModel.getClientColumnSet(conn);
      const allocationUpdate = {};
      if (columns.has("number_of_gateways")) {
        allocationUpdate.number_of_gateways = totalAllocated;
      }
      if (columns.has("total_gsm_gateways")) {
        allocationUpdate.total_gsm_gateways = totalAllocated;
      }

      if (Object.keys(allocationUpdate).length) {
        await UserModel.updateClientDynamic(conn, clientId, allocationUpdate);
      }
    }

    if (Array.isArray(payload.server_allocations)) {
      const allocationMap = new Map();
      for (const entry of payload.server_allocations) {
        const serverId = Number(entry?.server_id);
        const allocatedQuantity = Number(entry?.allocated_quantity);
        if (!Number.isInteger(serverId) || serverId <= 0) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "server_allocations.server_id must be a positive integer",
          ]);
        }
        if (!Number.isInteger(allocatedQuantity) || allocatedQuantity < 0) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "server_allocations.allocated_quantity must be a non-negative integer",
          ]);
        }
        allocationMap.set(serverId, allocatedQuantity);
      }

      const allocations = Array.from(allocationMap.entries()).map(
        ([server_id, allocated_quantity]) => ({
          server_id,
          allocated_quantity,
        })
      );

      await UserModel.replaceClientServerAllocations(
        conn,
        clientId,
        allocations
      );

      const totalAllocated = allocations.reduce(
        (sum, item) => sum + item.allocated_quantity,
        0
      );

      await UserModel.updateClientDynamic(conn, clientId, {
        total_servers: totalAllocated,
      });
    }

    if (Array.isArray(payload.asset_allocations)) {
      await UserModel.replaceClientAssetAllocations(
        conn,
        clientId,
        payload.asset_allocations
      );
    }

    const deleteKycIds = Array.isArray(payload.deleteKycIds)
      ? [...new Set(
        payload.deleteKycIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )]
      : [];

    let docsToDelete = [];
    if (deleteKycIds.length) {
      docsToDelete = await UserModel.getClientKycDocumentsByIds(
        conn,
        clientId,
        deleteKycIds
      );

      if (docsToDelete.length) {
        await UserModel.deleteClientKycDocumentsByIds(conn, clientId, deleteKycIds);
      }
    }

    const normalizeDocType = (value) =>
      value ? String(value).trim().toLowerCase() : "";
    const incomingDocsRaw = Array.isArray(payload.kyc_documents)
      ? payload.kyc_documents
      : [];
    const incomingSelfies = incomingDocsRaw.filter(
      (doc) => normalizeDocType(doc?.doc_type) === "selfie"
    );
    const incomingSelfie = incomingSelfies.length
      ? incomingSelfies[incomingSelfies.length - 1]
      : null;
    const incomingDocs = incomingDocsRaw.filter(
      (doc) => normalizeDocType(doc?.doc_type) !== "selfie"
    );
    if (incomingSelfie) {
      incomingDocs.push(incomingSelfie);
      const extraSelfieDocs = incomingSelfies.slice(0, -1);
      if (extraSelfieDocs.length) {
        await Promise.all(
          extraSelfieDocs
            .map((doc) => doc?.doc_path)
            .filter(Boolean)
            .map((path) => deleteFileFromS3(path))
        );
      }
    }

    let existingSelfies = [];
    if (incomingSelfie) {
      const currentDocs = await UserModel.listClientKycDocumentsByClientId(
        conn,
        clientId
      );
      existingSelfies = currentDocs.filter(
        (doc) => normalizeDocType(doc?.doc_type) === "selfie"
      );
      if (existingSelfies.length) {
        await UserModel.deleteClientKycDocumentsByIds(
          conn,
          clientId,
          existingSelfies.map((doc) => doc.id)
        );
      }
    }

    if (incomingDocs.length) {
      await UserModel.addClientKycDocuments(conn, clientId, incomingDocs);
    }
    if (incomingSelfie?.doc_path) {
      await UserModel.updateClientDynamic(conn, clientId, {
        profile_image: incomingSelfie.doc_path,
      });
    }

    if (docsToDelete.length || existingSelfies.length) {
      await Promise.all(
        [...docsToDelete, ...existingSelfies]
          .map((doc) => doc?.doc_path)
          .filter(Boolean)
          .map((path) => deleteFileFromS3(path))
      );
    }
    if (
      docsToDelete.length &&
      client?.profile_image &&
      docsToDelete.some((doc) => doc?.doc_path === client.profile_image)
    ) {
      await UserModel.updateClientDynamic(conn, clientId, {
        profile_image: null,
      });
    }

    await syncClientSystemCounts(conn, clientId);

    const updatedClient = await UserModel.getClientDetailsForAdmin(conn, clientId);
    const documents = await UserModel.listClientKycDocumentsByClientId(
      conn,
      clientId
    );
    return formatClientResponse(updatedClient, documents);
  });
};

export const listClients = async (query) => {
  return withTransaction(async (conn) => {
    const result = await UserModel.listClientsForAdmin(conn, query);

    const items = result.rows.map((client) => ({
      ...client,
      profile_image: buildPublicFileUrl(client?.profile_image),
    }));

    return {
      items,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const listKycApprovals = async (query) => {
  return withTransaction(async (conn) => {
    const result = await UserModel.listKycApprovalsForAdmin(conn, query);

    return {
      items: result.rows,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const getClientDetails = async (clientId) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientDetailsForAdmin(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const documents = await UserModel.listClientKycDocumentsByClientId(
      conn,
      clientId
    );

    const [gateway_allocations, server_allocations, asset_allocations] =
      await Promise.all([
      UserModel.listClientGatewayAllocationsForAdmin(conn, clientId),
      UserModel.listClientServerAllocationsForAdmin(conn, clientId),
      UserModel.listClientAssetAllocationsForAdmin(conn, clientId),
    ]);

    return {
      ...formatClientResponse(client, documents),
      gateway_allocations,
      server_allocations,
      asset_allocations,
    };
  });
};

export const getClientDevices = async ({ clientId, search, status, page, limit }) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const result = await SystemModel.listSystems(conn, {
      search,
      status,
      client_id: clientId,
      page,
      limit,
    });
    const systemIds = result.rows.map((row) => row.id);
    const assets = await SystemModel.getSystemAssetsBySystemIds(conn, systemIds);

    const parseMaybeJson = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "object") return value;
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch (err) {
        return null;
      }
    };

    const toValue = (value) => {
      if (value === undefined || value === null) return null;
      const str = String(value).trim();
      return str.length ? str : null;
    };

    const assetsBySystemId = new Map();
    for (const asset of assets) {
      const existing = assetsBySystemId.get(asset.system_id) || [];
      existing.push(asset);
      assetsBySystemId.set(asset.system_id, existing);
    }

    const items = result.rows.map((row) => {
      const parsed = parseMaybeJson(row.full_response);
      const systemInfoBase = (parsed?.system_info || parsed || {}) ?? {};
      const systemAssets = assetsBySystemId.get(row.id) || [];

      let deviceName = toValue(systemInfoBase?.hostname);
      let cpuModel = null;

      for (const asset of systemAssets) {
        const category = String(asset.asset_category_name || "")
          .trim()
          .toLowerCase();

        if (
          !deviceName &&
          (category === "device_name" || category === "hostname")
        ) {
          deviceName = toValue(asset.model) || toValue(asset.brand);
        }
        if (!cpuModel && (category === "cpu" || category === "processor")) {
          cpuModel = toValue(asset.model) || toValue(asset.brand);
        }
      }

      const systemInfo = {
        ...systemInfoBase,
        cpu_model: cpuModel,
      };

      return {
        id: row.id,
        system_uid: row.system_uid,
        system_uuid: row.system_uuid,
        device_type: row.device_type,
        hardware_fingerprint: row.hardware_fingerprint,
        client_id: row.client_id,
        client_unique_id: row.client_unique_id,
        client_name: row.client_name,
        installed_by_employee_id: row.installed_by_employee_id,
        employee_unique_id: row.employee_unique_id,
        employee_name: row.employee_name,
        installation_date: row.installation_date,
        status: row.status,
        is_active: row.is_active,
        approval_status: row.approval_status,
        created_at: row.created_at,
        is_block: row.is_block,
        system_info: systemInfo,
      };
    });

    return {
      items,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

const normalizeBoolean = (value) => {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

export const createEmployeeByAdmin = async (payload) => {
  return withTransaction(async (conn) => {
    const emailExists = await EmployeeModel.getEmployeeByEmail(conn, payload.email);
    if (emailExists) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyExists]);
    }

    const rawPassword = generatePassword(8);
    const hashedPassword = await hashPassword(rawPassword);

    const employeeData = {
      e_unique_id: payload.e_unique_id,
      full_name: payload.full_name?.trim(),
      email: payload.email,
      password: hashedPassword,
      show_password: rawPassword,
      profile_image: normalizeNullableString(payload.profile_image),
      country_code: normalizeNullableString(payload.country_code),
      phone_number: normalizeNullableString(payload.phone_number),
      fcm_token: null,
      status: "active",
      role: "employee",
      date_of_birth: normalizeNullableString(payload.date_of_birth),
      gender: normalizeNullableString(payload.gender),
      current_address: normalizeNullableString(payload.current_address),
      permanent_address: normalizeNullableString(payload.permanent_address),
      designation: normalizeNullableString(payload.designation),
      employment_from: normalizeNullableString(payload.employment_from),
      employment_to: normalizeNullableString(payload.employment_to),
      ctc_breakdown: normalizeNullableString(payload.ctc_breakdown),
      bank_name: normalizeNullableString(payload.bank_name),
      ifsc_code: normalizeNullableString(payload.ifsc_code),
      bank_account_number: normalizeNullableString(payload.bank_account_number),
      email_otp: null,
      is_verified: 1,
      is_disabled: 0,
    };

    const employeeId = await EmployeeModel.createEmployee(conn, employeeData);
    if (
      Array.isArray(payload.employee_documents) &&
      payload.employee_documents.length
    ) {
      await EmployeeModel.updateEmployeeDynamic(conn, employeeId, {
        document_status: "pending",
        document_updated_by_admin: 1,
      });
      await EmployeeModel.addEmployeeDocuments(
        conn,
        employeeId,
        payload.employee_documents
      );
    }
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    await sendEmployeeCreatedEmail({
      email: employee.email,
      full_name: employee.full_name,
      temp_password: rawPassword,
    });

    return employee;
  });
};

export const listEmployees = async (query) => {
  return withTransaction(async (conn) => {
    const result = await EmployeeModel.listEmployees(conn, query);

    const items = result.rows.map((employee) => ({
      ...employee,
      profile_image: buildPublicFileUrl(employee?.profile_image),
    }));

    return {
      items,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const getEmployeeDetails = async (employeeId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    const documents = await EmployeeModel.listEmployeeDocumentsByEmployeeId(
      conn,
      employeeId
    );

    return {
      ...employee,
      profile_image: buildPublicFileUrl(employee?.profile_image),
      documents: mapDocumentsWithUrl(documents),
    };
  });
};

export const updateEmployee = async (employeeId, payload) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    if (payload.email && payload.email !== employee.email) {
      const existing = await EmployeeModel.getEmployeeByEmail(conn, payload.email);
      if (existing && existing.id !== employeeId) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyExists]);
      }
    }

    const updateData = {};

    if (payload.full_name !== undefined) {
      updateData.full_name = payload.full_name?.trim();
    }
    if (payload.email !== undefined) updateData.email = payload.email;
    if (payload.password) {
      updateData.password = await hashPassword(payload.password);
      updateData.show_password = payload.password;
    }
    if (payload.profile_image !== undefined) updateData.profile_image = payload.profile_image;
    if (payload.country_code !== undefined) updateData.country_code = payload.country_code;
    if (payload.phone_number !== undefined) updateData.phone_number = payload.phone_number;
    if (payload.fcm_token !== undefined) updateData.fcm_token = payload.fcm_token;
    if (payload.status !== undefined) updateData.status = payload.status;
    if (payload.role !== undefined) updateData.role = payload.role;
    if (payload.date_of_birth !== undefined) {
      updateData.date_of_birth = payload.date_of_birth;
    }
    if (payload.gender !== undefined) updateData.gender = payload.gender;
    if (payload.current_address !== undefined) {
      updateData.current_address = payload.current_address;
    }
    if (payload.permanent_address !== undefined) {
      updateData.permanent_address = payload.permanent_address;
    }
    if (payload.designation !== undefined) updateData.designation = payload.designation;
    if (payload.employment_from !== undefined) {
      updateData.employment_from = payload.employment_from;
    }
    if (payload.employment_to !== undefined) {
      updateData.employment_to = payload.employment_to;
    }
    if (payload.ctc_breakdown !== undefined) {
      updateData.ctc_breakdown = payload.ctc_breakdown;
    }
    if (payload.bank_name !== undefined) updateData.bank_name = payload.bank_name;
    if (payload.ifsc_code !== undefined) updateData.ifsc_code = payload.ifsc_code;
    if (payload.bank_account_number !== undefined) {
      updateData.bank_account_number = payload.bank_account_number;
    }
    if (payload.is_disabled !== undefined) {
      const disabledValue = normalizeBoolean(payload.is_disabled);
      if (disabledValue !== undefined) {
        updateData.is_disabled = disabledValue ? 1 : 0;
      }
    }

    const deleteDocIds = Array.isArray(payload.deleteDocIds)
      ? [...new Set(
        payload.deleteDocIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )]
      : [];

    const normalizeDocType = (value) =>
      value ? String(value).trim().toLowerCase() : "";
    const incomingDocsRaw = Array.isArray(payload.employee_documents)
      ? payload.employee_documents
      : [];
    const incomingSelfies = incomingDocsRaw.filter(
      (doc) => normalizeDocType(doc?.doc_type) === "selfie"
    );
    const hasIncomingSelfie = incomingSelfies.length > 0;

    let docsToDelete = [];
    if (deleteDocIds.length) {
      docsToDelete = await EmployeeModel.getEmployeeDocumentsByIds(
        conn,
        employeeId,
        deleteDocIds
      );
      if (docsToDelete.length) {
        await EmployeeModel.deleteEmployeeDocumentsByIds(
          conn,
          employeeId,
          deleteDocIds
        );
      }
    }

    let existingSelfies = [];
    if (hasIncomingSelfie) {
      const currentDocs = await EmployeeModel.listEmployeeDocumentsByEmployeeId(
        conn,
        employeeId
      );
      existingSelfies = currentDocs.filter(
        (doc) => normalizeDocType(doc?.doc_type) === "selfie"
      );
      if (existingSelfies.length) {
        await EmployeeModel.deleteEmployeeDocumentsByIds(
          conn,
          employeeId,
          existingSelfies.map((doc) => doc.id)
        );
      }
    }

    await EmployeeModel.updateEmployeeDynamic(conn, employeeId, updateData);
    if (
      Array.isArray(payload.employee_documents) &&
      payload.employee_documents.length
    ) {
      await EmployeeModel.updateEmployeeDynamic(conn, employeeId, {
        document_status: "approved",
        document_updated_by_admin: 1,
      });
      await EmployeeModel.addEmployeeDocuments(
        conn,
        employeeId,
        payload.employee_documents
      );
    }

    if (docsToDelete.length) {
      await Promise.all(
        docsToDelete
          .map((doc) => doc?.doc_path)
          .filter(Boolean)
          .map((path) => deleteFileFromS3(path))
      );
      if (
        employee?.profile_image &&
        docsToDelete.some((doc) => doc?.doc_path === employee.profile_image)
      ) {
        await EmployeeModel.updateEmployeeDynamic(conn, employeeId, {
          profile_image: null,
        });
      }
    }
    if (existingSelfies.length) {
      await Promise.all(
        existingSelfies
          .map((doc) => doc?.doc_path)
          .filter(Boolean)
          .map((path) => deleteFileFromS3(path))
      );
    }

    return await EmployeeModel.getEmployeeByIdTx(conn, employeeId);
  });
};

export const updateEmployeeRole = async (employeeId, role) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);
    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    await EmployeeModel.updateEmployeeDynamic(conn, employeeId, { role });

    return await EmployeeModel.getEmployeeByIdTx(conn, employeeId);
  });
};

export const blockEmployee = async (employeeId, isDisabled) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    const disabledValue = normalizeBoolean(isDisabled);
    if (disabledValue === undefined) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid disabled flag"]);
    }

    await EmployeeModel.updateEmployeeDynamic(conn, employeeId, {
      is_disabled: disabledValue ? 1 : 0,
    });

    return await EmployeeModel.getEmployeeByIdTx(conn, employeeId);
  });
};

export const deleteEmployee = async (employeeId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    await EmployeeModel.updateEmployeeDynamic(conn, employeeId, {
      is_deleted: 1,
    });

    return { id: employeeId };
  });
};

export const getEmployeeDevices = async (employeeId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    return await SystemModel.getSystemsByEmployeeId(conn, employeeId);
  });
};

export const createAssetCategory = async (payload) => {
  return withTransaction(async (conn) => {
    const name = payload.name?.trim();
    if (!name) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Category name is required"]);
    }

    const existing = await InventoryModel.getAssetCategoryByNameTx(conn, name);
    if (existing && !existing.is_deleted) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Category already exists"]);
    }

    if (existing && existing.is_deleted) {
      await InventoryModel.updateAssetCategoryDynamic(conn, existing.asset_category_id, {
        name,
        is_active: 1,
        is_deleted: 0,
      });
      return await InventoryModel.getInventoryTypeByIdTx(conn, existing.asset_category_id);
    }

    const categoryId = await InventoryModel.createAssetCategory(
      conn,
      name,
      payload.is_active ?? 1
    );

    return await InventoryModel.getInventoryTypeByIdTx(conn, categoryId);
  });
};

export const updateAssetCategory = async (categoryId, payload) => {
  return withTransaction(async (conn) => {
    const category = await InventoryModel.getInventoryTypeByIdTx(conn, categoryId);
    if (!category || category.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Category not found"]);
    }

    const updateData = {};
    if (payload.name !== undefined) {
      updateData.name = payload.name?.trim();
    }
    if (payload.is_active !== undefined) {
      updateData.is_active = payload.is_active ? 1 : 0;
    }

    await InventoryModel.updateAssetCategoryDynamic(conn, categoryId, updateData);
    return await InventoryModel.getInventoryTypeByIdTx(conn, categoryId);
  });
};

export const deleteAssetCategory = async (categoryId) => {
  return withTransaction(async (conn) => {
    const category = await InventoryModel.getInventoryTypeByIdTx(conn, categoryId);
    if (!category || category.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Category not found"]);
    }

    await InventoryModel.updateAssetCategoryDynamic(conn, categoryId, {
      is_deleted: 1,
      is_active: 0,
    });

    return { id: categoryId };
  });
};

export const createAssetsByAdmin = async (payload) => {
  return withTransaction(async (conn) => {
    const categoryId = Number(payload.asset_category_id);
    if (!categoryId) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "asset_category_id is required"]);
    }

    const category = await InventoryModel.getInventoryTypeByIdTx(conn, categoryId);
    if (!category || category.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Category not found"]);
    }

    const serials = Array.isArray(payload.serial_numbers)
      ? payload.serial_numbers
      : payload.serial_number
        ? [payload.serial_number]
        : [];

    const quantity = payload.quantity ? Number(payload.quantity) : 0;
    if (!serials.length && !quantity) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        "serial_number(s) or quantity is required",
      ]);
    }

    const brand = normalizeAssetField(payload.brand);
    const model = normalizeAssetField(payload.model);
    const manufacturer = normalizeAssetField(payload.manufacturer);
    const status = payload.status || "in_stock";
    const isAvailable =
      payload.is_available === undefined ? 1 : payload.is_available ? 1 : 0;
    const specJson = normalizeSpecJson(payload.spec_json);

    const created = [];
    const existing = [];

    if (!serials.length && quantity) {
      const safeQty = Math.min(Math.max(quantity, 1), 1000);

      for (let i = 0; i < safeQty; i += 1) {
        const assetId = await InventoryModel.createInventory(conn, {
          asset_category_id: categoryId,
          brand,
          model,
          serial_number: null,
          manufacturer,
          spec_json: specJson,
          is_available: isAvailable,
          status,
        });

        created.push({ asset_id: assetId, serial_number: null });
      }

      return { created, existing };
    }

    for (const serial of serials) {
      const serialValue = normalizeAssetField(serial);
      if (!serialValue) continue;

      const match = await InventoryModel.findAssetByIdentity(conn, {
        asset_category_id: categoryId,
        serial_number: serialValue,
        brand,
        model,
        manufacturer,
      });

      if (match) {
        existing.push({ asset_id: match.asset_id, serial_number: serialValue });
        continue;
      }

      const assetId = await InventoryModel.createInventory(conn, {
        asset_category_id: categoryId,
        brand,
        model,
        serial_number: serialValue,
        manufacturer,
        spec_json: specJson,
        is_available: isAvailable,
        status,
      });

      created.push({ asset_id: assetId, serial_number: serialValue });
    }

    return { created, existing };
  });
};

export const createGsmGateway = async (payload, actor = {}) => {
  return withTransaction(async (conn) => {
    const gatewayName = normalizeOptionalString(payload.gateway_name);
    if (!gatewayName) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "gateway_name is required"]);
    }

    let totalQuantity = 0;
    if (payload.total_quantity !== undefined) {
      const parsed = Number(payload.total_quantity);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "total_quantity must be a non-negative integer",
        ]);
      }
      totalQuantity = parsed;
    }

    let numberOfPort = null;
    if (payload.number_of_port !== undefined) {
      const parsed = Number(payload.number_of_port);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "number_of_port must be a non-negative integer",
        ]);
      }
      numberOfPort = parsed;
    }

    const status = payload.status || "active";
    if (!["active", "inactive"].includes(status)) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid status"]);
    }

    const gatewayId = await AdminModel.createGsmGateway(conn, {
      gateway_name: gatewayName,
      model_number: normalizeOptionalString(payload.model_number),
      manufacturer: normalizeOptionalString(payload.manufacturer),
      number_of_port: numberOfPort,
      total_quantity: totalQuantity,
      status,
      created_by: actor.actorId ?? null,
      updated_by: actor.actorId ?? null,
    });

    return await AdminModel.getGsmGatewayByIdTx(conn, gatewayId);
  });
};

export const listGsmGateways = async (query = {}) => {
  return withTransaction(async (conn) => {
    if (query.status && !["active", "inactive"].includes(query.status)) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid status"]);
    }

    const result = await AdminModel.listGsmGateways(conn, query);

    return {
      items: result.rows,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const getGsmGatewayById = async (gatewayId) => {
  return withTransaction(async (conn) => {
    const gateway = await AdminModel.getGsmGatewayByIdTx(conn, gatewayId);

    if (!gateway || gateway.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "GSM gateway not found"]);
    }

    return gateway;
  });
};

export const updateGsmGateway = async (gatewayId, payload, actor = {}) => {
  return withTransaction(async (conn) => {
    const gateway = await AdminModel.getGsmGatewayByIdTx(conn, gatewayId);

    if (!gateway || gateway.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "GSM gateway not found"]);
    }

    const updateData = {};

    if (payload.gateway_name !== undefined) {
      const gatewayName = normalizeOptionalString(payload.gateway_name);
      if (!gatewayName) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "gateway_name is required"]);
      }
      updateData.gateway_name = gatewayName;
    }

    if (payload.model_number !== undefined) {
      updateData.model_number = normalizeOptionalString(payload.model_number);
    }

    if (payload.manufacturer !== undefined) {
      updateData.manufacturer = normalizeOptionalString(payload.manufacturer);
    }

    if (payload.number_of_port !== undefined) {
      const parsed = Number(payload.number_of_port);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "number_of_port must be a non-negative integer",
        ]);
      }
      updateData.number_of_port = parsed;
    }

    if (payload.total_quantity !== undefined) {
      const parsed = Number(payload.total_quantity);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "total_quantity must be a non-negative integer",
        ]);
      }
      updateData.total_quantity = parsed;
    }

    if (payload.status !== undefined) {
      const status = payload.status;
      if (!["active", "inactive"].includes(status)) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid status"]);
      }
      updateData.status = status;
    }

    updateData.updated_by = actor.actorId ?? null;

    await AdminModel.updateGsmGatewayDynamic(conn, gatewayId, updateData);

    return await AdminModel.getGsmGatewayByIdTx(conn, gatewayId);
  });
};

export const deleteGsmGateway = async (gatewayId, actor = {}) => {
  return withTransaction(async (conn) => {
    const gateway = await AdminModel.getGsmGatewayByIdTx(conn, gatewayId);

    if (!gateway || gateway.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "GSM gateway not found"]);
    }

    await AdminModel.softDeleteGsmGateway(conn, gatewayId, actor.actorId ?? null);

    return { id: gatewayId };
  });
};

export const createServer = async (payload, actor = {}) => {
  return withTransaction(async (conn) => {
    const serverName = normalizeOptionalString(payload.server_name);
    if (!serverName) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "server_name is required"]);
    }

    let totalQuantity = 0;
    if (payload.total_quantity !== undefined) {
      const parsed = Number(payload.total_quantity);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "total_quantity must be a non-negative integer",
        ]);
      }
      totalQuantity = parsed;
    }

    const status = payload.status || "active";
    if (!["active", "inactive"].includes(status)) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid status"]);
    }

    const serverId = await AdminModel.createServer(conn, {
      server_name: serverName,
      processor: normalizeOptionalString(payload.processor),
      ram: normalizeOptionalString(payload.ram),
      ssd: normalizeOptionalString(payload.ssd),
      hdd: normalizeOptionalString(payload.hdd),
      brand: normalizeOptionalString(payload.brand),
      total_quantity: totalQuantity,
      status,
      created_by: actor.actorId ?? null,
      updated_by: actor.actorId ?? null,
    });

    return await AdminModel.getServerByIdTx(conn, serverId);
  });
};

export const listServers = async (query = {}) => {
  return withTransaction(async (conn) => {
    if (query.status && !["active", "inactive"].includes(query.status)) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid status"]);
    }

    const result = await AdminModel.listServers(conn, query);

    return {
      items: result.rows,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const getServerById = async (serverId) => {
  return withTransaction(async (conn) => {
    const server = await AdminModel.getServerByIdTx(conn, serverId);

    if (!server || server.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Server not found"]);
    }

    return server;
  });
};

export const updateServer = async (serverId, payload, actor = {}) => {
  return withTransaction(async (conn) => {
    const server = await AdminModel.getServerByIdTx(conn, serverId);

    if (!server || server.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Server not found"]);
    }

    const updateData = {};

    if (payload.server_name !== undefined) {
      const serverName = normalizeOptionalString(payload.server_name);
      if (!serverName) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "server_name is required"]);
      }
      updateData.server_name = serverName;
    }

    if (payload.processor !== undefined) {
      updateData.processor = normalizeOptionalString(payload.processor);
    }
    if (payload.ram !== undefined) {
      updateData.ram = normalizeOptionalString(payload.ram);
    }
    if (payload.ssd !== undefined) {
      updateData.ssd = normalizeOptionalString(payload.ssd);
    }
    if (payload.hdd !== undefined) {
      updateData.hdd = normalizeOptionalString(payload.hdd);
    }
    if (payload.brand !== undefined) {
      updateData.brand = normalizeOptionalString(payload.brand);
    }

    if (payload.total_quantity !== undefined) {
      const parsed = Number(payload.total_quantity);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "total_quantity must be a non-negative integer",
        ]);
      }
      updateData.total_quantity = parsed;
    }

    if (payload.status !== undefined) {
      const status = payload.status;
      if (!["active", "inactive"].includes(status)) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid status"]);
      }
      updateData.status = status;
    }

    updateData.updated_by = actor.actorId ?? null;

    await AdminModel.updateServerDynamic(conn, serverId, updateData);

    return await AdminModel.getServerByIdTx(conn, serverId);
  });
};

export const deleteServer = async (serverId, actor = {}) => {
  return withTransaction(async (conn) => {
    const server = await AdminModel.getServerByIdTx(conn, serverId);

    if (!server || server.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Server not found"]);
    }

    await AdminModel.softDeleteServer(conn, serverId, actor.actorId ?? null);

    return { id: serverId };
  });
};

export const updateClientRelocation = async ({ clientId, isRelocated, actorId }) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const updateData = {
      is_relocated: isRelocated ? 1 : 0,
    };

    if (isRelocated) {
      updateData.kyc_status = "pending";
      updateData.kyc_submitted_at = null;
      updateData.kyc_approved_at = null;
      updateData.kyc_rejected_at = null;
      updateData.kyc_reject_reason = null;
      updateData.kyc_verified_by_admin_id = actorId;
    }

    await UserModel.updateClientDynamic(conn, clientId, updateData);

    return await UserModel.getClientDetailsForAdmin(conn, clientId);
  });
};

export const updateClientKycStatus = async ({ clientId, status, reason, adminId, role }) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    if (role === ROLES.SUB_ADMIN) {
      status = "pending";
    }

    if (!adminId && status !== "pending") {
      throw new ApiError([STATUS_CODES.FORBIDDEN, "Only admin can approve or reject KYC"]);
    }

    const now = new Date();
    const updateData = {
      kyc_status: status,
    };

    if (status === "approved") {
      updateData.kyc_approved_at = now;
      updateData.kyc_rejected_at = null;
      updateData.kyc_reject_reason = null;
      updateData.kyc_verified_by_admin_id = adminId;
    }

    if (status === "rejected") {
      updateData.kyc_rejected_at = now;
      updateData.kyc_approved_at = null;
      updateData.kyc_reject_reason = reason || null;
      updateData.kyc_verified_by_admin_id = adminId;
    }

    if (status === "pending") {
      updateData.kyc_approved_at = null;
      updateData.kyc_rejected_at = null;
      updateData.kyc_reject_reason = null;
      updateData.kyc_verified_by_admin_id = null;
    }

    await UserModel.updateClientDynamic(conn, clientId, updateData);

    const updatedClient = await UserModel.getClientDetailsForAdmin(conn, clientId);
    const documents = await UserModel.listClientKycDocumentsByClientId(
      conn,
      clientId
    );

    return formatClientResponse(updatedClient, documents);
  });
};

export const updateEmpoyeeDocumentStatus = async ({ employeeId, document_status, document_reject_reason }) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }
    const now = new Date();
    const updateData = {
      document_status: document_status,
    };

    if (document_status === "approved") {
      updateData.document_reject_reason = null;
      updateData.document_status = document_status;
    }

    if (document_status === "rejected") {
      updateData.document_reject_reason = document_reject_reason;
      updateData.document_status = document_status;
    }

    if (document_status === "pending") {
      updateData.document_reject_reason = null;
      updateData.document_status = document_status;
    }

    await EmployeeModel.updateEmployeeDynamic(conn, employeeId, updateData);

    const updatedEmployee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);
    const documents = await EmployeeModel.listEmployeeDocumentsByEmployeeId(
      conn,
      employeeId
    );

    return formatEmployeeResponse(updatedEmployee, documents);
  });
};

export const getDashboardSummary = async ({ role, employeeId } = {}) => {
  return withTransaction(async (conn) => {
    const paymentDashboardRow = await PaymentModel.getDashboardData(conn);
    const payments_dashboard = buildPaymentDashboardFromRow(paymentDashboardRow);

    if (role === ROLES.SUB_ADMIN) {
      const [[{ total_clients }]] = await conn.query(
        `SELECT COUNT(*) AS total_clients
         FROM clients
         WHERE is_deleted = 0
           AND created_by_role = 'sub_admin'
           AND created_by = ?`,
        [employeeId || 0]
      );
      const [[{ total_devices }]] = await conn.query(
        `SELECT COUNT(*) AS total_devices
         FROM systems s
         INNER JOIN clients c ON c.id = s.client_id
         WHERE s.is_deleted = 0
           AND c.is_deleted = 0
           AND c.created_by_role = 'sub_admin'
           AND c.created_by = ?`,
        [employeeId || 0]
      );
      const [[{ service_requests }]] = await conn.query(
        `SELECT COUNT(*) AS service_requests
         FROM client_service_requests csr
         INNER JOIN clients c ON c.id = csr.client_id
         WHERE c.is_deleted = 0
           AND c.created_by_role = 'sub_admin'
           AND c.created_by = ?`,
        [employeeId || 0]
      );

      return {
        total_clients,
        total_devices,
        total_employees: null,
        service_requests,
        payments_dashboard,
      };
    }

    const [[{ total_clients }]] = await conn.query(
      `SELECT COUNT(*) AS total_clients FROM clients WHERE is_deleted = 0`
    );
    const [[{ total_devices }]] = await conn.query(
      `SELECT COUNT(*) AS total_devices FROM systems WHERE is_deleted = 0`
    );
    const [[{ total_employees }]] = await conn.query(
      `SELECT COUNT(*) AS total_employees FROM employees WHERE is_deleted = 0`
    );
    const [[{ service_requests }]] = await conn.query(
      `SELECT COUNT(*) AS service_requests FROM client_service_requests`
    );

    return {
      total_clients,
      total_devices,
      total_employees,
      service_requests,
      payments_dashboard,
    };
  });
};

export const listServiceRequests = async (query = {}) => {
  return withTransaction(async (conn) => {
    const result = await UserModel.listServiceRequestsForAdmin(conn, query);

    return {
      items: result.rows.map((row) => ({
        ...row,
        resolved_video_proof_url: buildPublicUploadUrl(
          "service-requests",
          row.resolved_video_proof
        ),
      })),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const updateSystemStatus = async (
  { systemId, status, restartInterval } = {},
) => {
  return withTransaction(async (conn) => {
    const parsedSystemId = Number(systemId);
    if (!Number.isInteger(parsedSystemId) || parsedSystemId <= 0) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid system_id"]);
    }

    const normalizedStatus =
      status === undefined || status === null ? "" : String(status).trim();
    if (
      !["active", "pending", "under_service", "inactive", "restart"].includes(
        normalizedStatus,
      )
    ) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid status"]);
    }

    const system = await SystemModel.getSystemByIdForUpdate(conn, parsedSystemId);
    if (!system || system.is_deleted) {
      throw new ApiError([
        STATUS_CODES.NOT_FOUND,
        Msg.deviceNotFound || "System not found",
      ]);
    }

    const updatePayload = { status: normalizedStatus };

    if (normalizedStatus === "restart") {
      const parsedRestartInterval = Number(restartInterval);
      if (!Number.isInteger(parsedRestartInterval) || parsedRestartInterval <= 0) {
        throw new ApiError([
          STATUS_CODES.BAD_REQUEST,
          "restart_interval must be a positive integer when status is restart",
        ]);
      }

      updatePayload.restart_interval = parsedRestartInterval;
    } else {
      updatePayload.restart_interval = 10;
    }

    await SystemModel.updateSystemDynamic(conn, parsedSystemId, updatePayload);

    const updated = await SystemModel.getSystemByIdTx(conn, parsedSystemId);
    return updated;
  });
};

const pad2 = (value) => String(value).padStart(2, "0");
const toMonthKey = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date, months) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

export const getServiceRequestsAnalyticsLast12Months = async () => {
  return withTransaction(async (conn) => {
    const now = new Date();
    const endExclusive = addMonths(startOfMonth(now), 1);
    const startInclusive = addMonths(startOfMonth(now), -11);

    const months = [];
    for (let i = 0; i < 12; i += 1) {
      months.push(toMonthKey(addMonths(startInclusive, i)));
    }

    const rows = await UserModel.getServiceRequestAnalyticsByMonthTx(
      conn,
      startInclusive,
      endExclusive
    );

    const byMonth = new Map(
      rows.map((r) => [
        r.month,
        {
          total_count: Number(r.total_count || 0),
          pending_count: Number(r.pending_count || 0),
          assigned_count: Number(r.assigned_count || 0),
          in_process_count: Number(r.in_process_count || 0),
          completed_count: Number(r.completed_count || 0),
        },
      ])
    );

    const totalSeries = months.map((m) => byMonth.get(m)?.total_count || 0);
    const pendingSeries = months.map((m) => byMonth.get(m)?.pending_count || 0);
    const assignedSeries = months.map((m) => byMonth.get(m)?.assigned_count || 0);
    const inProcessSeries = months.map(
      (m) => byMonth.get(m)?.in_process_count || 0
    );
    const completedSeries = months.map(
      (m) => byMonth.get(m)?.completed_count || 0
    );

    return {
      range: {
        from: startInclusive.toISOString(),
        to: endExclusive.toISOString(),
      },
      labels: months,
      series: {
        total_count: totalSeries,
        pending_count: pendingSeries,
        assigned_count: assignedSeries,
        in_process_count: inProcessSeries,
        completed_count: completedSeries,
      },
    };
  });
};

export const getServiceRequestById = async (requestId) => {
  return withTransaction(async (conn) => {
    const request = await UserModel.getClientServiceRequestById(conn, requestId);

    if (!request) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Service request not found"]);
    }

    return {
      ...request,
      resolved_video_proof_url: buildPublicUploadUrl(
        "service-requests",
        request.resolved_video_proof
      ),
    };
  });
};

export const assignServiceRequest = async ({ requestId, employee_id, assigned_at, mark_as_urgent }) => {
  return withTransaction(async (conn) => {
    const request = await UserModel.getServiceRequestByIdForUpdate(conn, requestId);

    if (!request) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Service request not found"]);
    }

    if (Number(request.status) !== 0) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Service request already assigned"]);
    }

    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employee_id);
    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    await UserModel.updateServiceRequestDynamic(conn, requestId, {
      employee_id,
      status: 1,
      admin_assigned_at: assigned_at || new Date(),
      ...(mark_as_urgent === undefined ? {} : { mark_as_urgent: mark_as_urgent ? 1 : 0 }),
    });

    return await UserModel.getClientServiceRequestById(conn, requestId);
  });
};
//code by Darshika 
//check agreement status and send push notification code

const buildNotificationContent = (status, agreementNumber) => {
  if (status === "expired") {
    return {
      title: "Agreement Expired",
      body: agreementNumber
        ? `Agreement #${agreementNumber} has expired.`
        : "An agreement has expired.",
    };
  }
  if (status === "active") {
    return {
      title: "Agreement Activated",
      body: agreementNumber
        ? `Agreement #${agreementNumber} has been activated.`
        : "An agreement has been activated.",
    };
  }
  return null;
};

export const checkAndNotifyAgreementStatus = async () => {
  return withTransaction(async (conn) => {
    const summary = {
      checked: 0,
      notified: 0,
      skippedNoToken: 0,
      failed: 0,
      errors: [],
    };

    const pendingAgreements = await AgreementModel.getAgreementsPendingNotification(conn);
    summary.checked = pendingAgreements.length;

    if (pendingAgreements.length === 0) {
      return summary;
    }

    for (const agreement of pendingAgreements) {
      const content = buildNotificationContent(agreement.status, agreement.agreement_number);
      if (!content) continue;

      if (!agreement.client_id) {
        console.warn(`[AgreementNotification] Agreement ID ${agreement.id} has no client_id, skipping.`);
        summary.skippedNoToken += 1;
        // still mark notified so it doesn't get retried forever with no client
        await AgreementModel.markAgreementNotified(conn, agreement.id, agreement.status);
        continue;
      }

      try {
        const pushResult = await sendPushToClient(
          pool,
          agreement.client_id,
          content.title,
          content.body
        );

        if (!pushResult.success) {
          console.warn(
            `[AgreementNotification] Push not sent for agreement ID ${agreement.agreement_id} (client ${agreement.client_id}): ${pushResult.message}`
          );
          summary.skippedNoToken += 1;
        } else {
          summary.notified += 1;
        }

        // mark as notified either way -> avoids infinite retry loop when token is simply missing
        await AgreementModel.markAgreementNotified(conn, agreement.agreement_id, agreement.status);
      } catch (err) {
        // only real unexpected errors (DB/network) skip marking -> retried next cron run
        summary.failed += 1;
        summary.errors.push({ agreementId: agreement.id, message: err.message });
        console.error(`[AgreementNotification] Failed for agreement ID ${agreement.agreement_id}:`, err);
      }
    }

    return summary;
  });
};