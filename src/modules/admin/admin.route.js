import { Router } from "express";
import {
  forgotPassword,
  getMyProfile,
  login,
  register,
  renderResetPasswordPage,
  createClient,
  updateClient,
  createEmployee,
  listClients,
  listEmployees,
  getClientDetails,
  getClientDevices,
  getEmployeeDetails,
  getEmployeeDevices,
  getDashboardSummary,
  resetPassword,
  updateMyProfile,
  verifyEmail,
  resendOtp,
  updateEmployee,
  updateEmployeeRole,
  blockEmployee,
  deleteEmployee,
  changePassword,
  createAssetCategory,
  updateAssetCategory,
  deleteAssetCategory,
  createAssets,
  listServiceRequests,
  getServiceRequestById,
  assignServiceRequest,
  listPendingKycApprovals,
  manageKycApproval,
  createGsmGateway,
  listGsmGateways,
  getGsmGateway,
  updateGsmGateway,
  deleteGsmGateway,
  createServer,
  listServers,
  getServer,
  updateServer,
  deleteServer,
  updateClientRelocation,
  manageDocumentApproval,
  listPayments,
  updatePaymentStatus,
  getServiceRequestsAnalyticsLast12Months,
  updateSystemStatus,
  Broadcast,
  saveClientToken,
  sendPushToSelectedClients,
  runAgreementStatusCheck,
} from "./admin.controller.js";
import {
  adminRegisterValidation,
  adminCreateClientValidation,
  adminUpdateClientValidation,
  adminCreateEmployeeValidation,
  adminUpdateKycValidation,
  forgotPasswordValidation,
  loginValidation,
  resetPasswordPostValidation,
  updateProfileValidation,
  verifyEmailValidation,
  resendOtpValidation,
  changePasswordValidation,
  assetCategoryValidation,
  assetCategoryUpdateValidation,
  createAssetsValidation,
  adminKycApprovalValidation,
  adminUpdateEmployeeRoleValidation,
  createGsmGatewayValidation,
  updateGsmGatewayValidation,
  createServerValidation,
  updateServerValidation,
  adminRelocationValidation,
  adminDocumentApprovalValidation,
  approveRejectPaymentValidation,
  adminUpdateSystemStatusValidation,
  
} from "./admin.validation.js";
import {
  blockEmployeeValidation,
  updateEmployeeValidation,
} from "../employee/employee.validation.js";
import { handleValidationErrors } from "../../middlewares/validation.middleware.js";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { fieldsAWS } from "../../utils/aws.util.js";
import { blockSystem } from "../system/system.controller.js";
import { createInvoiceManually, getInvoiceDetails, getInvoiceLogs, getInvoiceManualCreateOptions, listInvoices, setInvoiceUrgency } from "../invoice/invoice.controller.js";
import { getClientBalance, getClientLedger } from "../ledger/ledger.controller.js";
import { getPaymentAnalyticsLast12Months, getPaymentDashboard } from "../payment/payment.controller.js";
import { createAgreement, getAgreementOptionsForClient, getAgreementById, listAgreements, updateAgreement, updateAgreementStatus,  updateAgreementPrices } from "../agreement/agreement.controller.js";
import admin from 'firebase-admin';


const router = Router();
const KYC_UPLOAD_FIELDS = [
  { name: "aadhaar_card", maxCount: 10 },
  { name: "pan_card", maxCount: 10 },
  { name: "office_rent_agreement", maxCount: 10 },
  { name: "gst_certificate", maxCount: 10 },
  { name: "gumasta", maxCount: 10 },
  { name: "security_cheque", maxCount: 10 },
  { name: "verification_video", maxCount: 1 },
];
const EMPLOYEE_DOC_FIELDS = [
  { name: "aadhar_card", maxCount: 10 },
  { name: "other_documents", maxCount: 10 },
  { name: "police_verifications", maxCount: 10 },
  { name: "selfie", maxCount: 1 },
];


router.post("/register", adminRegisterValidation, handleValidationErrors, register);
router.post("/verify-email", verifyEmailValidation, handleValidationErrors, verifyEmail);
router.post("/resend-otp", resendOtpValidation, handleValidationErrors, resendOtp);
router.post("/login", loginValidation, handleValidationErrors, login);
router.post(
  "/forgot-password",
  forgotPasswordValidation,
  handleValidationErrors,
  forgotPassword
);

//code by Darshika
router.post("/broadcast", authGuard, Broadcast);
router.post("/targeted-notification", sendPushToSelectedClients);
//===========================
const updateClientStack = [
  authGuard,
  fieldsAWS("kyc", KYC_UPLOAD_FIELDS),
  adminUpdateClientValidation,
  handleValidationErrors,
  updateClient,
];
router.put("/clients/:id", ...updateClientStack);
router.post("/clients/:id", ...updateClientStack);
router.get("/reset-password/:token", renderResetPasswordPage);
router.post(
  "/reset-password",
  resetPasswordPostValidation,
  handleValidationErrors,
  resetPassword
);

router.get("/me", authGuard, getMyProfile);
router.put(
  "/profile",
  authGuard,
  fieldsAWS("", [{ name: "profile_image", maxCount: 1 }]),
  updateProfileValidation,
  handleValidationErrors,
  updateMyProfile
);
router.post(
  "/change-password",
  authGuard,
  changePasswordValidation,
  handleValidationErrors,
  changePassword
);

router.post(
  "/clients",
  authGuard,
  fieldsAWS("kyc", KYC_UPLOAD_FIELDS),
  adminCreateClientValidation,
  handleValidationErrors,
  createClient
);

router.get("/clients", authGuard, listClients);
router.get("/clients/:id", authGuard, getClientDetails);
router.get("/clients/:id/devices", authGuard, getClientDevices);

router.patch(
  "/clients/:id/relocation",
  authGuard,
  adminRelocationValidation,
  handleValidationErrors,
  updateClientRelocation
);

router.get("/dashboard", authGuard, getDashboardSummary);

router.post(
  "/employees",
  authGuard,
  fieldsAWS("employee-documents", EMPLOYEE_DOC_FIELDS),
  adminCreateEmployeeValidation,
  handleValidationErrors,
  createEmployee
);
router.get("/employees", authGuard, listEmployees);
router.get("/employees/:id", authGuard, getEmployeeDetails);
router.get("/employees/:id/devices", authGuard, getEmployeeDevices);
router.put(
  "/employees/:id",
  authGuard,
  fieldsAWS("employee-documents", EMPLOYEE_DOC_FIELDS),
  updateEmployeeValidation,
  handleValidationErrors,
  updateEmployee
);
router.patch(
  "/employees/:id/role",
  authGuard,
  adminUpdateEmployeeRoleValidation,
  handleValidationErrors,
  updateEmployeeRole
);

router.patch(
  "/employees/:id/block",
  authGuard,
  blockEmployeeValidation,
  handleValidationErrors,
  blockEmployee
);
router.delete("/employees/:id", authGuard, deleteEmployee);

router.post(
  "/asset-categories",
  authGuard,
  assetCategoryValidation,
  handleValidationErrors,
  createAssetCategory
);
router.put(
  "/asset-categories/:id",
  authGuard,
  assetCategoryUpdateValidation,
  handleValidationErrors,
  updateAssetCategory
);
router.delete(
  "/asset-categories/:id",
  authGuard,
  deleteAssetCategory
);

router.post(
  "/assets",
  authGuard,
  createAssetsValidation,
  handleValidationErrors,
  createAssets
);

router.post(
  "/gsm-gateways",
  authGuard,
  createGsmGatewayValidation,
  handleValidationErrors,
  createGsmGateway
);
router.get("/gsm-gateways", authGuard, listGsmGateways);
router.get("/gsm-gateways/:id", authGuard, getGsmGateway);
router.put(
  "/gsm-gateways/:id",
  authGuard,
  updateGsmGatewayValidation,
  handleValidationErrors,
  updateGsmGateway
);
router.delete("/gsm-gateways/:id", authGuard, deleteGsmGateway);

router.post(
  "/servers",
  authGuard,
  createServerValidation,
  handleValidationErrors,
  createServer
);
router.get("/servers", authGuard, listServers);
router.get("/servers/:id", authGuard, getServer);
router.put(
  "/servers/:id",
  authGuard,
  updateServerValidation,
  handleValidationErrors,
  updateServer
);
router.delete("/servers/:id", authGuard, deleteServer);

router.patch("/systems/:id/block", authGuard, blockSystem);
router.patch(
  "/systems/status",
  authGuard,
  adminUpdateSystemStatusValidation,
  handleValidationErrors,
  updateSystemStatus
);
router.get("/service-requests", authGuard, listServiceRequests);
router.get("/service-requests/analytics", authGuard, getServiceRequestsAnalyticsLast12Months);
router.get("/service-requests/:id", authGuard, getServiceRequestById);
router.post("/service-requests/:id/assign", authGuard, assignServiceRequest);

router.post(
  "/client/kyc-approvals",
  authGuard,
  adminKycApprovalValidation,
  handleValidationErrors,
  manageKycApproval
);

router.post(
  "/employee/document-approvals",
  authGuard,
  adminDocumentApprovalValidation,
  handleValidationErrors,
  manageDocumentApproval
);
router.get("/client/kyc-approvals/pending", authGuard, listPendingKycApprovals);

// payments routes
router.get("/payments", authGuard, listPayments);
router.put(
  "/payments/:payment_id/status",
  authGuard,
  fieldsAWS("", [{ name: "screenshot", maxCount: 1 }]),
  approveRejectPaymentValidation,
  handleValidationErrors,
  updatePaymentStatus
);
router.get("/payments/dashboard", authGuard, getPaymentDashboard);
router.get("/payments/analytics", authGuard, getPaymentAnalyticsLast12Months);

// invoice routes
router.get("/invoices", authGuard, listInvoices);
router.get("/invoices/options", authGuard, getInvoiceManualCreateOptions);
router.get("/invoices/:invoice_id", authGuard, getInvoiceDetails);
router.post("/invoices", authGuard, createInvoiceManually);
router.get("/invoices/:invoice_id/logs", authGuard, getInvoiceLogs);
router.put("/invoices/:invoice_id/urgent", authGuard, setInvoiceUrgency);

// ledger routes
router.get("/clients/:client_id/ledger", authGuard, getClientLedger);
router.get("/clients/:client_id/balance", authGuard, getClientBalance);

// agreement routes
router.get("/agreements/options/:client_id", authGuard, getAgreementOptionsForClient);
router.post("/agreements", authGuard, createAgreement);
router.put("/agreements/:agreement_id", authGuard, updateAgreement);
router.get("/agreements", authGuard, listAgreements);
router.get("/agreements/:agreement_id", authGuard, getAgreementById);
router.put("/agreements/:agreement_id/status", authGuard, updateAgreementStatus);
//======================================
router.post("/tokens/save", saveClientToken);
router.patch("/agreements/:agreement_id/prices", authGuard, updateAgreementPrices);
router.post("/agreements/sync-notifications",authGuard, runAgreementStatusCheck);
export default router;
