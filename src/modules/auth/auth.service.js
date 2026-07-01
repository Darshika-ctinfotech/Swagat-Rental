import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { withTransaction } from "../../utils/withTransaction.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as AuthModel from "./auth.model.js";
import { sendForgotPasswordLinkEmail, sendOtpVerificationEmail } from "../../utils/email.util.js";
import { comparePassword, hashPassword } from "../../utils/password.utils.js";
import { APP_URL, JWT_EXPIRY, JWT_SECRET } from "../../constants.js";
import { generateResetToken } from "../../utils/token.util.js";
import { getAgreementDates } from "../../utils/agreement.util.js";
import * as UserModel from "../user/user.model.js";

const generateOtp = () =>
  Math.floor(1000 + Math.random() * 9000).toString();

export const registerUser = async (payload) => {
  return withTransaction(async (conn) => {
    const emailExists = await AuthModel.getClientByEmail(conn, payload.email);
    if (emailExists) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyExists]);
    }

    const rawPassword = payload.password;
    const hashedPassword = await hashPassword(rawPassword);
    const otp = generateOtp();

    const clientData = {
      u_unique_id: payload.u_unique_id,
      full_name: payload.full_name?.trim(),
      email: payload.email,
      password: hashedPassword,
      show_password: rawPassword,
      email_otp: otp,
      is_verified: 0,
      role: "user",
      created_by_role: "self",
      kyc_status: "pending",
      is_initial_password_changed: "true",
    };

    const clientId = await AuthModel.createClient(conn, clientData);

    if (payload?.verification_video) {
      await UserModel.addClientKycDocuments(conn, clientId, [
        { doc_type: "verification_video", doc_path: payload.verification_video },
      ]);

      await UserModel.updateClientDynamic(conn, clientId, {
        kyc_status: "pending",
        kyc_submitted_at: new Date(),
        kyc_approved_at: null,
        kyc_rejected_at: null,
        kyc_reject_reason: null,
        kyc_verified_by_admin_id: null,
      });
    }

    await sendOtpVerificationEmail({
      email: payload.email,
      otp,
    });

    return {
      id: clientId,
      full_name: clientData.full_name,
      email: payload.email,
      verification_video: payload?.verification_video || null,
    };
  });
};

export const verifyEmailOtp = async ({ email, otp }) => {
  return withTransaction(async (conn) => {
    const client = await AuthModel.getClientForEmailVerification(conn, email);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    if (client.is_verified) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyVerified]);
    }

    if (!client.email_otp || client.email_otp !== otp) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.invalidOtp]);
    }

    await AuthModel.markEmailVerified(conn, client.id);

    return {
      email,
      is_verified: true,
    };
  });
};

export const resendEmailOtp = async (email) => {
  return withTransaction(async (conn) => {
    const client = await AuthModel.getClientForEmailVerification(conn, email);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    if (client.is_verified) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyVerified]);
    }

    const newOtp = generateOtp();

    await AuthModel.updateEmailOtp(conn, client.id, newOtp);

    await sendOtpVerificationEmail({
      email,
      otp: newOtp,
    });

    return { email };
  });
};

export const loginUser = async ({ email, password }) => {
  return withTransaction(async (conn) => {
    const client = await AuthModel.getClientForLogin(conn, email);

    if (!client) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
    }

    if (client.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (client.is_disabled) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.accountDisabled]);
    }

    if (!client.is_verified) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.emailNotVerified]);
    }

    const isPasswordMatch = await comparePassword(password, client.password);
    if (!isPasswordMatch) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.invalidCredentials]);
    }

    const tokenPayload = {
      user_id: client.id,
      role: client.role,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRY || "7d",
    });

    return {
      token,
      client: {
        id: client.id,
        u_unique_id: client.u_unique_id,
        full_name: client.full_name,
        email: client.email,
        kyc_step: client.kyc_step,
        profile_image: client.profile_image,
        role: client.role,
        is_verified: client.is_verified,
        is_disabled: client.is_disabled,
        is_initial_password_changed: client.is_initial_password_changed,
      },
    };
  });
};

export const forgotPassword = async (email) => {
  return withTransaction(async (conn) => {
    const client = await AuthModel.getClientByEmail(conn, email);

    if (!client) {
      return { email };
    }

    const { token, hashedToken } = generateResetToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await AuthModel.saveForgotToken(conn, client.id, hashedToken, expiresAt);

    const resetLink = `${APP_URL}/api/auth/reset-password/${token}`;

    await sendForgotPasswordLinkEmail({ email, resetLink });

    return { email };
  });
};

export const resetPassword = async ({ token, password }) => {
  return withTransaction(async (conn) => {
    const hashedToken = createHash("sha256")
      .update(token)
      .digest("hex");
    const client = await AuthModel.findClientByResetToken(conn, hashedToken);

    if (!client || new Date(client.forgot_code_expires_at) < new Date()) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.resetLinkExpired]);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await AuthModel.updatePasswordAfterReset(conn, client.id, hashedPassword, password);
  });
};
