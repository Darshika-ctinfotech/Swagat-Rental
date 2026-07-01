import { ApiError, apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import ROLES from "../../constants/roles.js";
import * as PaymentService from "./payment.service.js";

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

export const getPaymentDashboard = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const result = await PaymentService.getDashboard();

  return apiResponse(
    [STATUS_CODES.OK, "Dashboard fetched"],
    "Dashboard",
    result,
    res,
    "object"
  );
});

export const getPaymentAnalyticsLast12Months = apiHandler(async (req, res) => {
  assertAdminOrSubAdmin(req);

  const result = await PaymentService.getPaymentAnalyticsLast12Months();

  return apiResponse(
    [STATUS_CODES.OK, "Payment analytics fetched"],
    "Analytics",
    result,
    res,
    "object"
  );
});
