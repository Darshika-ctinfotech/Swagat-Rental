import { body, param } from "express-validator";

const parseJsonArray = (value) => {
  if (value === undefined || value === null || value === "") return value;
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    return value;
  }
};

export const adminRegisterValidation = [
  body("full_name")
    .notEmpty()
    .withMessage("Name is required.")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters.")
    .matches(/^[a-zA-Z ]+$/)
    .withMessage("Name can contain only letters and spaces."),

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

  body("role")
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Role must be between 3 and 50 characters."),
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
  body("role")
    .optional()
    .isIn(["admin", "sub_admin"])
    .withMessage("role must be admin or sub_admin"),
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

export const changePasswordValidation = [
  body("current_password")
    .notEmpty()
    .withMessage("Current password is required"),

  body("new_password")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .matches(/[!@#$%^&*]/)
    .withMessage("Password must contain at least one special character"),

  body("confirm_new_password")
    .notEmpty()
    .withMessage("Confirm password is required")
    .custom((value, { req }) => value === req.body.new_password)
    .withMessage("Passwords do not match"),
];

export const updateProfileValidation = [
  body("full_name").optional().trim()
];

export const adminUpdateSystemStatusValidation = [
  body("system_id")
    .notEmpty()
    .withMessage("system_id is required")
    .isInt({ min: 1 })
    .withMessage("system_id must be a positive integer"),
  body("status")
    .notEmpty()
    .withMessage("status is required")
    .isIn(["active", "pending", "under_service", "inactive", "restart"])
    .withMessage("Invalid status"),
  body("restart_interval").custom((value, { req }) => {
    const status =
      req.body?.status === undefined || req.body?.status === null
        ? ""
        : String(req.body.status).trim();

    if (status === "restart") {
      if (value === undefined || value === null || String(value).trim() === "") {
        throw new Error("restart_interval is required when status is restart");
      }

      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("restart_interval must be a positive integer");
      }

      return true;
    }

    if (value !== undefined) {
      throw new Error("restart_interval is only allowed when status is restart");
    }

    return true;
  }),
];

export const adminCreateClientValidation = [
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

  body("country_code")
    .optional()
    .isLength({ min: 1, max: 10 })
    .withMessage("Country code must be between 1 and 10 characters."),
  body("gateway_allocations")
    .optional()
    .customSanitizer(parseJsonArray)
    .isArray()
    .withMessage("gateway_allocations must be an array"),
  body("gateway_allocations.*.gateway_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("gateway_allocations.gateway_id must be a positive integer"),
  body("gateway_allocations.*.allocated_quantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage(
      "gateway_allocations.allocated_quantity must be a non-negative integer"
    ),
  body("server_allocations")
    .optional()
    .customSanitizer(parseJsonArray)
    .isArray()
    .withMessage("server_allocations must be an array"),
  body("server_allocations.*.server_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("server_allocations.server_id must be a positive integer"),
  body("server_allocations.*.allocated_quantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage(
      "server_allocations.allocated_quantity must be a non-negative integer"
    ),
  body("asset_allocations")
    .optional()
    .customSanitizer(parseJsonArray)
    .isArray()
    .withMessage("asset_allocations must be an array of asset_id"),
  body("asset_allocations.*")
    .optional()
    .isInt({ min: 1 })
    .withMessage("asset_allocations entries must be positive integers"),
];

export const adminCreateEmployeeValidation = [
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

  body("date_of_birth").optional().trim(),
  body("gender")
    .optional()
    .toLowerCase()
    .isIn(["male", "female", "other"])
    .withMessage("Gender must be male, female, or other"),
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

export const adminUpdateClientValidation = [
  body("full_name").optional().isLength({ min: 2, max: 200 }),
  body("email").optional().isEmail().withMessage("Please enter a valid email address."),
  body("password")
    .optional()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long."),
  body("country_code")
    .optional()
    .isLength({ min: 1, max: 10 })
    .withMessage("Country code must be between 1 and 10 characters."),
  body("mobile_no").optional().isLength({ min: 5, max: 20 }),
  body("phone_number").optional().isLength({ min: 5, max: 20 }),
  body("mobile_country_code").optional().isLength({ min: 1, max: 10 }),
  body("total_computers").optional().isInt({ min: 0 }),
  body("total_laptops").optional().isInt({ min: 0 }),
  body("total_servers").optional().isInt({ min: 0 }),
  body("total_gsm_gateways").optional().isInt({ min: 0 }),
  body("gateway_allocations")
    .optional()
    .customSanitizer(parseJsonArray)
    .isArray()
    .withMessage("gateway_allocations must be an array"),
  body("gateway_allocations.*.gateway_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("gateway_allocations.gateway_id must be a positive integer"),
  body("gateway_allocations.*.allocated_quantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage(
      "gateway_allocations.allocated_quantity must be a non-negative integer"
    ),
  body("server_allocations")
    .optional()
    .customSanitizer(parseJsonArray)
    .isArray()
    .withMessage("server_allocations must be an array"),
  body("server_allocations.*.server_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("server_allocations.server_id must be a positive integer"),
  body("server_allocations.*.allocated_quantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage(
      "server_allocations.allocated_quantity must be a non-negative integer"
    ),
  body("asset_allocations")
    .optional()
    .customSanitizer(parseJsonArray)
    .isArray()
    .withMessage("asset_allocations must be an array of asset_id"),
  body("asset_allocations.*")
    .optional()
    .isInt({ min: 1 })
    .withMessage("asset_allocations entries must be positive integers"),
];

export const adminUpdateKycValidation = [
  body("status")
    .notEmpty()
    .isIn(["pending", "approved", "rejected"])
    .withMessage("Invalid KYC status")
];

export const adminKycApprovalValidation = [
  body("client_id")
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage("client_id is required"),
  body("status")
    .notEmpty()
    .isIn(["approved", "rejected"])
    .withMessage("Status must be approved or rejected")
];

export const adminDocumentApprovalValidation = [
  body("employee_id")
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage("employee_id is required"),
  body("document_status")
    .notEmpty()
    .isIn(["approved", "rejected", "pending"])
    .withMessage("document_status must be approved, rejected or pending")
];

export const assetCategoryValidation = [
  body("name")
    .notEmpty()
    .withMessage("Category name is required")
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

export const createAssetsValidation = [
  body("asset_category_id")
    .notEmpty()
    .isInt({ min: 1 })
    .withMessage("asset_category_id is required"),
  body("serial_number").optional(),
  body("serial_numbers").optional().isArray().withMessage("serial_numbers must be an array"),
  body("quantity")
    .optional()
    .isInt({ min: 1 })
    .withMessage("quantity must be a positive number"),
  body()
    .custom((value) => {
      if (value.serial_number) return true;
      if (Array.isArray(value.serial_numbers) && value.serial_numbers.length > 0) return true;
      if (value.quantity && Number(value.quantity) > 0) return true;
      throw new Error("serial_number, serial_numbers, or quantity is required");
    }),
  body("brand").optional().trim(),
  body("model").optional().trim(),
  body("manufacturer").optional().trim(),
  body("spec_json").optional(),
  body("is_available")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("Invalid availability flag"),
  body("status")
    .optional()
    .isIn(["in_stock", "rented", "damaged", "retired"])
    .withMessage("Invalid status"),
];

export const adminUpdateEmployeeRoleValidation = [
  body("role")
    .notEmpty()
    .isIn(["employee", "sub_admin"])
    .withMessage("role must be employee or sub_admin"),
];

export const createGsmGatewayValidation = [
  body("gateway_name")
    .notEmpty()
    .withMessage("Gateway name is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Gateway name must be between 2 and 150 characters"),
  body("model_number")
    .optional()
    .isLength({ max: 100 })
    .withMessage("Model number must be at most 100 characters"),
  body("manufacturer")
    .optional()
    .isLength({ max: 150 })
    .withMessage("Manufacturer must be at most 150 characters"),
  body("number_of_port")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Number of ports must be a non-negative integer"),
  body("total_quantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Total quantity must be a non-negative integer"),
  body("status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage("Status must be active or inactive"),
];

export const updateGsmGatewayValidation = [
  body("gateway_name")
    .optional()
    .isLength({ min: 2, max: 150 })
    .withMessage("Gateway name must be between 2 and 150 characters"),
  body("model_number")
    .optional()
    .isLength({ max: 100 })
    .withMessage("Model number must be at most 100 characters"),
  body("manufacturer")
    .optional()
    .isLength({ max: 150 })
    .withMessage("Manufacturer must be at most 150 characters"),
  body("number_of_port")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Number of ports must be a non-negative integer"),
  body("total_quantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Total quantity must be a non-negative integer"),
  body("status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage("Status must be active or inactive"),
];

export const createServerValidation = [
  body("server_name")
    .notEmpty()
    .withMessage("Server name is required")
    .isLength({ min: 2, max: 150 })
    .withMessage("Server name must be between 2 and 150 characters"),
  body("processor")
    .optional()
    .isLength({ max: 150 })
    .withMessage("Processor must be at most 150 characters"),
  body("ram")
    .optional()
    .isLength({ max: 100 })
    .withMessage("RAM must be at most 100 characters"),
  body("ssd")
    .optional()
    .isLength({ max: 100 })
    .withMessage("SSD must be at most 100 characters"),
  body("hdd")
    .optional()
    .isLength({ max: 100 })
    .withMessage("HDD must be at most 100 characters"),
  body("brand")
    .optional()
    .isLength({ max: 100 })
    .withMessage("Brand must be at most 100 characters"),
  body("total_quantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Total quantity must be a non-negative integer"),
  body("status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage("Status must be active or inactive"),
];

export const updateServerValidation = [
  body("server_name")
    .optional()
    .isLength({ min: 2, max: 150 })
    .withMessage("Server name must be between 2 and 150 characters"),
  body("processor")
    .optional()
    .isLength({ max: 150 })
    .withMessage("Processor must be at most 150 characters"),
  body("ram")
    .optional()
    .isLength({ max: 100 })
    .withMessage("RAM must be at most 100 characters"),
  body("ssd")
    .optional()
    .isLength({ max: 100 })
    .withMessage("SSD must be at most 100 characters"),
  body("hdd")
    .optional()
    .isLength({ max: 100 })
    .withMessage("HDD must be at most 100 characters"),
  body("brand")
    .optional()
    .isLength({ max: 100 })
    .withMessage("Brand must be at most 100 characters"),
  body("total_quantity")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Total quantity must be a non-negative integer"),
  body("status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage("Status must be active or inactive"),
];

export const adminRelocationValidation = [
  body("is_relocated")
    .notEmpty()
    .isBoolean()
    .toBoolean()
    .withMessage("is_relocated must be true or false"),
];

export const approveRejectPaymentValidation = [
  param("payment_id")
    .notEmpty()
    .withMessage("payment_id is required")
    .isInt({ min: 1 })
    .withMessage("payment_id must be a positive integer")
    .toInt(),

  body("status")
    .notEmpty()
    .withMessage("status is required")
    .isIn(["approved", "rejected"])
    .withMessage("Invalid status")
    .custom((status, { req }) => {
      if (status === "rejected") {
        const note = req.body?.note;
        if (!note || !String(note).trim()) {
          throw new Error("note is required when status is rejected");
        }
      }
      return true;
    }),

  body("note")
    .optional()
    .isString()
    .withMessage("note must be string")
    .trim()
    .isLength({ max: 500 })
    .withMessage("note must be at most 500 characters"),
];
