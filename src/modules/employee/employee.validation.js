import { body } from "express-validator";

export const createEmployeeValidation = [
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
    .optional()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long."),

  body("profile_image").optional().trim(),
  body("country_code").optional().trim(),
  body("phone_number").optional().trim(),
  body("fcm_token").optional().trim(),

  body("status")
    .optional()
    .isIn(["active", "inactive", "blocked"])
    .withMessage("Invalid status"),

  body("role")
    .optional()
    .isIn(["employee", "manager", "supervisor"])
    .withMessage("Invalid role"),

  body("date_of_birth").optional().trim(),
  body("gender")
    .optional()
    .toLowerCase()
    .isIn(["male", "female", "other"])
    .withMessage("Invalid gender"),
  body("current_address").optional().trim(),
  body("permanent_address").optional().trim(),
  body("designation").optional().trim(),
  body("employment_from").optional().trim(),
  body("employment_to").optional().trim(),
  body("ctc_breakdown").optional().trim(),
  body("bank_name").optional().trim(),
  body("ifsc_code").optional().trim(),
  body("bank_account_number").optional().trim(),
];

export const updateEmployeeValidation = [
  body("full_name").optional().trim(),
  body("email")
    .optional()
    .isEmail()
    .withMessage("Please enter a valid email address."),

  body("password")
    .optional()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long."),

  body("profile_image").optional().trim(),
  body("country_code").optional().trim(),
  body("phone_number").optional().trim(),
  body("fcm_token").optional().trim(),

  body("status")
    .optional()
    .isIn(["active", "inactive", "blocked"])
    .withMessage("Invalid status"),

  body("role")
    .optional()
    .isIn(["employee", "manager", "supervisor"])
    .withMessage("Invalid role"),

  body("date_of_birth").optional().trim(),
  body("gender")
    .optional()
    .toLowerCase()
    .isIn(["male", "female", "other"])
    .withMessage("Invalid gender"),
  body("current_address").optional().trim(),
  body("permanent_address").optional().trim(),
  body("designation").optional().trim(),
  body("employment_from").optional().trim(),
  body("employment_to").optional().trim(),
  body("ctc_breakdown").optional().trim(),
  body("bank_name").optional().trim(),
  body("ifsc_code").optional().trim(),
  body("bank_account_number").optional().trim(),

  body("is_disabled")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid disabled flag"),
];

export const updateMyProfileValidation = [
  body("full_name").optional().trim(),
  body("country_code").optional().trim(),
  body("phone_number").optional().trim(),
  body("fcm_token").optional().trim(),
  body("status")
    .optional()
    .isIn(["active", "inactive", "blocked"])
    .withMessage("Invalid status"),
];

export const blockEmployeeValidation = [
  body("is_disabled")
    .notEmpty()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid disabled flag"),
];

export const recordVisitValidation = [
  body("client_id")
    .notEmpty()
    .withMessage("client_id is required")
    .bail()
    .isInt({ min: 1 })
    .withMessage("client_id must be a valid integer"),
  body("short_description")
    .optional()
    .isLength({ max: 255 })
    .withMessage("short_description must be at most 255 characters"),
  body("visited_at")
    .optional()
    .custom((value) => {
      if (value === undefined || value === null || value === "") return true;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("visited_at must be a valid date");
      }
      return true;
    }),
  body("video_proof").custom((value, { req }) => {
    const file = req.files?.video_proof?.[0];
    const bodyValue = value ?? req.body?.video_proof;
    if (file) return true;
    if (bodyValue && String(bodyValue).trim()) return true;
    throw new Error("video_proof is required");
  }),
];
