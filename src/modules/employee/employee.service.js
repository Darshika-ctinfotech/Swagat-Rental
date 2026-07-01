import { withTransaction } from "../../utils/withTransaction.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as EmployeeModel from "./employee.model.js";
import * as SystemModel from "../system/system.model.js";
import * as UserModel from "../user/user.model.js";
import { comparePassword, hashPassword } from "../../utils/password.utils.js";
import {
  buildPublicFileUrl,
  buildPublicUploadUrl,
  mapDocumentsWithUrl,
} from "../../utils/file-url.util.js";

const normalizeBoolean = (value) => {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
};

const normalizeNullableString = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};

const normalizeNullableInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const changePassword = async (employeeId, payload) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeePasswordByIdTx(
      conn,
      employeeId
    );

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    if (employee.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (employee.is_disabled) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.accountDisabled]);
    }

    if (!employee.is_verified) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.emailNotVerified]);
    }

    const isPasswordMatch = await comparePassword(
      payload.current_password,
      employee.password
    );
    if (!isPasswordMatch) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.oldPasswordNotMatch]);
    }

    const hashedPassword = await hashPassword(payload.new_password);
    await EmployeeModel.changePassword(
      conn,
      employeeId,
      hashedPassword,
      payload.new_password
    );

    return { id: employeeId };
  });
};

export const createEmployee = async (payload) => {
  return withTransaction(async (conn) => {
    const emailExists = await EmployeeModel.getEmployeeByEmail(conn, payload.email);
    if (emailExists) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyExists]);
    }

    const hashedPassword = payload.password
      ? await hashPassword(payload.password)
      : null;

    const employeeData = {
      e_unique_id: payload.e_unique_id,
      full_name: payload.full_name?.trim(),
      email: payload.email,
      password: hashedPassword,
      show_password: payload.password || null,
      profile_image: payload.profile_image || null,
      country_code: payload.country_code || null,
      phone_number: payload.phone_number || null,
      fcm_token: payload.fcm_token || null,
      status: payload.status || "active",
      role: payload.role || "employee",
      date_of_birth: payload.date_of_birth || null,
      gender: payload.gender || null,
      current_address: payload.current_address || null,
      permanent_address: payload.permanent_address || null,
      designation: payload.designation || null,
      employment_from: payload.employment_from || null,
      employment_to: payload.employment_to || null,
      ctc_breakdown: payload.ctc_breakdown || null,
      bank_name: payload.bank_name || null,
      ifsc_code: payload.ifsc_code || null,
      bank_account_number: payload.bank_account_number || null,
      email_otp: payload.email_otp || null,
      is_verified: 1,
      is_disabled: 0,
    };

    const employeeId = await EmployeeModel.createEmployee(conn, employeeData);

    return await EmployeeModel.getEmployeeByIdTx(conn, employeeId);
  });
};

export const getMyProfile = async (employeeId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }
    const documents = await EmployeeModel.listEmployeeDocumentsByEmployeeId(
      conn,
      employeeId
    );

    return {
      ...employee,
      profile_image: buildPublicFileUrl(employee?.profile_image),
      documents: mapDocumentsWithUrl(documents).map(({ doc_path, ...rest }) => rest),
    };
  });
};

export const updateMyProfile = async (employeeId, payload) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    const allowedFields = [
      "full_name",
      "country_code",
      "phone_number",
      "status",
      "fcm_token",
    ];

    const updateData = {};

    for (const field of allowedFields) {
      if (payload[field] !== undefined) {
        updateData[field] = payload[field];
      }
    }

    if (payload.profile_image) {
      updateData.profile_image = payload.profile_image;
    }

    if (
      Array.isArray(payload.employee_documents) &&
      payload.employee_documents.length
    ) {
      updateData.document_status = "pending";
      updateData.document_updated_by_admin = 0;
    }

    if (Object.keys(updateData).length) {
      await EmployeeModel.updateEmployeeDynamic(conn, employeeId, updateData);
    }

    if (
      Array.isArray(payload.employee_documents) &&
      payload.employee_documents.length
    ) {
      await EmployeeModel.addEmployeeDocuments(
        conn,
        employeeId,
        payload.employee_documents
      );
    }

    return await EmployeeModel.getEmployeeByIdTx(conn, employeeId);
  });
};

export const getMyDevices = async (employeeId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    return await SystemModel.getSystemsByEmployeeId(conn, employeeId);
  });
};

export const getMyDevicesByClientId = async (employeeId, clientId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    const client = await UserModel.getPublicClientByIdTx(conn, clientId);
    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const systems = await SystemModel.getSystemsByEmployeeAndClientId(
      conn,
      employeeId,
      clientId
    );

    return {
      client: {
        ...client,
        no_of_systems: systems.length,
      },
      systems,
    };
  });
};

export const listEmployees = async (query) => {
  return withTransaction(async (conn) => {
    const result = await EmployeeModel.listEmployees(conn, query);
    return {
      items: result.rows.map((employee) => ({
        ...employee,
        profile_image: buildPublicFileUrl(employee?.profile_image),
      })),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const getEmployeeById = async (employeeId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    return {
      ...employee,
      profile_image: buildPublicFileUrl(employee?.profile_image),
    };
  });
};

export const updateEmployee = async (employeeId, payload) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    if (payload.email && payload.email !== employee.email) {
      const existing = await EmployeeModel.getEmployeeByEmail(conn, payload.email);
      if (existing && existing.id !== employeeId) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyExists]);
      }
    }

    const updateData = {};

    if (payload.full_name !== undefined) {
      updateData.full_name = payload.full_name?.trim();
    }
    if (payload.email !== undefined) updateData.email = payload.email;
    if (payload.password) {
      updateData.password = await hashPassword(payload.password);
      updateData.show_password = payload.password;
    }
    if (payload.profile_image !== undefined) updateData.profile_image = payload.profile_image;
    if (payload.country_code !== undefined) updateData.country_code = payload.country_code;
    if (payload.phone_number !== undefined) updateData.phone_number = payload.phone_number;
    if (payload.fcm_token !== undefined) updateData.fcm_token = payload.fcm_token;
    if (payload.status !== undefined) updateData.status = payload.status;
    if (payload.role !== undefined) updateData.role = payload.role;
    if (payload.date_of_birth !== undefined) {
      updateData.date_of_birth = payload.date_of_birth;
    }
    if (payload.gender !== undefined) updateData.gender = payload.gender;
    if (payload.current_address !== undefined) {
      updateData.current_address = payload.current_address;
    }
    if (payload.permanent_address !== undefined) {
      updateData.permanent_address = payload.permanent_address;
    }
    if (payload.designation !== undefined) updateData.designation = payload.designation;
    if (payload.employment_from !== undefined) {
      updateData.employment_from = payload.employment_from;
    }
    if (payload.employment_to !== undefined) {
      updateData.employment_to = payload.employment_to;
    }
    if (payload.ctc_breakdown !== undefined) {
      updateData.ctc_breakdown = payload.ctc_breakdown;
    }
    if (payload.bank_name !== undefined) updateData.bank_name = payload.bank_name;
    if (payload.ifsc_code !== undefined) updateData.ifsc_code = payload.ifsc_code;
    if (payload.bank_account_number !== undefined) {
      updateData.bank_account_number = payload.bank_account_number;
    }
    if (payload.is_disabled !== undefined) {
      const disabledValue = normalizeBoolean(payload.is_disabled);
      if (disabledValue !== undefined) {
        updateData.is_disabled = disabledValue ? 1 : 0;
      }
    }

    await EmployeeModel.updateEmployeeDynamic(conn, employeeId, updateData);

    return await EmployeeModel.getEmployeeByIdTx(conn, employeeId);
  });
};

export const blockEmployee = async (employeeId, isDisabled) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    const disabledValue = normalizeBoolean(isDisabled);
    if (disabledValue === undefined) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid disabled flag"]);
    }

    await EmployeeModel.updateEmployeeDynamic(conn, employeeId, {
      is_disabled: disabledValue ? 1 : 0,
    });

    return await EmployeeModel.getEmployeeByIdTx(conn, employeeId);
  });
};

export const deleteEmployee = async (employeeId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    await EmployeeModel.updateEmployeeDynamic(conn, employeeId, {
      is_deleted: 1,
    });

    return { id: employeeId };
  });
};

export const getEmployeeDevices = async (employeeId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    return await SystemModel.getSystemsByEmployeeId(conn, employeeId);
  });
};

export const listServiceRequests = async (employeeId, query = {}) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    const result = await UserModel.listServiceRequestsForEmployee(conn, {
      employee_id: employeeId,
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    return {
      items: result.rows,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const getServiceRequestById = async (employeeId, requestId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    const request = await UserModel.getClientServiceRequestById(conn, requestId);
    if (!request) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Service request not found"]);
    }

    if (Number(request.employee_id) !== Number(employeeId)) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
    }

    return request;
  });
};

export const recordVisit = async (employeeId, payload = {}) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    const clientId = normalizeNullableInt(payload.client_id);
    if (!clientId) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "client_id is required"]);
    }

    const client = await UserModel.getPublicClientByIdTx(conn, clientId);
    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const shortDescription = normalizeNullableString(payload.short_description);
    const videoProof = normalizeNullableString(payload.video_proof);
    const visitedAtRaw = normalizeNullableString(payload.visited_at);
    const visitedAt = visitedAtRaw || new Date();

    if (!videoProof) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "video_proof is required"]);
    }
    const recordId = await EmployeeModel.createEmployeeVisitRecord(conn, {
      employee_id: employeeId,
      client_id: clientId,
      short_description: shortDescription,
      video_proof: videoProof,
      visited_at: visitedAt,
    });

    const record = await EmployeeModel.getEmployeeVisitRecordById(conn, recordId);
    return {
      ...record,
      video_proof: buildPublicUploadUrl("employee-visits", record?.video_proof),
    };
  });
};

export const markServiceRequestAsCompleted = async (
  EmployeeID,
  requestId,
  resolved_description,
  resolved_video_proof
) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, EmployeeID);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const request = await UserModel.getServiceRequestByIdForUpdate(conn, requestId);
    if (!request) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Service request not found"]);
    }

    if (Number(request.employee_id) !== Number(EmployeeID)) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
    }

    const status = Number(request.status);
    if (status === 4) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Service request already completed"]);
    }
    if (status !== 1) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Service request is not assigned"]);
    }

    const updateData = {
      status: 4,
      resolved_description,
      employee_resolved_at: new Date(),
    };
    if (resolved_video_proof) {
      updateData.resolved_video_proof = resolved_video_proof;
    }

    await UserModel.updateServiceRequestDynamic(conn, requestId, updateData);

    return await UserModel.getClientServiceRequestById(conn, requestId);
  });
};

export const getAllClients = async (employeeId) => {
  return withTransaction(async (conn) => {
    const employee = await EmployeeModel.getEmployeeByIdTx(conn, employeeId);

    if (!employee) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.employeeNotFound]);
    }

    return await UserModel.listClientsForEmployee(conn);
  });
};
