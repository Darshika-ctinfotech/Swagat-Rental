import STATUS_CODES from "../../constants/statusCodes.js";
import { apiHandler, apiResponse } from "../../utils/api.util.js";
import * as ClientFeedbackService from "./clientFeedback.service.js";

export const createClientFeedback = apiHandler(async (req, res) => {
  const feedback = await ClientFeedbackService.createClientFeedback(req.body);
  console.log(req.body);
  return apiResponse(
    [STATUS_CODES.CREATED, "Client feedback submitted successfully"],
    "Client feedback",
    feedback,
    res,
    "object"
  );
});

export const listClientFeedback = apiHandler(async (req, res) => {
  const { search, page, limit } = req.query;

  const result = await ClientFeedbackService.listClientFeedback({
    search: search || "",
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "Client feedback fetched successfully"],
    "Client feedback",
    result,
    res,
    "object"
  );
});

export const getClientFeedback = apiHandler(async (req, res) => {
  const feedback = await ClientFeedbackService.getClientFeedbackById(
    Number(req.params.id)
  );

  return apiResponse(
    [STATUS_CODES.OK, "Client feedback fetched successfully"],
    "Client feedback",
    feedback,
    res,
    "object"
  );
});

export const deleteClientFeedback = apiHandler(async (req, res) => {
  const result = await ClientFeedbackService.deleteClientFeedback(
    Number(req.params.id)
  );

  return apiResponse(
    [STATUS_CODES.OK, "Client feedback deleted successfully"],
    "Client feedback",
    result,
    res,
    "object"
  );
});
