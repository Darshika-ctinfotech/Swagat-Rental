import { body } from "express-validator";

const isValidClientId = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1;
  }
  if (typeof value === "string") {
    const str = value.trim();
    if (!str) return false;
    if (/^\d+$/.test(str)) return Number(str) >= 1;
    return true;
  }
  return false;
};

export const addPcInfoValidation = [
  body("client_id")
    .custom(isValidClientId)
    .withMessage("client_id is required"),
  body("employee_id").optional().trim(),
  body("system_uid").optional().trim(),
  body("system_uuid").optional().trim(),
  body("device_type").optional().trim(),
  body("hardware_fingerprint").optional().trim(),
  body("json").optional(),
  body("system_info").optional(),
  body("assets").optional().isArray().withMessage("assets must be an array"),
  body("installed_by_employee_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("Invalid employee id"),
  body("installation_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid installation date"),
  body("status")
    .optional()
    .isIn(["active", "inactive", "under_service", "underservice"])
    .withMessage("Invalid status"),
];

export const createSystemValidation = [
  body("client_id")
    .custom(isValidClientId)
    .withMessage("client_id is required"),
  body("system_uid").optional().trim(),
  body("system_uuid").optional().trim(),
  body("device_type").optional().trim(),
  body("hardware_fingerprint").optional().trim(),
  body("installed_by_employee_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("Invalid employee id"),
  body("installation_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid installation date"),
  body("status")
    .optional()
    .isIn(["active", "inactive", "under_service", "underservice"])
    .withMessage("Invalid status"),
  body("is_active")
    .optional()
    .isBoolean()
    .withMessage("Invalid is_active flag"),
];

export const addSystemSnapshotValidation = [
  body("system_id").notEmpty().withMessage("system_id is required"),
  body("system_uuid").optional().trim(),
  body("device_type").optional().trim(),
  body("hardware_fingerprint").optional().trim(),
  body("snapshot").optional(),
  body("json").optional(),
  body("system_info").optional(),
  body("assets").optional().isArray().withMessage("assets must be an array"),
];

export const updateSystemValidation = [
  body("system_uid")
    .optional()
    .trim(),
  body("system_uuid")
    .optional()
    .trim(),
  body("device_type")
    .optional()
    .trim(),
  body("hardware_fingerprint")
    .optional()
    .trim(),
  body("client_id")
    .optional()
    .custom(isValidClientId)
    .withMessage("Invalid client id"),
  body("installed_by_employee_id")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("Invalid employee id"),
  body("installation_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid installation date"),
  body("status")
    .optional()
    .isIn(["active", "inactive", "under_service", "underservice"])
    .withMessage("Invalid status"),
  body("is_active")
    .optional()
    .isBoolean()
    .withMessage("Invalid is_active flag"),
];

export const updateSystemStatusValidation = [
  body("status")
    .notEmpty()
    .isIn(["active", "inactive", "under_service", "underservice"])
    .withMessage("Invalid status"),
];

export const updateSystemApprovalStatusValidation = [
  body("approval_status")
    .notEmpty()
    .isIn(["pending", "approved", "rejected"])
    .withMessage("Invalid approval status"),
]

export const systemHeartbeatValidation = [
  body("system_id")
    .notEmpty()
    .withMessage("system_id is required")
    .bail()
    .trim()
    .isUUID()
    .withMessage("system_id must be a valid UUID"),
  body("hardware_fingerprint")
    .notEmpty()
    .withMessage("hardware_fingerprint is required")
    .bail()
    .trim()
    .isString()
    .withMessage("hardware_fingerprint must be a string"),
];
export const assignSystemValidation = [
  body("employee_id")
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage("employee_id is required"),
  body("installation_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid installation date"),
];

export const assignBulkSystemValidation = [
  body("client_id")
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage("client_id is required"),
  body("system_ids")
    .isArray()
    .withMessage("system_ids must be an array"),
];

// export const employeeSystemAssignmentAuthValidation = [
//   body("email")
//     .notEmpty()
//     .withMessage("email is required")
//     .isEmail()
//     .withMessage("Invalid email"),
//   body("password")
//     .notEmpty()
//     .withMessage("password is required"),
// ];


export const employeeSystemAssignmentAuthValidation = [
  body("e_unique_id")
    .notEmpty()
    .withMessage("employee id is required")
    .isLength({ min: 3 })
    .withMessage("employee id must be at least 3 characters"),

  body("password")
    .notEmpty()
    .withMessage("password is required")
    .isLength({ min: 6 })
    .withMessage("password must be at least 6 characters"),
];
