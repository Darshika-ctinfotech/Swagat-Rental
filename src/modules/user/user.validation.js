import { body } from "express-validator";

export const updateProfileValidation = [
  body("full_name")
  .not()
  .exists()
  .withMessage("full_name cannot be updated"),
  body("email").optional().isEmail().withMessage("Please enter a valid email address."),
  body("u_unique_id").optional().trim(),
  body("country_code").optional().trim(),
  body("mobile_country_code").optional().trim(),
  body("mobile_no").optional().isLength({ min: 5, max: 20 }),
  body("phone_number").optional().trim(),
  body("fcm_token").optional().trim(),
  body("dob")
    .optional()
    .isISO8601()
    .withMessage("Invalid date of birth"),
  body("country").optional().trim(),
  body("status")
    .optional()
    .isIn(["active", "inactive", "blocked"])
    .withMessage("Invalid status"),
 body("company_name")
  .not()
  .exists()
  .withMessage("company_name cannot be updated"),
  body("company_address").optional().trim(),
  body("gst_number").optional().trim(),
  body("gst_no").optional().trim(),
  body("it_person_name").optional().trim(),
  body("it_person_contact_number").optional().trim(),
  body("it_person_contact").optional().trim(),
  body("administration_contact_name").optional().trim(),
  body("administration_contact_number").optional().trim(),
  body("total_computers").optional().isInt({ min: 0 }),
  body("total_laptops").optional().isInt({ min: 0 }),
  body("total_servers").optional().isInt({ min: 0 }),
  body("total_gsm_gateways").optional().isInt({ min: 0 }),
  body("deleteKycIds").optional(),
];

export const submitKycValidation = [];

export const createPaymentValidation = [
  body("invoice_id")
    .notEmpty()
    .withMessage("invoice_id is required")
    .isInt()
    .withMessage("invoice_id must be integer"),

  body("amount_paid")
    .notEmpty()
    .withMessage("amount_paid is required")
    .isFloat({ min: 1 })
    .withMessage("amount_paid must be greater than 0"),

  body("payment_mode")
    .notEmpty()
    .withMessage("payment_mode is required")
    .isIn(["cash", "cheque", "upi", "online"])
    .withMessage("Invalid payment mode"),
];
