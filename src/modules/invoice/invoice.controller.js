import { ApiError, apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import ROLES from "../../constants/roles.js";
import * as InvoiceService from "./invoice.service.js";

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

export const listInvoices = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const { search, status, client_id, page, limit } = req.query;

    const result = await InvoiceService.listInvoices({
        search,
        status,
        client_id,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
    });

    return apiResponse(
        [STATUS_CODES.OK, "Invoices fetched successfully"],
        "Invoices",
        result,
        res,
        "object"
    );
});

export const getInvoiceDetails = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const invoiceId = parseInt(req.params.invoice_id, 10);

    const data = await InvoiceService.getInvoiceDetails(invoiceId);

    return apiResponse(
        [STATUS_CODES.OK, "Invoice details fetched"],
        "Invoice",
        data,
        res,
        "object"
    );
});

export const createInvoiceManually = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const result = await InvoiceService.createInvoice(req.body, req.user);

    return apiResponse(
        [STATUS_CODES.CREATED, "Invoice created"],
        "Invoice",
        result,
        res,
        "object"
    );
});

export const getInvoiceManualCreateOptions = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const buyerTypeRaw = String(req.query?.buyer_type || "client").toLowerCase();
    const buyer_type = buyerTypeRaw === "walk_in" ? "walk_in" : "client";

    const result = await InvoiceService.getManualInvoiceCreateOptions({
        buyer_type,
        search: req.query?.search,
        limit: req.query?.limit,
    });

    return apiResponse(
        [STATUS_CODES.OK, "Invoice options fetched"],
        "Options",
        result,
        res,
        "object"
    );
});

export const getInvoiceLogs = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const invoiceId = parseInt(req.params.invoice_id, 10);

    const logs = await InvoiceService.getInvoiceLogs(invoiceId);

    return apiResponse(
        [STATUS_CODES.OK, "Invoice logs fetched"],
        "Logs",
        logs,
        res,
        "object"
    );
});

export const setInvoiceUrgency = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const invoiceId = parseInt(req.params.invoice_id, 10);
  if (isNaN(invoiceId)) {
    throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid invoice_id"]);
  }

  const isUrgent = Number(req.body?.is_urgent);
  if (![0, 1].includes(isUrgent)) {
    throw new ApiError([
      STATUS_CODES.BAD_REQUEST,
      "is_urgent must be 0 or 1",
    ]);
  }

  const result = await InvoiceService.setInvoiceUrgency(
    invoiceId,
    isUrgent,
    req.user
  );

  return apiResponse(
    [STATUS_CODES.OK, "Invoice urgency updated"],
    "Invoice",
    result,
    res,
    "object"
  );
});
