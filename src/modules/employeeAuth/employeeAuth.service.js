import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import { withTransaction } from "../../utils/withTransaction.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as EmployeeModel from "../employee/employee.model.js";
import { sendForgotPasswordLinkEmail, sendOtpVerificationEmail } from "../../utils/email.util.js";
import { comparePassword, hashPassword } from "../../utils/password.utils.js";
import { APP_URL, JWT_EXPIRY, JWT_SECRET } from "../../constants.js";
import { generateResetToken } from "../../utils/token.util.js";
import { buildPublicFileUrl } from "../../utils/file-url.util.js";

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const registerEmployee = async (payload) => {
  return withTransaction(async (conn) => {
    const emailExists = await EmployeeModel.getEmployeeByEmail(conn, payload.email);
    if (emailExists) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyExists]);
    }

    const rawPassword = payload.password;
    const hashedPassword = await hashPassword(rawPassword);
    const otp = generateOtp();

    const employeeData = {
      e_unique_id: payload.e_unique_id,
      full_name: payload.full_name?.trim(),
      email: payload.email,
      password: hashedPassword,
      show_password: rawPassword,
      profile_image: null,
      country_code: null,
      phone_number: null,
      fcm_token: null,
      status: "active",
      role: "employee",
      email_otp: otp,
      is_verified: 0,
      is_disabled: 0,
    };

    const employeeId = await EmployeeModel.createEmployee(conn, employeeData);

    await sendOtpVerificationEmail({
      email: payload.email,
      otp,
    });

    return {
      id: employeeId,
      full_name: employeeData.full_name,
      email: payload.email,
    };
  });
};

export const verifyEmailOtp = async ({ email, otp }) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeForEmailVerification(conn, email);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (employee.is_verified) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyVerified]);
    }

    if (!employee.email_otp || employee.email_otp !== otp) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.invalidOtp]);
    }

    await EmployeeModel.markEmployeeEmailVerified(conn, employee.id);

    return {
      email,
      is_verified: true,
    };
  });
};

export const resendEmailOtp = async (email) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeForEmailVerification(conn, email);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (employee.is_verified) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyVerified]);
    }

    const newOtp = generateOtp();

    await EmployeeModel.updateEmployeeEmailOtp(conn, employee.id, newOtp);

    await sendOtpVerificationEmail({
      email,
      otp: newOtp,
    });

    return {
      email,
    };
  });
};

export const loginEmployee = async ({ email, password }) => {
  return withTransaction(async (conn) => {
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
      employee: {
        id: employee.id,
        e_unique_id: employee.e_unique_id,
        full_name: employee.full_name,
        email: employee.email,
        profile_image: buildPublicFileUrl(employee?.profile_image),
        role: employee.role,
        is_verified: employee.is_verified,
        is_disabled: employee.is_disabled,
      },
    };
  });
};

export const forgotPassword = async (email) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByEmail(conn, email);

    if (!employee) {
      return { email };
    }

    const { token, hashedToken } = generateResetToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await EmployeeModel.saveEmployeeForgotToken(conn, employee.id, hashedToken, expiresAt);

    const resetLink = `${APP_URL}/api/employee-auth/reset-password/${token}`;

    await sendForgotPasswordLinkEmail({ email, resetLink });

    return { email };
  });
};

export const resetPassword = async ({ token, password }) => {
  return withTransaction(async (conn) => {
    const hashedToken = createHash("sha256")
      .update(token)
      .digest("hex");
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
