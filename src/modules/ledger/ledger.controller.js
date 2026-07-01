import { ApiError, apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import ROLES from "../../constants/roles.js";
import * as LedgerService from "./ledger.service.js";

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

export const getClientLedger = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const clientId = parseInt(req.params.client_id, 10);

    if (isNaN(clientId)) {
        throw new Error("Invalid client_id");
    }

    const result = await LedgerService.getClientLedger(clientId);

    return apiResponse(
        [STATUS_CODES.OK, "Ledger fetched successfully"],
        "Ledger",
        result,
        res,
        "object"
    );
});

export const getClientBalance = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const clientId = parseInt(req.params.client_id, 10);

    const result = await LedgerService.getClientBalance(clientId);

    return apiResponse(
        [STATUS_CODES.OK, "Balance fetched"],
        "Balance",
        result,
        res,
        "object"
    );
});