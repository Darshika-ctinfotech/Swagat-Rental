import { apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as EmployeeAuthService from "./employeeAuth.service.js";

export const register = apiHandler(async (req, res) => {
  const result = await EmployeeAuthService.registerEmployee(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, Msg.registrationSuccess],
    "Employee",
    result,
    res,
    "object"
  );
});

export const verifyEmail = apiHandler(async (req, res) => {
  const result = await EmployeeAuthService.verifyEmailOtp(req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.emailVerified],
    "Employee",
    result,
    res,
    "object"
  );
});

export const resendOtp = apiHandler(async (req, res) => {
  const result = await EmployeeAuthService.resendEmailOtp(req.body.email);

  return apiResponse(
    [STATUS_CODES.OK, Msg.otpResent],
    "OTP",
    result,
    res,
    "object"
  );
});

export const login = apiHandler(async (req, res) => {
  const result = await EmployeeAuthService.loginEmployee(req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.loginSuccess],
    "Employee",
    result,
    res,
    "object"
  );
});

export const forgotPassword = apiHandler(async (req, res) => {
  const result = await EmployeeAuthService.forgotPassword(req.body.email);

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
    actionUrl: "/api/employee-auth/reset-password",
  });
};

export const resetPassword = async (req, res) => {
  try {
    await EmployeeAuthService.resetPassword(req.body);

    return res.render("reset-password-success");
  } catch (error) {
    return res.render("reset-password", {
      token: req.body.token,
      error: error.message || "Something went wrong",
      actionUrl: "/api/employee-auth/reset-password",
    });
  }
};

// Assignment APIs removed with employee_system_assignments deprecation
