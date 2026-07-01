import { withTransaction } from "../../utils/withTransaction.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as UserModel from "./user.model.js";
import * as AuthModel from "../auth/auth.model.js";
import * as SystemModel from "../system/system.model.js";
import { buildPublicFileUrl, mapDocumentsWithUrl } from "../../utils/file-url.util.js";
import { deleteFileFromS3 } from "../../utils/aws.util.js";
import { comparePassword, hashPassword } from "../../utils/password.utils.js";

const normalizeNullableString = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};

const normalizePaymentType = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const normalizeNullableInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeNullableNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const PERSONAL_DETAIL_FIELDS = [
  "full_name",
  "email",
  "country_code",
  "phone_number",
  "company_name",
  "company_address",
  "gst_number",
  "it_person_name",
  "it_person_contact_number",
  "administration_contact_name",
  "administration_contact_number",
  "total_computers",
  "total_laptops",
  "total_servers",
  "total_gsm_gateways",
];

const KYC_REQUIRED_TYPES = [
  "aadhar_card",
  "pan_card",
  "office_rent_agreement",
  "gst_certificate",
  "gumasta",
  "security_cheque",
  "verification_video",
  "selfie",
];

const isValuePresent = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
};

const isPersonalDetailsComplete = (client) =>
  PERSONAL_DETAIL_FIELDS.every((field) => isValuePresent(client?.[field]));

const isKycComplete = (documents = []) => {
  const types = new Set(
    documents
      .map((doc) => (doc?.doc_type ? String(doc.doc_type).toLowerCase() : ""))
      .filter(Boolean)
  );
  return KYC_REQUIRED_TYPES.every((type) => types.has(type));
};

export const getMyProfile = async (clientId) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const documents = await UserModel.listClientKycDocumentsByClientId(
      conn,
      clientId
    );
    const documentsWithUrl = mapDocumentsWithUrl(documents);

    let agreementData = {};
    const [[agreement]] = await conn.query(
      `
      SELECT agreement_id, agreement_unique_id, status, agreement_start_date, agreement_end_date, billing_cycle_day, rent_amount, payment_type
      FROM agreements
      WHERE client_id = ?
      ORDER BY
        FIELD(LOWER(status), 'active', 'scheduled', 'expired', 'terminated'),
        agreement_start_date DESC,
        agreement_id DESC
      LIMIT 1
      `,
      [clientId]
    );

    if (agreement) {
      agreementData = {
        agreement_id: agreement.agreement_id,
        agreement_unique_id: agreement.agreement_unique_id,
        agreement_status: agreement.status,
        agreement_start_date: agreement.agreement_start_date,
        agreement_end_date: agreement.agreement_end_date,
        billing_cycle_day: agreement.billing_cycle_day,
        rent_amount: agreement.rent_amount,
        payment_type: agreement.payment_type,
      };
    }

    return {
      ...client,
      ...agreementData,
      profile_image: buildPublicFileUrl(client?.profile_image),
      documents: documentsWithUrl,
    };
  });
};

export const updateMyProfile = async (clientId, payload) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const updateData = {};

    if (payload.email !== undefined) {
      const email = normalizeNullableString(payload.email);
      if (email !== null && email !== client.email) {
        const existing = await AuthModel.getClientByEmail(conn, email);
        if (existing && existing.id !== clientId) {
          throw new ApiError([STATUS_CODES.BAD_REQUEST, Msg.emailAlreadyExists]);
        }
      }
      updateData.email = email;
    }

    if (payload.u_unique_id !== undefined) {
      const uniqueId = normalizeNullableString(payload.u_unique_id);
      if (uniqueId !== null && uniqueId !== client.u_unique_id) {
        const existing = await UserModel.getClientByUniqueIdTx(conn, uniqueId);
        if (existing && existing.id !== clientId) {
          throw new ApiError([STATUS_CODES.BAD_REQUEST, "Unique id already exists"]);
        }
      }
      updateData.u_unique_id = uniqueId;
    }

    if (payload.full_name !== undefined) {
      updateData.full_name = normalizeNullableString(payload.full_name);
    }

    if (payload.country_code !== undefined || payload.mobile_country_code !== undefined) {
      updateData.country_code = normalizeNullableString(
        payload.country_code || payload.mobile_country_code
      );
    }

    if (payload.mobile_no !== undefined || payload.phone_number !== undefined) {
      const phoneNumber = normalizeNullableString(
        payload.mobile_no || payload.phone_number
      );
      if (phoneNumber !== null && phoneNumber !== client.phone_number) {
        const phoneExists = await UserModel.getClientByPhoneNumberTx(
          conn,
          phoneNumber,
          clientId
        );
        if (phoneExists) {
          throw new ApiError([
            STATUS_CODES.BAD_REQUEST,
            "Mobile number already registered",
          ]);
        }
      }
      updateData.phone_number = phoneNumber;
    }

    if (payload.company_name !== undefined) {
      updateData.company_name = normalizeNullableString(payload.company_name);
    }
    if (payload.company_address !== undefined) {
      updateData.company_address = normalizeNullableString(payload.company_address);
    }
    if (payload.gst_number !== undefined || payload.gst_no !== undefined) {
      updateData.gst_number = normalizeNullableString(
        (payload.gst_number || payload.gst_no || "").toUpperCase()
      );
    }
    if (payload.it_person_name !== undefined) {
      updateData.it_person_name = normalizeNullableString(payload.it_person_name);
    }
    if (payload.it_person_contact_number !== undefined || payload.it_person_contact !== undefined) {
      updateData.it_person_contact_number = normalizeNullableString(
        payload.it_person_contact_number || payload.it_person_contact
      );
    }
    if (payload.administration_contact_name !== undefined) {
      updateData.administration_contact_name = normalizeNullableString(
        payload.administration_contact_name
      );
    }
    if (payload.administration_contact_number !== undefined) {
      updateData.administration_contact_number = normalizeNullableString(
        payload.administration_contact_number
      );
    }
    if (payload.total_computers !== undefined) {
      updateData.total_computers = normalizeNullableInt(payload.total_computers);
    }
    if (payload.total_laptops !== undefined) {
      updateData.total_laptops = normalizeNullableInt(payload.total_laptops);
    }
    if (payload.total_servers !== undefined) {
      updateData.total_servers = normalizeNullableInt(payload.total_servers);
    }
    if (payload.total_gsm_gateways !== undefined) {
      updateData.total_gsm_gateways = normalizeNullableInt(payload.total_gsm_gateways);
    }

    if (payload.status !== undefined) {
      updateData.status = payload.status;
    }
    if (payload.dob !== undefined) {
      updateData.dob = payload.dob;
    }
    if (payload.country !== undefined) {
      updateData.country = payload.country;
    }
    if (payload.fcm_token !== undefined) {
      updateData.fcm_token = payload.fcm_token;
    }

    if (payload.profile_image) {
      updateData.profile_image = payload.profile_image;
    }

    if (Object.keys(updateData).length) {
      await UserModel.updateClientDynamic(conn, clientId, updateData);
    }

    if (Object.keys(updateData).length === 0) {
      return client;
    }

    const updatedClient = await UserModel.getClientByIdTx(conn, clientId);

    if (isPersonalDetailsComplete(updatedClient) && (updatedClient.kyc_step ?? 0) < 1) {
      await UserModel.updateClientDynamic(conn, clientId, { kyc_step: 1 });
      updatedClient.kyc_step = 1;
    }

    return updatedClient;
  });
};
export const changePassword = async (clientId, payload) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    if (client.is_deleted) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.accountNotFound]);
    }

    if (client.is_disabled) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.accountDisabled]);
    }

    if (!client.is_verified) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, Msg.emailNotVerified]);
    }

    const isPasswordMatch = await comparePassword(
      payload.current_password,
      client.password
    );
    if (!isPasswordMatch) {
      throw new ApiError([STATUS_CODES.UNAUTHORIZED, Msg.oldPasswordNotMatch]);
    }

    const hashedPassword = await hashPassword(payload.new_password);
    await UserModel.updateClientDynamic(conn, clientId, {
      password: hashedPassword,
      show_password: payload.new_password,
      is_initial_password_changed: "True",
    });

    return { id: clientId };
  });
};

// export const getMyDevices = async (clientId, query) => {
//   return withTransaction(async (conn) => {
//     const client = await UserModel.getClientByIdTx(conn, clientId);

//     if (!client) {
//       throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
//     }

//     const result = await SystemModel.listSystems(conn, {
//       search: query.search,
//       status: query.status,
//       client_id: clientId,
//       page: query.page,
//       limit: query.limit,
//     });

//     return {
//       items: result.rows,
//       pagination: {
//         total: result.total,
//         page: result.page,
//         limit: result.limit,
//       },
//     };
//   });
// };

export const getMyDevices = async (clientId, query) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const result = await SystemModel.listSystems(conn, {
      search: query.search,
      status: query.status,
      client_id: clientId,
      page: query.page,
      limit: query.limit,
    });

    const systemIds = result.rows.map((row) => row.id);

    const assets = await SystemModel.getSystemAssetsBySystemIds(
      conn,
      systemIds
    );

    const parseMaybeJson = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "object") return value;
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch (err) {
        return null;
      }
    };

    const toValue = (value) => {
      if (value === undefined || value === null) return null;
      const str = String(value).trim();
      return str.length ? str : null;
    };

    const assetsBySystemId = new Map();

    for (const asset of assets) {
      const existing = assetsBySystemId.get(asset.system_id) || [];
      existing.push(asset);
      assetsBySystemId.set(asset.system_id, existing);
    }

    const items = result.rows.map((row) => {
      const parsed = parseMaybeJson(row.full_response);
      const systemInfoBase = (parsed?.system_info || parsed || {}) ?? {};
      const systemAssets = assetsBySystemId.get(row.id) || [];

      let deviceName = toValue(systemInfoBase?.hostname);
      let cpuModel = null;

      for (const asset of systemAssets) {
        const category = String(asset.asset_category_name || "")
          .trim()
          .toLowerCase();

        if (
          !deviceName &&
          (category === "device_name" || category === "hostname")
        ) {
          deviceName = toValue(asset.model) || toValue(asset.brand);
        }

        if (!cpuModel && (category === "cpu" || category === "processor")) {
          cpuModel = toValue(asset.model) || toValue(asset.brand);
        }
      }

      const systemInfo = {
        ...systemInfoBase,
        cpu_model: cpuModel,
      };

      return {
        id: row.id,
        system_uid: row.system_uid,
        system_uuid: row.system_uuid,
        device_type: row.device_type,
        hardware_fingerprint: row.hardware_fingerprint,
        client_id: row.client_id,
        client_unique_id: row.client_unique_id,
        client_name: row.client_name,
        installed_by_employee_id: row.installed_by_employee_id,
        employee_unique_id: row.employee_unique_id,
        employee_name: row.employee_name,
        installation_date: row.installation_date,
        status: row.status,
        is_active: row.is_active,
        approval_status: row.approval_status,
        created_at: row.created_at,
        is_block: row.is_block,
        system_info: systemInfo,
      };
    });

    return {
      items,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
    };
  });
};

export const getChatUsers = async (clientId) => {
  return withTransaction(async (conn) => {
    return await UserModel.getChatClients(conn, clientId);
  });
};

export const getUserProfileById = async (clientId) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getPublicClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    return {
      ...client,
      profile_image: buildPublicFileUrl(client?.profile_image),
    };
  });
};

export const submitKyc = async (clientId, payload) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const incomingDocsRaw = Array.isArray(payload.kyc_documents)
      ? payload.kyc_documents
      : [];
    const normalizeDocType = (value) =>
      value ? String(value).trim().toLowerCase() : "";
    const incomingSelfies = incomingDocsRaw.filter(
      (doc) => normalizeDocType(doc?.doc_type) === "selfie"
    );
    const incomingSelfie = incomingSelfies.length
      ? incomingSelfies[incomingSelfies.length - 1]
      : null;
    const incomingDocs = incomingDocsRaw.filter(
      (doc) => normalizeDocType(doc?.doc_type) !== "selfie"
    );
    if (incomingSelfie) {
      incomingDocs.push(incomingSelfie);
      const extraSelfieDocs = incomingSelfies.slice(0, -1);
      if (extraSelfieDocs.length) {
        await Promise.all(
          extraSelfieDocs
            .map((doc) => doc?.doc_path)
            .filter(Boolean)
            .map((path) => deleteFileFromS3(path))
        );
      }
    }
    const deleteKycIds = Array.isArray(payload.deleteKycIds)
      ? [...new Set(
        payload.deleteKycIds
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )]
      : [];

    let docsToDelete = [];
    let existingSelfies = [];
    if (deleteKycIds.length) {
      docsToDelete = await UserModel.getClientKycDocumentsByIds(
        conn,
        clientId,
        deleteKycIds
      );
      if (docsToDelete.length) {
        await UserModel.deleteClientKycDocumentsByIds(conn, clientId, deleteKycIds);
      }
    }
    if (incomingSelfie) {
      const currentDocs = await UserModel.listClientKycDocumentsByClientId(
        conn,
        clientId
      );
      existingSelfies = currentDocs.filter(
        (doc) => normalizeDocType(doc?.doc_type) === "selfie"
      );
      if (existingSelfies.length) {
        await UserModel.deleteClientKycDocumentsByIds(
          conn,
          clientId,
          existingSelfies.map((doc) => doc.id)
        );
      }
    }

    if (incomingDocs.length === 0) {
      const existingDocs = await UserModel.listClientKycDocumentsByClientId(
        conn,
        clientId
      );
      if (docsToDelete.length) {
        await Promise.all(
          docsToDelete.map((doc) => deleteFileFromS3(doc.doc_path))
        );
        if (
          client?.profile_image &&
          docsToDelete.some((doc) => doc?.doc_path === client.profile_image)
        ) {
          await UserModel.updateClientDynamic(conn, clientId, {
            profile_image: null,
          });
        }
      }
      if (!existingDocs.length) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "KYC documents are required"]);
      }
      return existingDocs;
    }

    const now = new Date();
    await UserModel.addClientKycDocuments(conn, clientId, incomingDocs);
    if (incomingSelfie?.doc_path) {
      await UserModel.updateClientDynamic(conn, clientId, {
        profile_image: incomingSelfie.doc_path,
      });
    }

    await UserModel.updateClientDynamic(conn, clientId, {
      kyc_status: "pending",
      kyc_submitted_at: now,
      kyc_approved_at: null,
      kyc_rejected_at: null,
      kyc_reject_reason: null,
      kyc_verified_by_admin_id: null,
    });

    const documents = await UserModel.listClientKycDocumentsByClientId(
      conn,
      clientId
    );

    if (docsToDelete.length || existingSelfies.length) {
      await Promise.all(
        [...docsToDelete, ...existingSelfies]
          .map((doc) => doc?.doc_path)
          .filter(Boolean)
          .map((path) => deleteFileFromS3(path))
      );
    }
    if (
      docsToDelete.length &&
      client?.profile_image &&
      docsToDelete.some((doc) => doc?.doc_path === client.profile_image)
    ) {
      await UserModel.updateClientDynamic(conn, clientId, {
        profile_image: null,
      });
    }

    if (isKycComplete(documents) && (client.kyc_step ?? 0) < 2) {
      await UserModel.updateClientDynamic(conn, clientId, { kyc_step: 2 });
    }

    return documents;
  });
};

export const raiseServiceRequest = async (clientId, payload = {}) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const coerceOptionalId = (value) => {
      if (value === undefined || value === null || value === "") return null;
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    };

    const request_title = normalizeNullableString(payload.request_title);
    const request_description = normalizeNullableString(payload.request_description);

    if (!request_title || !request_description) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        "request_title and request_description are required",
      ]);
    }

    const requestData = {
      client_id: clientId,
      system_id: coerceOptionalId(payload.system_id),
      employee_id: normalizeNullableInt(payload.employee_id),
      asset_category_id: coerceOptionalId(payload.asset_category_id),
      request_title,
      request_description,
      status: 0,
      mark_as_urgent: 0
    };

    const requestId = await UserModel.createClientServiceRequest(conn, requestData);
    const created = await UserModel.getClientServiceRequestById(conn, requestId);

    return created;
  });
};

export const listServiceRequests = async (clientId, query = {}) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const result = await UserModel.listClientServiceRequests(conn, {
      clientId,
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

export const getServiceRequestById = async (clientId, requestId) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const request = await UserModel.getClientServiceRequestById(conn, requestId);
    if (!request) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Service request not found"]);
    }

    if (Number(request.client_id) !== Number(clientId)) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
    }

    return request;
  });
};

export const markServiceRequestAsCompleted = async (clientId, requestId) => {
  return withTransaction(async (conn) => {
    const client = await UserModel.getClientByIdTx(conn, clientId);

    if (!client) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, Msg.userNotFound]);
    }

    const request = await UserModel.getServiceRequestByIdForUpdate(conn, requestId);
    if (!request) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Service request not found"]);
    }

    if (Number(request.client_id) !== Number(clientId)) {
      throw new ApiError([STATUS_CODES.FORBIDDEN, "Forbidden"]);
    }

    const status = Number(request.status);
    if (status === 4) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Service request already completed"]);
    }
    if (status !== 1) {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Service request is not in progress"]);
    }

    await UserModel.updateServiceRequestDynamic(conn, requestId, {
      status: 4,
      resolved_description: "Resolved by client",
      employee_resolved_at: new Date(),
    });

    return await UserModel.getClientServiceRequestById(conn, requestId);
  });
};
