import { ApiError, apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as EmployeeService from "./employee.service.js";

const parseBoolean = (value) => {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
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

export const changePassword = apiHandler(async (req, res) => {
  const data = req.body;
  const employeeId = req.user.employee_id;
  const result = await EmployeeService.changePassword(employeeId, data);
  return apiResponse(
    [STATUS_CODES.OK, Msg.passwordChanged],
    "Employee",
    result,
    res,
    "object"
  );
});

export const createEmployee = apiHandler(async (req, res) => {
  const employee = await EmployeeService.createEmployee(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, Msg.employeeCreated],
    "Employee",
    employee,
    res,
    "object"
  );
});

export const getMyProfile = apiHandler(async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  const profile = await EmployeeService.getMyProfile(employeeId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.profileFetched],
    "Employee",
    profile,
    res,
    "object"
  );
});

export const updateMyProfile = apiHandler(async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  const data = { ...req.body };
  const { employee_documents, selfiePath } = buildEmployeeDocumentsFromFiles(
    req.files
  );

  if (employee_documents.length) {
    data.employee_documents = employee_documents;
  }
  if (selfiePath) {
    data.profile_image = selfiePath;
  } else if (req.files?.profile_image?.length > 0) {
    data.profile_image = req.files.profile_image[0].location;
  }

  const updatedEmployee = await EmployeeService.updateMyProfile(employeeId, data);

  return apiResponse(
    [STATUS_CODES.OK, Msg.profileUpdated],
    "Employee",
    updatedEmployee,
    res,
    "object"
  );
});

export const getMyDevices = apiHandler(async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  const devices = await EmployeeService.getMyDevices(employeeId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.devicesFetched],
    "Devices",
    devices,
    res,
    "array"
  );
});

export const getMyDevicesByClientId = apiHandler(async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  const clientId = Number(req.params.clientId);
  const devices = await EmployeeService.getMyDevicesByClientId(
    employeeId,
    clientId
  );

  return apiResponse(
    [STATUS_CODES.OK, Msg.devicesFetched],
    "Devices",
    devices,
    res,
    "object"
  );
});

export const listEmployees = apiHandler(async (req, res) => {
  const { search, status, page, limit, is_disabled } = req.query;

  const result = await EmployeeService.listEmployees({
    search,
    status,
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

export const getEmployee = apiHandler(async (req, res) => {
  const employeeId = Number(req.params.id);

  const employee = await EmployeeService.getEmployeeById(employeeId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.employeeFetched],
    "Employee",
    employee,
    res,
    "object"
  );
});

export const updateEmployee = apiHandler(async (req, res) => {
  const employeeId = Number(req.params.id);

  const employee = await EmployeeService.updateEmployee(employeeId, req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.employeeUpdated],
    "Employee",
    employee,
    res,
    "object"
  );
});

export const blockEmployee = apiHandler(async (req, res) => {
  const employeeId = Number(req.params.id);

  const employee = await EmployeeService.blockEmployee(employeeId, req.body.is_disabled);

  return apiResponse(
    [STATUS_CODES.OK, Msg.employeeUpdated],
    "Employee",
    employee,
    res,
    "object"
  );
});

export const deleteEmployee = apiHandler(async (req, res) => {
  const employeeId = Number(req.params.id);

  const result = await EmployeeService.deleteEmployee(employeeId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.employeeDeleted],
    "Employee",
    result,
    res,
    "object"
  );
});

export const getEmployeeDevices = apiHandler(async (req, res) => {
  const employeeId = Number(req.params.id);

  const devices = await EmployeeService.getEmployeeDevices(employeeId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.devicesFetched],
    "Devices",
    devices,
    res,
    "array"
  );
});

export const listServiceRequests = apiHandler(async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  const { status, search, page, limit } = req.query;

  const result = await EmployeeService.listServiceRequests(employeeId, {
    status,
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
  const employeeId = req.user.employee_id;
  if (!employeeId) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  const requestId = Number(req.params.id);
  const result = await EmployeeService.getServiceRequestById(employeeId, requestId);

  return apiResponse(
    [STATUS_CODES.OK, "Service request fetched successfully"],
    "ServiceRequest",
    result,
    res,
    "object"
  );
});

export const recordVisit = apiHandler(async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  const payload = req.body || {};

  if (req.files?.video_proof?.length > 0) {
    payload.video_proof = req.files.video_proof[0].filename;
  }

  const result = await EmployeeService.recordVisit(employeeId, payload);

  return apiResponse(
    [STATUS_CODES.CREATED, "Visit recorded successfully"],
    "EmployeeVisit",
    result,
    res,
    "object"
  );
});

export const markServiceRequestAsCompleted = apiHandler(async (req, res) => {
  const employee_id = req.user.employee_id;
  if (!employee_id) {
    throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Employee token is required"]);
  }

  const requestId = Number(req.params.id);
  const resolved_description = req.body.resolved_description;
  let resolved_video_proof = null;
  if (req.files?.resolved_video_proof?.length > 0) {
    resolved_video_proof = req.files.resolved_video_proof[0].filename;
  }
  const result = await EmployeeService.markServiceRequestAsCompleted(
    employee_id,
    requestId,
    resolved_description,
    resolved_video_proof
  );

  return apiResponse(
    [STATUS_CODES.OK, "Service request marked as completed"],
    "ServiceRequest",
    result,
    res,
    "object"
  );
});

export const getAllClients = apiHandler(async (req, res) => {
  const employeeId = req.user.employee_id;
  if (!employeeId) {
    throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
  }

  const clients = await EmployeeService.getAllClients(employeeId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.clientsFetched],
    "Clients",
    clients,
    res,
    "array"
  );
});
