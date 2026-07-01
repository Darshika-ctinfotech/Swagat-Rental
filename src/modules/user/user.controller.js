import { ApiError, apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import Msg from "../../utils/messages.util.js";
import * as UserService from "./user.service.js";
import * as PaymentService from "../payment/payment.service.js";
import * as InvoiceService from "../invoice/invoice.service.js";
import * as AgreementService from "../agreement/agreement.service.js";
import { mapDocumentsWithUrl } from "../../utils/file-url.util.js";

const KYC_DOC_FIELDS = [
  "aadhaar_card",
  "pan_card",
  "office_rent_agreement",
  "gst_certificate",
  "gumasta",
  "security_cheque",
  "verification_video",
  "selfie",
];

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

  return [
    ...new Set(
      input
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
};

export const getMyProfile = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;

  const profile = await UserService.getMyProfile(clientId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.profileFetched],
    "Client",
    profile,
    res,
    "object",
  );
});

export const updateMyProfile = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;
  const data = req.body;

  const kyc_documents = [];
  for (const field of KYC_DOC_FIELDS) {
    const fieldFiles = Array.isArray(req.files?.[field]) ? req.files[field] : [];
    for (const file of fieldFiles) {
      const docPath = file?.key || file?.location;
      if (!docPath) continue;
      kyc_documents.push({
        doc_type: field,
        doc_path: docPath,
      });
    }
  }
  const deleteKycIds = normalizeIdArrayInput(req.body?.deleteKycIds);

  if (kyc_documents.length > 0 || deleteKycIds.length > 0) {
    await UserService.submitKyc(clientId, { kyc_documents, deleteKycIds });
  }

  if (req.files?.profile_image?.length > 0) {
    data.profile_image = req.files.profile_image[0].location;
  }

  delete data.deleteKycIds;

  await UserService.updateMyProfile(clientId, data);
  const updatedProfile = await UserService.getMyProfile(clientId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.profileUpdated],
    "Client",
    updatedProfile,
    res,
    "object",
  );
});
// export const updateMyProfile = apiHandler(async (req, res) => {
//   const clientId = req.user.user_id;

//   const data = { ...req.body };

//   // Prevent updating restricted fields
//   delete data.full_name;
//   delete data.company_name;

//   const kyc_documents = [];

//   for (const field of KYC_DOC_FIELDS) {
//     const fieldFiles = Array.isArray(req.files?.[field]) ? req.files[field] : [];

//     for (const file of fieldFiles) {
//       const docPath = file?.key || file?.location;
//       if (!docPath) continue;

//       kyc_documents.push({
//         doc_type: field,
//         doc_path: docPath,
//       });
//     }
//   }

//   // Rest of your update logic...
// });


export const changePassword = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;
  const result = await UserService.changePassword(clientId, req.body);

  return apiResponse(
    [STATUS_CODES.OK, Msg.passwordChanged],
    "Client",
    result,
    res,
    "object"
  );
});

export const getMyDevices = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;
  const { search, status, page, limit } = req.query;

  const result = await UserService.getMyDevices(clientId, {
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

export const getChatUsers = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;

  const clients = await UserService.getChatUsers(clientId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.usersFetched],
    "Clients",
    clients,
    res,
    "array"
  );
});

export const getUserProfile = apiHandler(async (req, res) => {
  const clientId = Number(req.params.id);

  const client = await UserService.getUserProfileById(clientId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.profileFetched],
    "Client",
    client,
    res,
    "object"
  );
});


export const submitKyc = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;

  const kyc_documents = [];
  for (const field of KYC_DOC_FIELDS) {
    const fieldFiles = Array.isArray(req.files?.[field]) ? req.files[field] : [];
    for (const file of fieldFiles) {
      const docPath = file?.key || file?.location;
      if (!docPath) continue;
      kyc_documents.push({
        doc_type: field,
        doc_path: docPath,
      });
    }
  }

  const deleteKycIds = normalizeIdArrayInput(req.body?.deleteKycIds);
  const kyc = await UserService.submitKyc(clientId, {
    kyc_documents,
    deleteKycIds,
  });
  const kycWithUrl = mapDocumentsWithUrl(kyc);

  return apiResponse(
    [STATUS_CODES.OK, Msg.kycSubmitted],
    "KYC",
    kycWithUrl,
    res,
    "array"
  );
});

export const raiseServiceRequest = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;
  if (!clientId) {
    throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Client token is required"]);
  }
  const payload = req.body || {};

  const result = await UserService.raiseServiceRequest(clientId, payload);

  return apiResponse(
    [STATUS_CODES.CREATED, "Service request created successfully"],
    "ServiceRequest",
    result,
    res,
    "object"
  );
});

export const listServiceRequests = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;
  if (!clientId) {
    throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Client token is required"]);
  }

  const { status, search, page, limit } = req.query;

  const result = await UserService.listServiceRequests(clientId, {
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
  const clientId = req.user.user_id;
  if (!clientId) {
    throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Client token is required"]);
  }

  const requestId = Number(req.params.id);
  const result = await UserService.getServiceRequestById(clientId, requestId);

  return apiResponse(
    [STATUS_CODES.OK, "Service request fetched successfully"],
    "ServiceRequest",
    result,
    res,
    "object"
  );
});

export const markServiceRequestAsCompleted = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;
  if (!clientId) {
    throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Client token is required"]);
  }

  const requestId = Number(req.params.id);
  const result = await UserService.markServiceRequestAsCompleted(clientId, requestId);

  return apiResponse(
    [STATUS_CODES.OK, "Service request marked as completed"],
    "ServiceRequest",
    result,
    res,
    "object"
  );
});

export const createPayment = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;

  const payload = {
    ...req.body,
    screenshot: req.file?.location || req.file?.path || null,
  };

  const result = await PaymentService.createPayment(clientId, payload);

  return apiResponse(
    [STATUS_CODES.CREATED, "Payment submitted successfully"],
    "Payment",
    result,
    res,
    "object"
  );
});

export const listMyPayments = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;
  
  if (!clientId) {
    throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Client token is required"]);
  }

  const { page, limit } = req.query;

  const result = await PaymentService.listMyPayments({
    clientId,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "My payments fetched successfully"],
    "Payments",
    result,
    res,
    "object"
  );
});

export const listMyInvoices = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;

  if (!clientId) {
    throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Client token is required"]);
  }

  const { page, limit } = req.query;

  const result = await InvoiceService.listInvoices({
    client_id: clientId,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "My invoices fetched successfully"],
    "Invoices",
    result,
    res,
    "object"
  );
});

export const listMyAgreements = apiHandler(async (req, res) => {
  const clientId = req.user.user_id;

  if (!clientId) {
    throw new ApiError([STATUS_CODES.UNAUTHORIZED, "Client token is required"]);
  }

  const { page, limit } = req.query;

  const result = await AgreementService.listAgreements({
    client_id: clientId,
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "My agreements fetched successfully"],
    "Agreements",
    result,
    res,
    "object"
  );
})
