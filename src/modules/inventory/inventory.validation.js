import { body, param, query } from "express-validator";

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

export const assetCategoryValidation = [
  body("name")
    .notEmpty()
    .isLength({ min: 2, max: 100 })
    .withMessage("Category name must be between 2 and 100 characters"),
  body("is_active")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid active flag"),
];

export const assetCategoryUpdateValidation = [
  body("name")
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage("Category name must be between 2 and 100 characters"),
  body("is_active")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid active flag"),
];

export const assetCategoryUpdateStatusValidation = [
  body("is_active")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid active flag"),
];

export const createInventoryValidation = [
  body("asset_category_id")
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage("Asset category id is required"),

  body("quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("quantity must be a positive number"),

  body("is_serial_number_available")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid is_serial_number_available flag"),

  body("assets_details")
    .optional()
    .isArray({ min: 1 })
    .withMessage("assets_details must be an array"),

  body("serial_numbers")
    .optional()
    .isArray({ min: 1 })
    .withMessage("serial_numbers must be an array"),

  body("brand").optional().trim(),
  body("model").optional().trim(),
  body("serial_number").optional().trim(),
  body("manufacturer").optional().trim(),
  body("spec_json").optional(),
  body("is_available")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid availability flag"),

  body("status")
    .optional()
    .isIn(["in_stock", "rented", "damaged", "retired", "used_in_system"])
    .withMessage("Invalid status"),
];

export const updateInventoryValidation = [
  body("asset_category_id").optional().isInt({ min: 1 }),
  body("brand").optional().trim(),
  body("model").optional().trim(),
  body("serial_number").optional().trim(),
  body("manufacturer").optional().trim(),
  body("spec_json").optional(),
  body("is_available")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid availability flag"),
  body("status")
    .optional()
    .isIn(["in_stock", "rented", "damaged", "retired", "used_in_system"])
    .withMessage("Invalid status"),
];

export const systemInventoryValidation = [
  body("device_type").optional().trim(),
  body("json").optional(),

  body("system_info")
    .notEmpty()
    .withMessage("system_info is required"),

  body("system_info.osInfo")
    .notEmpty()
    .withMessage("system_info.osInfo is required")
    .custom((value) => value && typeof value === "object")
    .withMessage("system_info.osInfo must be an object"),

  body("system_info").custom((systemInfo) => {
    const root = systemInfo && typeof systemInfo === "object" ? systemInfo : null;
    if (!root) throw new Error("system_info must be an object");

    const mac =
      root.mac_addres ||
      root.mac_address ||
      root?.system_info?.mac_addres ||
      root?.system_info?.mac_address ||
      null;

    if (!mac || !String(mac).trim()) {
      throw new Error("system_info.mac_addres is required");
    }

    return true;
  }),

  body("assets")
    .optional()
    .isArray()
    .withMessage("assets must be an array"),
];

export const listSystemInventoriesValidation = [
  query("search").optional().trim(),
  query("status")
    .optional()
    .isIn(["active", "inactive", "under_service", "underservice"])
    .withMessage("Invalid status"),
  query("client_id").optional().trim(),
  query("device_type").optional().trim(),
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const systemInventoryDetailsValidation = [
  param("system_id")
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage("system_id must be a positive integer")
    .toInt(),
];
