import { apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as AuthService from "./auth.service.js";
import { deleteFileFromS3 } from "../../utils/aws.util.js";

export const register = apiHandler(async (req, res) => {
  const verificationVideoFile = Array.isArray(req.files?.verification_video)
    ? req.files.verification_video[0]
    : null;
  const verification_video = verificationVideoFile?.key || verificationVideoFile?.location;

  try {
    const result = await AuthService.registerUser({
      ...req.body,
      ...(verification_video ? { verification_video } : {}),
    });

    return apiResponse(
      [STATUS_CODES.CREATED, Msg.registrationSuccess],
      "Client",
      result,
      res,
      "object"
    );
  } catch (error) {
    if (verification_video) {
      await deleteFileFromS3(verification_video);
    }
    throw error;
  }
});


export const verifyEmail = apiHandler(async (req, res) => {
  const result = await AuthService.verifyEmailOtp(req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.emailVerified],
    "Client",
    result,
    res,
    "object"
  );
});

export const resendOtp = apiHandler(async (req, res) => {
  const result = await AuthService.resendEmailOtp(req.body.email);

  return apiResponse(
    [STATUS_CODES.OK, Msg.otpResent],
    "OTP",
    result,
    res,
    "object"
  );
});

export const login = apiHandler(async (req, res) => {
  const result = await AuthService.loginUser(req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.loginSuccess],
    "Client",
    result,
    res,
    "object"
  );
});

// export const forgotPassword = apiHandler(async (req, res) => {
//   const result = await AuthService.forgotPassword(req.body.email);

//   return apiResponse(
//     [STATUS_CODES.OK, Msg.forgotPasswordOtpSent],
//     "OTP",
//     result,
//     res,
//     "object"
//   );
// });

export const forgotPassword = apiHandler(async (req, res) => {
  const result = await AuthService.forgotPassword(req.body.email);

  return apiResponse(
    [STATUS_CODES.OK, Msg.resetLinkSent],
    "Email",
    result,
    res,
    "object"
  );
});

export const renderResetPasswordPage = async (req, res) => {
  const { token } = req.params;

  return res.render("reset-password", {
    token,
    error: null,
    actionUrl: "/api/auth/reset-password",
  });
};

export const resetPassword = async (req, res) => {
  try {
    await AuthService.resetPassword(req.body);

    return res.render("reset-password-success");
  } catch (error) {
    return res.render("reset-password", {
      token: req.body.token,
      error: error.message || "Something went wrong",
      actionUrl: "/api/auth/reset-password",
    });
  }
};
