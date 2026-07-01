import { ApiError, apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as AdminService from "./admin.service.js";
import * as EmployeeService from "../employee/employee.service.js";
import ROLES from "../../constants/roles.js";
import * as PaymentService from "../payment/payment.service.js";

import { pool } from "../../config/db.js"
//code by Darshika
import { sendPushToAllClients } from "../../../notificationService.js"; 
import * as AgreementService from "./admin.service.js";
import admin from "firebase-admin";

const assertAdminOrSubAdmin = (req) => {
  const role = req.user?.role;
  const hasIdentity =
    req.user?.admin_id !== undefined || req.user?.employee_id !== undefined;

  if (
    !hasIdentity ||
    (role !== ROLES.ADMIN &&
      role !== ROLES.SUPER_ADMIN &&
      role !== ROLES.SUB_ADMIN)
  ) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }
};

const parseBoolean = (value) => {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const normalizeIdArrayInput = (value) => {
  if (value === undefined || value === null || value === "") return [];

  let input = value;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        input = JSON.parse(trimmed);
      } catch (err) {
        input = trimmed.split(",");
      }
    } else {
      input = trimmed.split(",");
    }
  }

  if (!Array.isArray(input)) input = [input];

  return [...new Set(
    input
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
};

const buildKycDocumentsFromFiles = (files = {}) => {
  const docFields = [
    "aadhaar_card",
    "pan_card",
    "office_rent_agreement",
    "gst_certificate",
    "gumasta",
    "security_cheque",
    "verification_video",
  ];

  const kyc_documents = [];
  for (const field of docFields) {
    const fieldFiles = Array.isArray(files?.[field]) ? files[field] : [];
    for (const file of fieldFiles) {
      if (!file?.key) continue;
      kyc_documents.push({
        doc_type: field,
        doc_path: file.key,
      });
    }
  }

  return kyc_documents;
};

const buildEmployeeDocumentsFromFiles = (files = {}) => {
  const docFields = [
    "aadhar_card",
    "other_documents",
    "police_verifications",
    "selfie",
  ];
  const docTypeMap = {
    aadhar_card: "Aadhar_Card",
    other_documents: "Other_Documents",
    police_verifications: "Police_Verifications",
    selfie: "Selfie",
  };

  const employee_documents = [];
  let selfiePath = null;

  for (const field of docFields) {
    const fieldFiles = Array.isArray(files?.[field]) ? files[field] : [];
    for (const file of fieldFiles) {
      const fileKey = file?.key || file?.location;
      if (!fileKey) continue;
      const docType = docTypeMap[field] || field;
      employee_documents.push({
        doc_type: docType,
        doc_path: fileKey,
      });
      if (field === "selfie") {
        selfiePath = fileKey;
      }
    }
  }

  return { employee_documents, selfiePath };
};

const getActorId = (req) =>
  req.user?.admin_id ?? req.user?.employee_id ?? null;

export const register = apiHandler(async (req, res) => {
  const result = await AdminService.registerAdmin(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, Msg.adminCreated],
    "Admin",
    result,
    res,
    "object"
  );
});

export const verifyEmail = apiHandler(async (req, res) => {
  const result = await AdminService.verifyEmailOtp(req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.emailVerified],
    "Admin",
    result,
    res,
    "object"
  );
});

export const resendOtp = apiHandler(async (req, res) => {
  const result = await AdminService.resendEmailOtp(req.body.email);

  return apiResponse(
    [STATUS_CODES.OK, Msg.otpResent],
    "OTP",
    result,
    res,
    "object"
  );
});

export const login = apiHandler(async (req, res) => {
  const loginRole = req.body?.role === "sub_admin" ? "sub_admin" : "admin";
  const result = await AdminService.loginAdmin({
    ...req.body,
    role: loginRole,
  });

  return apiResponse(
    [
      STATUS_CODES.OK,
      loginRole === "sub_admin" ? "Sub admin login successful" : Msg.loginSuccess,
    ],
    loginRole === "sub_admin" ? "Employee" : "Admin",
    result,
    res,
    "object"
  );
});

export const forgotPassword = apiHandler(async (req, res) => {
  const result = await AdminService.forgotPassword(req.body.email);

  return apiResponse(
    [STATUS_CODES.OK, Msg.resetLinkSent],
    "Email",
    result,
    res,
    "object"
  );
});

export const renderResetPasswordPage = async (req, res) => {
  const { token } = req.params;

  return res.render("reset-password", {
    token,
    error: null,
    actionUrl: "/api/admin/reset-password",
  });
};

export const resetPassword = async (req, res) => {
  try {
    await AdminService.resetPassword(req.body);

    return res.render("reset-password-success");
  } catch (error) {
    return res.render("reset-password", {
      token: req.body.token,
      error: error.message || "Something went wrong",
      actionUrl: "/api/admin/reset-password",
    });
  }
};

export const getMyProfile = apiHandler(async (req, res) => {
  const role = req.user?.role;
  let profile = null;
  let label = "Admin";

  if (role === ROLES.SUB_ADMIN) {
    const employeeId = req.user.employee_id;
    profile = await EmployeeService.getMyProfile(employeeId);
    label = "Employee";
  } else {
    const adminId = req.user.admin_id;
    profile = await AdminService.getMyProfile(adminId);
  }

  return apiResponse(
    [STATUS_CODES.OK, Msg.profileFetched],
    label,
    profile,
    res,
    "object"
  );
});

export const updateMyProfile = apiHandler(async (req, res) => {
  const role = req.user?.role;
  const data = req.body;

  if (req.files?.profile_image?.length > 0) {
    data.profile_image = req.files.profile_image[0].location;
  }

  let updatedProfile = null;
  let label = "Admin";
  if (role === ROLES.SUB_ADMIN) {
    const employeeId = req.user.employee_id;
    updatedProfile = await EmployeeService.updateMyProfile(employeeId, data);
    label = "Employee";
  } else {
    const adminId = req.user.admin_id;
    updatedProfile = await AdminService.updateMyProfile(adminId, data);
  }

  return apiResponse(
    [STATUS_CODES.OK, Msg.profileUpdated],
    label,
    updatedProfile,
    res,
    "object"
  );
});

export const changePassword = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);
  const role = req.user?.role;
  let result = null;
  let label = "Admin";

  if (role === ROLES.SUB_ADMIN) {
    const employeeId = req.user.employee_id;
    result = await AdminService.changeSubAdminPassword(employeeId, req.body);
    label = "Employee";
  } else {
    const adminId = req.user.admin_id;
    result = await AdminService.changePassword(adminId, req.body);
  }

  return apiResponse(
    [STATUS_CODES.OK, Msg.passwordChanged],
    label,
    result,
    res,
    "object"
  );
});

export const createClient = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const payload = { ...req.body };
  const kyc_documents = buildKycDocumentsFromFiles(req.files);

  if (kyc_documents.length) {
    payload.kyc_documents = kyc_documents;
  }

  const creatorRole = req.user?.role === ROLES.SUB_ADMIN ? "sub_admin" : "admin";
  const creatorId =
    creatorRole === "sub_admin" ? req.user.employee_id : req.user.admin_id;

  const client = await AdminService.createClientByAdmin(
    { creatorId, creatorRole },
    payload
  );

  return apiResponse(
    [STATUS_CODES.CREATED, Msg.clientCreated],
    "Client",
    client,
    res,
    "object"
  );
});

export const updateClient = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const clientId = Number(req.params.id);
  const payload = { ...req.body };
  payload.deleteKycIds = normalizeIdArrayInput(req.body?.deleteKycIds);
  const kyc_documents = buildKycDocumentsFromFiles(req.files);
  if (kyc_documents.length) {
    payload.kyc_documents = kyc_documents;
  }

  const client = await AdminService.updateClientByAdmin(clientId, payload, {
    role: req.user?.role,
    employeeId: req.user?.employee_id ?? null,
    adminId: req.user?.admin_id ?? null,
  });

  return apiResponse(
    [STATUS_CODES.OK, Msg.profileUpdated],
    "Client",
    client,
    res,
    "object"
  );
});

export const listClients = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const { search, kyc_status, date_from, date_to, page, limit } = req.query;
  const isSubAdmin = req.user?.role === ROLES.SUB_ADMIN;
  const hasLimit =
    limit !== undefined && limit !== null && String(limit).trim() !== "";

  const result = await AdminService.listClients({
    search,
    kyc_status,
    date_from,
    date_to,
    page: Number(page) || 1,
    limit: hasLimit ? Number(limit) : null,
    created_by_role: isSubAdmin ? "sub_admin" : null,
    created_by: isSubAdmin ? req.user.employee_id : null,
  });

  return apiResponse(
    [STATUS_CODES.OK, Msg.clientsFetched],
    "Clients",
    result,
    res,
    "object"
  );
});

export const listKycApprovals = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const { search, kyc_status, date_from, date_to, page, limit } = req.query;

  const result = await AdminService.listKycApprovals({
    search,
    kyc_status,
    date_from,
    date_to,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "KYC approvals fetched successfully"],
    "KycApprovals",
    result,
    res,
    "object"
  );
});

export const listPendingKycApprovals = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  if (req.user?.role === ROLES.SUB_ADMIN) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  const { search, date_from, date_to, page, limit } = req.query;

  const result = await AdminService.listKycApprovals({
    search,
    kyc_status: "pending",
    created_by_role: "sub_admin",
    date_from,
    date_to,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "Pending KYC approvals fetched successfully"],
    "KycApprovals",
    result,
    res,
    "object"
  );
});

export const manageKycApproval = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const clientId = Number(req.body.client_id);
  const { status, document_reject_reason } = req.body;

  const client = await AdminService.updateClientKycStatus({
    clientId,
    status,
    reason: document_reject_reason,
    adminId: req.user?.admin_id ?? null,
    role: req.user?.role,
  });

  return apiResponse(
    [STATUS_CODES.OK, Msg.kycUpdated],
    "Client",
    client,
    res,
    "object"
  );
});

export const manageDocumentApproval = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const employeeId = Number(req.body.employee_id);
  const { document_status, document_reject_reason } = req.body;

  const employee = await AdminService.updateEmpoyeeDocumentStatus({
    employeeId,
    document_status,
    document_reject_reason
  });

  return apiResponse(
    [STATUS_CODES.OK, Msg.documentUpdated],
    "Employee",
    employee,
    res,
    "object"
  );
});

export const getClientDetails = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const clientId = Number(req.params.id);
  const client = await AdminService.getClientDetails(clientId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.clientFetched],
    "Client",
    client,
    res,
    "object"
  );
});

export const getClientDevices = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const clientId = Number(req.params.id);
  const { search, status, page, limit } = req.query;

  const result = await AdminService.getClientDevices({
    clientId,
    search,
    status,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, Msg.devicesFetched],
    "Devices",
    result,
    res,
    "object"
  );
});

export const getDashboardSummary = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const summary = await AdminService.getDashboardSummary({
    role: req.user?.role,
    adminId: req.user?.admin_id ?? null,
    employeeId: req.user?.employee_id ?? null,
  });

  return apiResponse(
    [STATUS_CODES.OK, Msg.dashboardFetched],
    "Dashboard",
    summary,
    res,
    "object"
  );
});

export const createEmployee = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const payload = { ...req.body };
  const { employee_documents, selfiePath } = buildEmployeeDocumentsFromFiles(
    req.files
  );

  if (employee_documents.length) {
    payload.employee_documents = employee_documents;
  }
  if (selfiePath) {
    payload.profile_image = selfiePath;
  }

  const employee = await AdminService.createEmployeeByAdmin(payload);

  return apiResponse(
    [STATUS_CODES.CREATED, Msg.employeeCreated],
    "Employee",
    employee,
    res,
    "object"
  );
});

export const listEmployees = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const { search, document_status, page, limit, is_disabled } = req.query;

  const result = await AdminService.listEmployees({
    search,
    document_status,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
    is_disabled: parseBoolean(is_disabled),
  });

  return apiResponse(
    [STATUS_CODES.OK, Msg.employeesFetched],
    "Employees",
    result,
    res,
    "object"
  );
});

export const getEmployeeDetails = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const employeeId = Number(req.params.id);
  const employee = await AdminService.getEmployeeDetails(employeeId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.employeeFetched],
    "Employee",
    employee,
    res,
    "object"
  );
});

export const updateEmployee = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const employeeId = Number(req.params.id);
  const payload = { ...req.body };
  payload.deleteDocIds = normalizeIdArrayInput(req.body?.deleteDocIds);
  const { employee_documents, selfiePath } = buildEmployeeDocumentsFromFiles(
    req.files
  );
  if (employee_documents.length) {
    payload.employee_documents = employee_documents;
  }
  if (selfiePath) {
    payload.profile_image = selfiePath;
  }

  const employee = await AdminService.updateEmployee(employeeId, payload);

  return apiResponse(
    [STATUS_CODES.OK, Msg.employeeUpdated],
    "Employee",
    employee,
    res,
    "object"
  );
});

export const updateEmployeeRole = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const employeeId = Number(req.params.id);
  const employee = await AdminService.updateEmployeeRole(employeeId, req.body.role);

  return apiResponse(
    [STATUS_CODES.OK, Msg.employeeUpdated],
    "Employee",
    employee,
    res,
    "object"
  );
});

export const blockEmployee = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const employeeId = Number(req.params.id);
  const employee = await AdminService.blockEmployee(employeeId, req.body.is_disabled);

  return apiResponse(
    [STATUS_CODES.OK, Msg.employeeUpdated],
    "Employee",
    employee,
    res,
    "object"
  );
});

export const deleteEmployee = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const employeeId = Number(req.params.id);
  const result = await AdminService.deleteEmployee(employeeId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.employeeDeleted],
    "Employee",
    result,
    res,
    "object"
  );
});

export const getEmployeeDevices = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const employeeId = Number(req.params.id);
  const devices = await AdminService.getEmployeeDevices(employeeId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.devicesFetched],
    "Devices",
    devices,
    res,
    "array"
  );
});

export const createAssetCategory = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const category = await AdminService.createAssetCategory(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, "Asset category created"],
    "AssetCategory",
    category,
    res,
    "object"
  );
});

export const updateAssetCategory = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const categoryId = Number(req.params.id);
  const category = await AdminService.updateAssetCategory(categoryId, req.body);

  return apiResponse(
    [STATUS_CODES.OK, "Asset category updated"],
    "AssetCategory",
    category,
    res,
    "object"
  );
});

export const deleteAssetCategory = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const categoryId = Number(req.params.id);
  const result = await AdminService.deleteAssetCategory(categoryId);

  return apiResponse(
    [STATUS_CODES.OK, "Asset category deleted"],
    "AssetCategory",
    result,
    res,
    "object"
  );
});

export const createAssets = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const result = await AdminService.createAssetsByAdmin(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, "Assets created"],
    "Assets",
    result,
    res,
    "object"
  );
});

export const createGsmGateway = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const gateway = await AdminService.createGsmGateway(req.body, {
    actorId: getActorId(req),
  });

  return apiResponse(
    [STATUS_CODES.CREATED, "GSM gateway created"],
    "GsmGateway",
    gateway,
    res,
    "object"
  );
});

export const listGsmGateways = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const { search, status, page, limit } = req.query;

  const result = await AdminService.listGsmGateways({
    search,
    status,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "GSM gateways fetched successfully"],
    "GsmGateways",
    result,
    res,
    "object"
  );
});

export const getGsmGateway = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const gatewayId = Number(req.params.id);
  const gateway = await AdminService.getGsmGatewayById(gatewayId);

  return apiResponse(
    [STATUS_CODES.OK, "GSM gateway fetched successfully"],
    "GsmGateway",
    gateway,
    res,
    "object"
  );
});

export const updateGsmGateway = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const gatewayId = Number(req.params.id);
  const gateway = await AdminService.updateGsmGateway(gatewayId, req.body, {
    actorId: getActorId(req),
  });

  return apiResponse(
    [STATUS_CODES.OK, "GSM gateway updated"],
    "GsmGateway",
    gateway,
    res,
    "object"
  );
});

export const deleteGsmGateway = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const gatewayId = Number(req.params.id);
  const result = await AdminService.deleteGsmGateway(gatewayId, {
    actorId: getActorId(req),
  });

  return apiResponse(
    [STATUS_CODES.OK, "GSM gateway deleted"],
    "GsmGateway",
    result,
    res,
    "object"
  );
});

export const createServer = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const server = await AdminService.createServer(req.body, {
    actorId: getActorId(req),
  });

  return apiResponse(
    [STATUS_CODES.CREATED, "Server created"],
    "Server",
    server,
    res,
    "object"
  );
});

export const listServers = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const { search, status, page, limit } = req.query;

  const result = await AdminService.listServers({
    search,
    status,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "Servers fetched successfully"],
    "Servers",
    result,
    res,
    "object"
  );
});

export const getServer = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const serverId = Number(req.params.id);
  const server = await AdminService.getServerById(serverId);

  return apiResponse(
    [STATUS_CODES.OK, "Server fetched successfully"],
    "Server",
    server,
    res,
    "object"
  );
});

export const updateServer = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const serverId = Number(req.params.id);
  const server = await AdminService.updateServer(serverId, req.body, {
    actorId: getActorId(req),
  });

  return apiResponse(
    [STATUS_CODES.OK, "Server updated"],
    "Server",
    server,
    res,
    "object"
  );
});

export const deleteServer = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const serverId = Number(req.params.id);
  const result = await AdminService.deleteServer(serverId, {
    actorId: getActorId(req),
  });

  return apiResponse(
    [STATUS_CODES.OK, "Server deleted"],
    "Server",
    result,
    res,
    "object"
  );
});

export const updateClientRelocation = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  if (req.user?.role === ROLES.SUB_ADMIN) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  const clientId = Number(req.params.id);
  const { is_relocated } = req.body;

  const client = await AdminService.updateClientRelocation({
    clientId,
    isRelocated: Boolean(is_relocated),
    actorId: getActorId(req),
  });

  return apiResponse(
    [
      STATUS_CODES.OK,
      is_relocated ? "Client marked for re-KYC" : "Client relocation cleared",
    ],
    "Client",
    client,
    res,
    "object"
  );
});

export const updateSystemStatus = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const systemId = req.body?.system_id;
  const status = req.body?.status;
  const restartInterval = req.body?.restart_interval;

  const system = await AdminService.updateSystemStatus({
    systemId,
    status,
    restartInterval,
  });

  return apiResponse(
    [STATUS_CODES.OK, "System status updated successfully"],
    "System",
    system,
    res,
    "object"
  );
});

export const listServiceRequests = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const { status, client_id, system_id, employee_id, search, page, limit } = req.query;

  const result = await AdminService.listServiceRequests({
    status,
    client_id: client_id ? Number(client_id) : undefined,
    system_id: system_id ? Number(system_id) : undefined,
    employee_id: employee_id ? Number(employee_id) : undefined,
    search,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "Service requests fetched successfully"],
    "ServiceRequests",
    result,
    res,
    "object"
  );
});

export const getServiceRequestById = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const requestId = Number(req.params.id);
  const result = await AdminService.getServiceRequestById(requestId);

  return apiResponse(
    [STATUS_CODES.OK, "Service request fetched successfully"],
    "ServiceRequest",
    result,
    res,
    "object"
  );
});

export const assignServiceRequest = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const requestId = Number(req.params.id);
  const employee_id = Number(req.body.employee_id);
  const mark_as_urgent =
    req.body.mark_as_urgent === undefined
      ? undefined
      : req.body.mark_as_urgent
        ? 1
        : 0;

  if (!employee_id) {
    throw new ApiError([STATUS_CODES.BAD_REQUEST, "employee_id is required"]);
  }

  const result = await AdminService.assignServiceRequest({
    requestId,
    employee_id,
    assigned_at: req.body.assigned_at,
    mark_as_urgent,
  });

  return apiResponse(
    [STATUS_CODES.OK, "Service request assigned successfully"],
    "ServiceRequest",
    result,
    res,
    "object"
  );
});

export const getServiceRequestsAnalyticsLast12Months = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const result = await AdminService.getServiceRequestsAnalyticsLast12Months();

  return apiResponse(
    [STATUS_CODES.OK, "Service requests analytics fetched"],
    "Analytics",
    result,
    res,
    "object"
  );
});

export const listPayments = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const { search, status, client_id, page, limit } = req.query;

  const result = await PaymentService.listPayments({
    search,
    status,
    client_id,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "Payments fetched successfully"],
    "Payments",
    result,
    res,
    "object"
  );
});

export const updatePaymentStatus = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const paymentId = Number(req.params.payment_id);
  const { status, note, screenshot } = req.body;
  const normalizedScreenshot =
    typeof screenshot === "string" && screenshot.trim()
      ? screenshot.trim()
      : undefined;
  const uploadedScreenshot =
    req.files &&
      !Array.isArray(req.files) &&
      Array.isArray(req.files.screenshot) &&
      req.files.screenshot[0]
      ? req.files.screenshot[0]
      : req.file;
  const uploadedScreenshotPath =
    uploadedScreenshot?.key ||
    uploadedScreenshot?.location ||
    uploadedScreenshot?.path ||
    undefined;
  const finalScreenshot = uploadedScreenshotPath || normalizedScreenshot;
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid payment_id"]);
  }

  const result = await PaymentService.updatePaymentStatus(
    req.user,
    paymentId,
    status,
    note,
    finalScreenshot
  );

  return apiResponse(
    [STATUS_CODES.OK, `Payment ${status} successfully`],
    "Payment",
    result,
    res,
    "object"
  );
});



export const Broadcast = (async (req, res) => {
  const { title, body } = req.body;

  if (!title || !body) {
    return res.status(400).json({ 
      success: false, 
      error: "Validation Failed: Title and Body are required." 
    });
  }

  try {
    const result = await sendPushToAllClients(pool, title, body);
    return res.status(200).json({
      success: true,
      message: "Broadcast execution finished processing.",
      data: result
    });
  } catch (error) {
    console.error("❌ Route handling crash:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Internal Server Error during push notification broadcast." 
    });
  }
});


export const saveClientToken = async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: "Token is required" });
  }

  try {
    // Testing ke liye id = 1 par token update kar rahe hain
    const query = `
      UPDATE clients 
      SET fcm_token = ? 
      WHERE id = 1; 
    `;

    await pool.query(query, [token]);
    console.log("💾 Real Browser Token Database mein successfully save ho gaya!");

    return res.status(200).json({ 
      success: true, 
      message: "Token successfully updated in clients table." 
    });

  } catch (error) {
    console.error("❌ Database error while saving token:", error);
    return res.status(500).json({ success: false, error: "Database internal error." });
  }
};


export const sendPushToSelectedClients = async (req, res) => {
  const { clientIds, title, body } = req.body;

  if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: "Validation Failed: clientIds strictly required as a non-empty array." 
    });
  }
  if (!title || !body) {
    return res.status(400).json({ success: false, error: "Title and Body are required." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT fcm_token FROM clients WHERE id IN (?) AND fcm_token IS NOT NULL AND fcm_token != ''",
      [clientIds]
    );

    if (rows.length === 0) {
      console.log("⚠️ Selected clients mein se kisi ka bhi valid FCM token nahi mila.");
      return res.status(404).json({ 
        success: false, 
        message: "No valid registered devices found for the selected clients." 
      });
    }

    const targetTokens = rows.map(row => row.fcm_token);
    console.log(`📢 Total ${targetTokens.length} selected devices par targeted message bheja ja raha hai...`);

    let totalSuccessCount = 0;
    let totalFailureCount = 0;
    const failedTokens = [];

    const CHUNK_SIZE = 500;
    for (let i = 0; i < targetTokens.length; i += CHUNK_SIZE) {
      const tokenChunk = targetTokens.slice(i, i + CHUNK_SIZE);

      const message = {
        notification: { title, body },
        tokens: tokenChunk,
      };


      const response = await admin.messaging().sendEachForMulticast(message);
      
      totalSuccessCount += response.successCount;
      totalFailureCount += response.failureCount;

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            if (errCode === 'messaging/invalid-registration-token' ||
                errCode === 'messaging/registration-token-not-registered') {
              failedTokens.push(tokenChunk[idx]);
            }
          }
        });
      }
    }

    if (failedTokens.length > 0) {
      await pool.query(
        "UPDATE clients SET fcm_token = NULL WHERE fcm_token IN (?)", 
        [failedTokens]
      );
      console.log(`🧹 Cleaned up ${failedTokens.length} expired tokens from selected chunk.`);
    }

    return res.status(200).json({
      success: true,
      message: "Targeted notification sent successfully.",
      data: {
        totalRequestedIds: clientIds.length,
        tokensFound: targetTokens.length,
        successCount: totalSuccessCount,
        failureCount: totalFailureCount
      }
    });

  } catch (error) {
    console.error("❌ Error in sendPushToSelectedClients controller:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error." });
  }
};
//code by darshika
//code fo sending agreement status notifications
export const runAgreementStatusCheck = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const result = await AgreementService.checkAndNotifyAgreementStatus();

  return apiResponse(
    [STATUS_CODES.OK, "Agreement status check completed"],
    "AgreementNotification",
    result,
    res,
    "object"
  );
});