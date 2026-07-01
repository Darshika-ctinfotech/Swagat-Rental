import STATUS_CODES from "../../constants/statusCodes.js";
import { apiHandler, apiResponse } from "../../utils/api.util.js";
import * as EmployeeFeedbackService from "./employeeFeedback.service.js";

export const createEmployeeFeedback = apiHandler(async (req, res) => {
  const feedback = await EmployeeFeedbackService.createEmployeeFeedback(
    req.body
  );

  return apiResponse(
    [STATUS_CODES.CREATED, "Employee feedback submitted successfully"],
    "Employee feedback",
    feedback,
    res,
    "object"
  );
});

export const listEmployeeFeedback = apiHandler(async (req, res) => {
  const { search, page, limit } = req.query;

  const result = await EmployeeFeedbackService.listEmployeeFeedback({
    search: search || "",
    page: Number(page) || 1,
    limit: Number(limit) || 20,
  });

  return apiResponse(
    [STATUS_CODES.OK, "Employee feedback fetched successfully"],
    "Employee feedback",
    result,
    res,
    "object"
  );
});

export const getEmployeeFeedback = apiHandler(async (req, res) => {
  const feedback = await EmployeeFeedbackService.getEmployeeFeedbackById(
    Number(req.params.id)
  );

  return apiResponse(
    [STATUS_CODES.OK, "Employee feedback fetched successfully"],
    "Employee feedback",
    feedback,
    res,
    "object"
  );
});

export const deleteEmployeeFeedback = apiHandler(async (req, res) => {
  const result = await EmployeeFeedbackService.deleteEmployeeFeedback(
    Number(req.params.id)
  );

  return apiResponse(
    [STATUS_CODES.OK, "Employee feedback deleted successfully"],
    "Employee feedback",
    result,
    res,
    "object"
  );
});
