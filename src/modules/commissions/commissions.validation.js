import { body, param, query } from "express-validator";

const COMMISSION_STATUSES = ["pending", "approved", "paid", "rejected"];
const COMMISSION_TYPES = ["lead", "rental", "manual"];

const amountValidation = (field) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage(`${field} must be a positive number`)
    .toFloat();

const dateValidation = (field) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage(`${field} must be a valid date`);

export const createCommissionValidation = [
  body("employee_id")
    .notEmpty()
    .withMessage("Employee is required")
    .isInt({ min: 1 })
    .withMessage("Employee must be valid")
    .toInt(),
  body("lead_id")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Lead must be valid")
    .toInt(),
  body("client_id")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Client must be valid")
    .toInt(),
  body("commission_type")
    .optional()
    .isIn(COMMISSION_TYPES)
    .withMessage(`Commission type must be one of: ${COMMISSION_TYPES.join(", ")}`),
  amountValidation("base_amount"),
  amountValidation("commission_percentage"),
  amountValidation("commission_amount"),
  body().custom((payload) => {
    const hasAmount =
      payload.commission_amount !== undefined &&
      payload.commission_amount !== null &&
      payload.commission_amount !== "";
    const hasFormula =
      Number(payload.base_amount || 0) > 0 &&
      Number(payload.commission_percentage || 0) > 0;

    if (!hasAmount && !hasFormula) {
      throw new Error(
        "Commission amount is required, or provide base_amount and commission_percentage"
      );
    }
    return true;
  }),
  body("status")
    .optional()
    .isIn(COMMISSION_STATUSES)
    .withMessage(`Status must be one of: ${COMMISSION_STATUSES.join(", ")}`),
  dateValidation("due_date"),
  dateValidation("paid_at"),
  body("payment_mode")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Payment mode must be at most 100 characters"),
  body("transaction_reference")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage("Transaction reference must be at most 150 characters"),
  body("notes")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Notes must be at most 2000 characters"),
  body("approved_by")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Approved by must be valid")
    .toInt(),
];

export const updateCommissionValidation = [
  body("employee_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Employee must be valid")
    .toInt(),
  body("lead_id")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Lead must be valid")
    .toInt(),
  body("client_id")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Client must be valid")
    .toInt(),
  body("commission_type")
    .optional()
    .isIn(COMMISSION_TYPES)
    .withMessage(`Commission type must be one of: ${COMMISSION_TYPES.join(", ")}`),
  amountValidation("base_amount"),
  amountValidation("commission_percentage"),
  amountValidation("commission_amount"),
  body("status")
    .optional()
    .isIn(COMMISSION_STATUSES)
    .withMessage(`Status must be one of: ${COMMISSION_STATUSES.join(", ")}`),
  dateValidation("due_date"),
  dateValidation("paid_at"),
  body("payment_mode")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Payment mode must be at most 100 characters"),
  body("transaction_reference")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage("Transaction reference must be at most 150 characters"),
  body("notes")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Notes must be at most 2000 characters"),
  body("approved_by")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Approved by must be valid")
    .toInt(),
];

export const updateCommissionStatusValidation = [
  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(COMMISSION_STATUSES)
    .withMessage(`Status must be one of: ${COMMISSION_STATUSES.join(", ")}`),
  body("approved_by")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Approved by must be valid")
    .toInt(),
  dateValidation("paid_at"),
];

export const markCommissionPaidValidation = [
  dateValidation("paid_at"),
  body("payment_mode")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage("Payment mode must be at most 100 characters"),
  body("transaction_reference")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage("Transaction reference must be at most 150 characters"),
  body("notes")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Notes must be at most 2000 characters"),
];

export const listCommissionsValidation = [
  query("search").optional().trim().isLength({ max: 100 }),
  query("status")
    .optional()
    .isIn(COMMISSION_STATUSES)
    .withMessage(`Status must be one of: ${COMMISSION_STATUSES.join(", ")}`),
  query("employee_id").optional().isInt({ min: 1 }).toInt(),
  query("lead_id").optional().isInt({ min: 1 }).toInt(),
  query("from_date").optional().isISO8601(),
  query("to_date").optional().isISO8601(),
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const commissionIdValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Commission id must be valid")
    .toInt(),
];
