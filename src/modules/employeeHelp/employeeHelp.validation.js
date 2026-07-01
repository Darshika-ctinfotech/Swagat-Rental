import { body, query } from "express-validator";

export const createEmployeeHelpValidation = [
    body("employee_id")
        .notEmpty()
        .withMessage("Employee ID is required")
        .isInt()
        .withMessage("Employee ID must be a number"),

    body("name")
        .trim()
        .notEmpty()
        .withMessage("Name is required")
        .isLength({ min: 2, max: 100 })
        .withMessage("Name must be between 2 and 100 characters"),

    body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required")
        .isEmail()
        .withMessage("Email must be valid"),

    body("description")
        .trim()
        .notEmpty()
        .withMessage("Description is required")
        .isLength({ min: 10, max: 1000 })
        .withMessage("Description must be between 10 and 1000 characters"),
];

export const updateEmployeeHelpValidation = [
    body("name")
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage("Name must be between 2 and 100 characters"),

    body("email")
        .optional()
        .trim()
        .isEmail()
        .withMessage("Email must be valid"),

    body("description")
        .optional()
        .trim()
        .isLength({ min: 10, max: 1000 })
        .withMessage("Description must be between 10 and 1000 characters"),
];

export const listEmployeeHelpValidation = [
    query("search").optional().trim().isLength({ max: 100 }),
    query("employee_id").optional().isInt(),
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
];
