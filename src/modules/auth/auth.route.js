import { Router } from "express";
import { forgotPassword, login, register, renderResetPasswordPage, resendOtp, resetPassword, verifyEmail } from "./auth.controller.js";
import { forgotPasswordValidation, loginValidation, resendOtpValidation, resetPasswordPostValidation, userSignUp, verifyEmailValidation } from "./auth.validation.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import { fieldsAWS } from "../../utils/aws.util.js";

const router = Router();

router.post(
  "/register",
  fieldsAWS("", [{ name: "verification_video", maxCount: 1 }]),
  userSignUp,
  handleValidationErrors,
  register
);
router.post("/verify-email", verifyEmailValidation, handleValidationErrors, verifyEmail);
router.post("/resend-otp", resendOtpValidation, handleValidationErrors, resendOtp);
router.post("/login", loginValidation, handleValidationErrors, login);
router.post("/forgot-password", forgotPasswordValidation, handleValidationErrors, forgotPassword);
router.get("/reset-password/:token", renderResetPasswordPage);
router.post("/reset-password", resetPasswordPostValidation, handleValidationErrors, resetPassword);

export default router;
