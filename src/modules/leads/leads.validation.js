import { body, param, query } from "express-validator";

const LEAD_STATUSES = [
  "new",
  "contacted",
  "interested",
  "not_interested",
  "converted",
  "closed",
];

const optionalNullableEmail = body("email")
  .optional({ nullable: true, checkFalsy: true })
  .trim()
  .isEmail()
  .withMessage("Email must be valid");

const optionalNullableDate = body("follow_up_date")
  .optional({ nullable: true, checkFalsy: true })
  .isISO8601()
  .withMessage("Follow up date must be valid");

export const createLeadValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Name must be between 2 and 150 characters"),

  optionalNullableEmail,

  body("phone_number")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ min: 5, max: 30 })
    .withMessage("Phone number must be between 5 and 30 characters"),

  body("company_name")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage("Company name must be at most 255 characters"),

  body("requirement")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Requirement must be at most 2000 characters"),

  body("source")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Source must be at most 100 characters"),

  body("status")
    .optional()
    .isIn(LEAD_STATUSES)
    .withMessage(`Status must be one of: ${LEAD_STATUSES.join(", ")}`),

  body("assigned_to")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Assigned employee must be valid")
    .toInt(),

  optionalNullableDate,

  body("notes")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Notes must be at most 2000 characters"),
];

export const updateLeadValidation = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage("Name must be between 2 and 150 characters"),
  optionalNullableEmail,
  body("phone_number")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ min: 5, max: 30 })
    .withMessage("Phone number must be between 5 and 30 characters"),
  body("company_name")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage("Company name must be at most 255 characters"),
  body("requirement")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Requirement must be at most 2000 characters"),
  body("source")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Source must be at most 100 characters"),
  body("status")
    .optional()
    .isIn(LEAD_STATUSES)
    .withMessage(`Status must be one of: ${LEAD_STATUSES.join(", ")}`),
  body("assigned_to")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Assigned employee must be valid")
    .toInt(),
  optionalNullableDate,
  body("notes")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Notes must be at most 2000 characters"),
];

export const updateLeadStatusValidation = [
  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(LEAD_STATUSES)
    .withMessage(`Status must be one of: ${LEAD_STATUSES.join(", ")}`),
];

export const listLeadsValidation = [
  query("search").optional().trim().isLength({ max: 100 }),
  query("status")
    .optional()
    .isIn(LEAD_STATUSES)
    .withMessage(`Status must be one of: ${LEAD_STATUSES.join(", ")}`),
  query("source").optional().trim().isLength({ max: 100 }),
  query("assigned_to").optional().isInt({ min: 1 }).toInt(),
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const leadIdValidation = [
  param("id").isInt({ min: 1 }).withMessage("Lead id must be valid").toInt(),
];
