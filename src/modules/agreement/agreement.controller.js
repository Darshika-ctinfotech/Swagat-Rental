import { ApiError, apiHandler, apiResponse } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import ROLES from "../../constants/roles.js";
import * as AgreementService from "./agreement.service.js";

const toSafeInt = (value) => {
    const num = Number(value);
    if (!Number.isInteger(num)) return null;
    return num;
};
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

export const createAgreement = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const result = await AgreementService.createAgreement(req.user, req.body);

    return apiResponse(
        [STATUS_CODES.CREATED, "Agreement created"],
        "Agreement",
        result,
        res,
        "object"
    );
});

export const listAgreements = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const { search, status, page, limit } = req.query;

    const result = await AgreementService.listAgreements({
        search,
        status,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
    });

    return apiResponse(
        [STATUS_CODES.OK, "Agreements fetched"],
        "Agreements",
        result,
        res,
        "object"
    );
});

export const getAgreementById = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const agreementId = parseInt(req.params.agreement_id, 10);

    if (isNaN(agreementId)) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid agreement_id"]);
    }

    const result = await AgreementService.getAgreementById(agreementId);

    return apiResponse(
        [STATUS_CODES.OK, "Agreement fetched"],
        "Agreement",
        result,
        res,
        "object"
    );
});

export const updateAgreement = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const agreementId = parseInt(req.params.agreement_id, 10);

    if (isNaN(agreementId)) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid agreement_id"]);
    }

    const result = await AgreementService.updateAgreement(
        req.user,
        agreementId,
        req.body
    );

    return apiResponse(
        [STATUS_CODES.OK, "Agreement updated"],
        "Agreement",
        result,
        res,
        "object"
    );
});
//====================================================================
//code by Darshika 
//For updating price 

export const updateAgreementPrices = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const agreementId = toSafeInt(req.params.agreement_id);
    if (!agreementId || agreementId <= 0) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid agreement_id in URL"]);
    }

    const result = await AgreementService.updateAgreementPrices(
        req.user,
        agreementId,
        req.body
    );

    return apiResponse(
        [STATUS_CODES.OK, "Agreement prices updated successfully"],
        "Agreement",
        result,
        res,
        "object"
    );
});
//================================================================

export const updateAgreementStatus = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const agreementId = parseInt(req.params.agreement_id, 10);
    const { status } = req.body;

    if (isNaN(agreementId)) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid agreement_id"]);
    }

    if (!status) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Status is required"]);
    }

    const result = await AgreementService.updateAgreementStatus(
        req.user,
        agreementId,
        status
    );

    return apiResponse(
        [STATUS_CODES.OK, "Agreement status updated"],
        "Agreement",
        result,
        res,
        "object"
    );
});

export const getAgreementOptionsForClient = apiHandler(async (req, res) => {
    assertAdminOrSubAdmin(req);

    const clientId = parseInt(req.params.client_id, 10);

    if (isNaN(clientId)) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid client_id"]);
    }

    const result = await AgreementService.getAgreementOptionsForClient(clientId);

    return apiResponse(
        [STATUS_CODES.OK, "Agreement assets fetched"],
        "Assets",
        result,
        res,
        "object"
    );
});
