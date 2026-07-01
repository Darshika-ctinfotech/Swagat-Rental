import { body } from "express-validator";

export const createDeviceValidation = [
  body("device_uid").optional().trim(),
  body("device_uuid").optional().trim(),
  body("device_name").optional().trim(),
  body("inventory_ids").optional(),

  body("device_type")
    .notEmpty()
    .withMessage("Device type is required.")
    .trim(),

  body("client_id")
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage("Client id is required"),

  body("installed_by_employee_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid employee id"),

  body("installation_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid installation date"),

  body("status")
    .optional()
    .isIn(["active", "pending", "under_service", "inactive"])
    .withMessage("Invalid status"),

  body("warranty_start_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid warranty start date"),

  body("warranty_end_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid warranty end date"),

  body("is_warranty_active")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid warranty flag"),

  body("processor")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid processor inventory id"),
  body("motherboard")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid motherboard inventory id"),
  body("mac_address")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid mac inventory id"),
  body("ip_address")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid ip inventory id"),

  body("ram_gb")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid RAM inventory id"),

  body("ram_serial_no")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid RAM serial inventory id"),
  body("ram_brand")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid RAM brand inventory id"),

  body("ssd_gb")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid SSD inventory id"),

  body("ssd_serial_no")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid SSD serial inventory id"),
  body("full_response").optional(),
];

export const updateDeviceValidation = [
  body("device_uid").optional().trim(),
  body("device_uuid").optional().trim(),
  body("device_name").optional().trim(),
  body("device_type").optional().trim(),
  body("inventory_ids").optional(),

  body("client_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid client id"),

  body("installed_by_employee_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid employee id"),

  body("installation_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid installation date"),

  body("status")
    .optional()
    .isIn(["active", "pending", "under_service", "inactive"])
    .withMessage("Invalid status"),

  body("warranty_start_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid warranty start date"),

  body("warranty_end_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid warranty end date"),

  body("is_warranty_active")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid warranty flag"),

  body("processor")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid processor inventory id"),
  body("motherboard")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid motherboard inventory id"),
  body("mac_address")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid mac inventory id"),
  body("ip_address")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid ip inventory id"),

  body("ram_gb")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid RAM inventory id"),

  body("ram_serial_no")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid RAM serial inventory id"),
  body("ram_brand")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid RAM brand inventory id"),

  body("ssd_gb")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid SSD inventory id"),

  body("ssd_serial_no")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Invalid SSD serial inventory id"),
  body("full_response").optional(),
];

export const updateDeviceStatusValidation = [
  body("status")
    .notEmpty()
    .isIn(["active", "pending", "under_service", "inactive"])
    .withMessage("Invalid status"),
];

export const assignDeviceValidation = [
  body("employee_id")
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage("Employee id is required"),

  body("installation_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid installation date"),
];

export const systemInfoValidation = [
  body("client_unique_id")
    .notEmpty()
    .withMessage("Client unique id is required."),
  body("system_info")
    .notEmpty()
    .withMessage("system_info is required."),
  body("device_type").optional().trim(),
  body("device_uid").optional().trim(),
  body("device_uuid").optional().trim(),
  body("device_name").optional().trim(),
  body("installation_date")
    .optional()
    .isISO8601()
    .withMessage("Invalid installation date"),
];
