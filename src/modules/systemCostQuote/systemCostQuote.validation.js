import { body, param, query } from "express-validator";

const optionalAmount = (field) =>
  body(field)
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage(`${field} must be a positive number`)
    .toFloat();

export const createSystemCostQuoteValidation = [
  body("system_id")
    .notEmpty()
    .withMessage("System is required")
    .isInt({ min: 1 })
    .withMessage("System must be valid")
    .toInt(),
  body("client_id")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Client must be valid")
    .toInt(),
  body("agreement_id")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Agreement must be valid")
    .toInt(),
  body("system_cost")
    .notEmpty()
    .withMessage("System cost is required")
    .isFloat({ min: 0 })
    .withMessage("System cost must be a positive number")
    .toFloat(),
  optionalAmount("client_quote"),
  body("notes")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Notes must be at most 2000 characters"),
];

export const updateSystemCostQuoteValidation = [
  body("system_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("System must be valid")
    .toInt(),
  body("client_id")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Client must be valid")
    .toInt(),
  body("agreement_id")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Agreement must be valid")
    .toInt(),
  optionalAmount("system_cost"),
  optionalAmount("client_quote"),
  body("notes")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Notes must be at most 2000 characters"),
];

export const listSystemCostQuotesValidation = [
  query("search").optional().trim().isLength({ max: 100 }),
  query("system_id").optional().isInt({ min: 1 }).toInt(),
  query("client_id").optional().isInt({ min: 1 }).toInt(),
  query("agreement_id").optional().isInt({ min: 1 }).toInt(),
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const systemCostQuoteIdValidation = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("System cost quote id must be valid")
    .toInt(),
];
