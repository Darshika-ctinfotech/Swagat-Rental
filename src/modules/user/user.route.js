import { Router } from "express";
import {
  getChatUsers,
  getMyProfile,
  getMyDevices,
  getUserProfile,
  raiseServiceRequest,
  listServiceRequests,
  getServiceRequestById,
  markServiceRequestAsCompleted,
  updateMyProfile,
  changePassword,
  createPayment,
  listMyPayments,
  listMyInvoices,
  listMyAgreements,
} from "./user.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { fieldsAWS } from "../../utils/aws.util.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import { createPaymentValidation, updateProfileValidation } from "./user.validation.js";
import { changePasswordValidation } from "../admin/admin.validation.js";

import { sendBirthdayMails } from "../birthday/birthday.controller.js";
const router = Router();
const KYC_UPLOAD_FIELDS = [
  { name: "aadhaar_card", maxCount: 10 },
  { name: "pan_card", maxCount: 10 },
  { name: "office_rent_agreement", maxCount: 10 },
  { name: "gst_certificate", maxCount: 10 },
  { name: "gumasta", maxCount: 10 },
  { name: "security_cheque", maxCount: 10 },
  { name: "verification_video", maxCount: 1 },
  { name: "selfie", maxCount: 1 },
];

router.get("/me", authGuard, getMyProfile);
router.get("/me/devices", authGuard, getMyDevices);
router.put(
  "/profile",
  authGuard,
  fieldsAWS("", [{ name: "profile_image", maxCount: 1 }, ...KYC_UPLOAD_FIELDS]),
  updateProfileValidation,
  handleValidationErrors,
  updateMyProfile,
);

router.post(
  "/change-password",
  authGuard,
  changePasswordValidation,
  handleValidationErrors,
  changePassword
);

router.get("/chat-list", authGuard, getChatUsers);
router.post("/raise-service-request", authGuard, raiseServiceRequest);
router.get("/service-requests", authGuard, listServiceRequests);
router.get("/service-requests/:id", authGuard, getServiceRequestById);
router.post("/service-requests/:id/mark-completed", authGuard, markServiceRequestAsCompleted);
router.get("/:id", authGuard, getUserProfile);

router.post( "/payments", authGuard, fieldsAWS("", [{ name: "screenshot", maxCount: 1 }]), createPaymentValidation, handleValidationErrors, createPayment);
router.get("/my-invoices/list", authGuard, listMyInvoices);
router.get("/my-payments/list", authGuard, listMyPayments);

router.get("/my-agreements/list", authGuard, listMyAgreements);


export default router;
