import { Router } from "express";
import {
  forgotPassword,
  login,
  register,
  renderResetPasswordPage,
  resendOtp,
  resetPassword,
  verifyEmail,
} from "./employeeAuth.controller.js";
import {
  employeeSignUp,
  forgotPasswordValidation,
  loginValidation,
  resendOtpValidation,
  resetPasswordPostValidation,
  verifyEmailValidation,
} from "./employeeAuth.validation.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import { authGuard } from "../../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", employeeSignUp, handleValidationErrors, register);
router.post("/verify-email", verifyEmailValidation, handleValidationErrors, verifyEmail);
router.post("/resend-otp", resendOtpValidation, handleValidationErrors, resendOtp);
router.post("/login", loginValidation, handleValidationErrors, login);
router.post("/forgot-password", forgotPasswordValidation, handleValidationErrors, forgotPassword);
router.get("/reset-password/:token", renderResetPasswordPage);
router.post("/reset-password", resetPasswordPostValidation, handleValidationErrors, resetPassword);

export default router;
