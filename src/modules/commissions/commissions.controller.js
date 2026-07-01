import STATUS_CODES from "../../constants/statusCodes.js";
import { apiHandler, apiResponse } from "../../utils/api.util.js";
import * as CommissionsService from "./commissions.service.js";

export const createCommission = apiHandler(async (req, res) => {
  const commission = await CommissionsService.createCommission(req.body);

  return apiResponse(
    [STATUS_CODES.CREATED, "Commission created successfully"],
    "Commission",
    commission,
    res,
    "object"
  );
});

export const listCommissions = apiHandler(async (req, res) => {
  const result = await CommissionsService.listCommissions(req.query);

  return apiResponse(
    [STATUS_CODES.OK, "Commissions fetched successfully"],
    "Commissions",
    result,
    res,
    "object"
  );
});

export const getCommission = apiHandler(async (req, res) => {
  const commission = await CommissionsService.getCommissionById(
    Number(req.params.id)
  );

  return apiResponse(
    [STATUS_CODES.OK, "Commission fetched successfully"],
    "Commission",
    commission,
    res,
    "object"
  );
});

export const updateCommission = apiHandler(async (req, res) => {
  const commission = await CommissionsService.updateCommission(
    Number(req.params.id),
    req.body
  );

  return apiResponse(
    [STATUS_CODES.OK, "Commission updated successfully"],
    "Commission",
    commission,
    res,
    "object"
  );
});

export const updateCommissionStatus = apiHandler(async (req, res) => {
  const commission = await CommissionsService.updateCommissionStatus(
    Number(req.params.id),
    req.body
  );

  return apiResponse(
    [STATUS_CODES.OK, "Commission status updated successfully"],
    "Commission",
    commission,
    res,
    "object"
  );
});

export const markCommissionPaid = apiHandler(async (req, res) => {
  const commission = await CommissionsService.markCommissionPaid(
    Number(req.params.id),
    req.body
  );
await sendMail({
    to: client.email,
    subject: "Payment Received",
    html: `
       Hello ${client.full_name},
       <br><br>
       Payment received successfully.
       Thank you.
    `
});
  return apiResponse(
    [STATUS_CODES.OK, "Commission marked as paid successfully"],
    "Commission",
    commission,
    res,
    "object"
  );
});

export const deleteCommission = apiHandler(async (req, res) => {
  const result = await CommissionsService.deleteCommission(Number(req.params.id));

  return apiResponse(
    [STATUS_CODES.OK, "Commission deleted successfully"],
    "Commission",
    result,
    res,
    "object"
  );
});

export const getCommissionSummary = apiHandler(async (req, res) => {
  const summary = await CommissionsService.getCommissionSummary(req.query);

  return apiResponse(
    [STATUS_CODES.OK, "Commission summary fetched successfully"],
    "Commission summary",
    summary,
    res,
    "object"
  );
});
