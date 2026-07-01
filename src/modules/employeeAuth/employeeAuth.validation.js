import { body } from "express-validator";

export const employeeSignUp = [
  body("full_name")
    .notEmpty()
    .withMessage("Full name is required.")
    .isLength({ min: 2, max: 200 })
    .withMessage("Full name must be between 2 and 200 characters."),

  body("email")
    .notEmpty()
    .withMessage("The email field cannot be empty.")
    .isEmail()
    .withMessage("Please enter a valid email address."),

  body("password")
    .notEmpty()
    .withMessage("The password field cannot be empty.")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long.")
    .matches(/\d/)
    .withMessage("Password must contain at least one digit.")
    .matches(/[!@#$%^&*]/)
    .withMessage("Password must include at least one special character.")
    .matches(/[A-Z]/)
    .withMessage("Password must include at least one uppercase letter."),
];

export const verifyEmailValidation = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter a valid email"),

  body("otp")
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be 6 digits"),
];

export const resendOtpValidation = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter a valid email"),
];

export const loginValidation = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter a valid email"),

  body("password")
    .notEmpty()
    .withMessage("Password is required"),
];

export const forgotPasswordValidation = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter a valid email"),
];

export const resetPasswordPostValidation = [
  body("token")
    .notEmpty()
    .withMessage("Invalid or missing reset token"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .matches(/[!@#$%^&*]/)
    .withMessage("Password must contain at least one special character"),
];
