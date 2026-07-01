import { generatePrefixedId } from "../../utils/uniqueId.js";
import { withTransaction } from "../../utils/withTransaction.js";
import * as AgreementModel from "./agreement.model.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import * as SystemModel from "../system/system.model.js";
import * as AdminModel from "../admin/admin.model.js";
import * as UserModel from "../user/user.model.js";
import * as InvoiceModel from "../invoice/invoice.model.js";
import * as LedgerModel from "../ledger/ledger.model.js";
import { generateInvoicePDF } from "../../utils/invoicePdf.js";

const normalizePaymentType = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().toLowerCase();
    return normalized.length ? normalized : null;
};

export const runAgreementExpiryCron = async () => {
    return withTransaction(async (conn) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Get all ACTIVE agreements which are expired
        const [agreements] = await conn.query(
            `SELECT agreement_id, client_id, agreement_end_date
            FROM agreements
            WHERE status = 'active'
            AND agreement_end_date IS NOT NULL
            AND agreement_end_date < ?`,
            [today]
        );

        for (const agreement of agreements) {
            try {
                // 2. Mark agreement as expired
                await conn.query(
                    `UPDATE agreements 
                    SET status = 'expired' 
                    WHERE agreement_id = ?`,
                    [agreement.agreement_id]
                );

                // 4. (Optional) Add log if you maintain agreement_logs
                // await conn.query(
                //   `INSERT INTO agreement_logs
                //   (agreement_id, action, changed_by, note)
                //   VALUES (?, ?, ?, ?)`,
                //   [
                //     agreement.agreement_id,
                //     "expired",
                //     null,
                //     "Auto expired by cron",
                //   ]
                // );

                console.log(`Agreement expired: ${agreement.agreement_id}`);
            } catch (err) {
                console.error(
                    `Error expiring agreement ${agreement.agreement_id}`,
                    err
                );
            }
        }

        return {
            processed: agreements.length,
        };
    });
};

const toSafeNumber = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
};

const toSafeInt = (value) => {
    const num = Number(value);
    if (!Number.isInteger(num)) return null;
    return num;
};

const normalizeArray = (value) => {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : null;
};

const validateDateString = (value, fieldName) => {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, `${fieldName} is invalid`]);
    }
    return value;
};

const computeAgreementStatus = (startDateValue, endDateValue) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(startDateValue);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(endDateValue);
    endDate.setHours(0, 0, 0, 0);

    if (endDate < today) return "expired";
    if (startDate > today) return "scheduled";
    return "active";
};

const ensureObjectPayload = (payload) => {
    if (!payload || typeof payload !== "object") {
        throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid payload"]);
    }
};

const startOfDay = (d) => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
};

const daysBetween = (from, to) => {
    const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
    return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
};

const lastDayOfMonth = (year, monthIndex) => {
    return new Date(year, monthIndex + 1, 0).getDate();
};

const getBillingDateForMonth = (year, monthIndex, billingDay) => {
    const safeDay = Math.min(billingDay, lastDayOfMonth(year, monthIndex));
    const d = new Date(year, monthIndex, safeDay);
    d.setHours(0, 0, 0, 0);
    return d;
};

// Billing cycle: [cycleStart, cycleEnd)
const computeBillingCycleWindow = (now, billingDay) => {
    const n = startOfDay(now);
    const year = n.getFullYear();
    const month = n.getMonth();

    const thisMonthBilling = getBillingDateForMonth(year, month, billingDay);
    const prevMonthBilling = getBillingDateForMonth(year, month - 1, billingDay);
    const nextMonthBilling = getBillingDateForMonth(year, month + 1, billingDay);

    const cycleStart = n >= thisMonthBilling ? thisMonthBilling : prevMonthBilling;
    const cycleEnd = n >= thisMonthBilling ? nextMonthBilling : thisMonthBilling;

    return { cycleStart, cycleEnd };
};

const computeInvoiceMonthForCycleStart = (cycleStart) => {
    const d = new Date(cycleStart);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
};

export const createAgreement = async (user, payload) => {
    return withTransaction(async (conn) => {
        // 🔥 generate unique id
        const paymentTypeRaw = normalizePaymentType(payload.payment_type);
        if (
            paymentTypeRaw !== null &&
            !["prepaid", "postpaid"].includes(paymentTypeRaw)
        ) {
            throw new ApiError([
                STATUS_CODES.BAD_REQUEST,
                "payment_type must be prepaid or postpaid",
            ]);
        }

        const clientId = toSafeInt(payload.client_id);
        if (!clientId || clientId <= 0) {
            throw new ApiError([STATUS_CODES.BAD_REQUEST, "client_id is required"]);
        }

        const billingCycleDay = toSafeInt(payload.billing_cycle_day);
        if (!billingCycleDay || billingCycleDay < 1 || billingCycleDay > 31) {
            throw new ApiError([
                STATUS_CODES.BAD_REQUEST,
                "billing_cycle_day must be between 1 and 31",
            ]);
        }

        const startDate = validateDateString(payload.start_date, "start_date");
        const endDate = validateDateString(payload.end_date, "end_date");
        if (new Date(endDate) < new Date(startDate)) {
            throw new ApiError([
                STATUS_CODES.BAD_REQUEST,
                "end_date must be after start_date",
            ]);
        }

        const computedStatus = computeAgreementStatus(startDate, endDate);
        if (computedStatus === "active") {
            const existingActive =
                await AgreementModel.getActiveAgreementForClientTx(conn, clientId);
            if (existingActive) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "Client already has an active agreement",
                ]);
            }
        }

        const systemsRaw = normalizeArray(payload.systems);
        const gsmGatewaysRaw = normalizeArray(payload.gsm_gateways);
        const serversRaw = normalizeArray(payload.servers);
        const assetsRaw = normalizeArray(payload.assets);
        if (!systemsRaw || !gsmGatewaysRaw || !serversRaw || !assetsRaw) {
            throw new ApiError([
                STATUS_CODES.BAD_REQUEST,
                "systems, gsm_gateways, servers and assets must be arrays",
            ]);
        }

        const systems = systemsRaw.map((item, idx) => {
            const systemId = toSafeInt(item?.system_id);
            const price = toSafeNumber(item?.price);
            if (!systemId || systemId <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `systems[${idx}].system_id is required`,
                ]);
            }
            if (price === null || price < 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `systems[${idx}].price must be a valid number`,
                ]);
            }
            return { system_id: systemId, system_price: price };
        });

        const gsmGateways = gsmGatewaysRaw.map((item, idx) => {
            const gatewayId = toSafeInt(item?.gateway_id);
            const quantity = toSafeInt(item?.quantity);
            const pricePerUnit = toSafeNumber(item?.price_per_unit);
            if (!gatewayId || gatewayId <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `gsm_gateways[${idx}].gateway_id is required`,
                ]);
            }
            if (!quantity || quantity <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `gsm_gateways[${idx}].quantity must be a positive integer`,
                ]);
            }
            if (pricePerUnit === null || pricePerUnit < 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `gsm_gateways[${idx}].price_per_unit must be a valid number`,
                ]);
            }
            const totalPrice = quantity * pricePerUnit;
            return {
                gateway_id: gatewayId,
                allocated_quantity: quantity,
                price_per_unit: pricePerUnit,
                total_price: totalPrice,
            };
        });

        const servers = serversRaw.map((item, idx) => {
            const serverId = toSafeInt(item?.server_id);
            const quantity = toSafeInt(item?.quantity);
            const pricePerUnit = toSafeNumber(item?.price_per_unit);
            if (!serverId || serverId <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `servers[${idx}].server_id is required`,
                ]);
            }
            if (!quantity || quantity <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `servers[${idx}].quantity must be a positive integer`,
                ]);
            }
            if (pricePerUnit === null || pricePerUnit < 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `servers[${idx}].price_per_unit must be a valid number`,
                ]);
            }
            const totalPrice = quantity * pricePerUnit;
            return {
                server_id: serverId,
                allocated_quantity: quantity,
                price_per_unit: pricePerUnit,
                total_price: totalPrice,
            };
        });

        const assets = assetsRaw.map((item, idx) => {
            const assetId = toSafeInt(item?.asset_id);
            const price = toSafeNumber(item?.price);
            if (!assetId || assetId <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `assets[${idx}].asset_id is required`,
                ]);
            }
            if (price === null || price < 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `assets[${idx}].price must be a valid number`,
                ]);
            }
            return { asset_id: assetId, asset_price: price };
        });

        const rentAmount =
            systems.reduce((sum, item) => sum + Number(item.system_price || 0), 0) +
            gsmGateways.reduce((sum, item) => sum + Number(item.total_price || 0), 0) +
            servers.reduce((sum, item) => sum + Number(item.total_price || 0), 0) +
            assets.reduce((sum, item) => sum + Number(item.asset_price || 0), 0);

        if (rentAmount <= 0) {
            throw new ApiError([
                STATUS_CODES.BAD_REQUEST,
                "At least one item with price is required to create an agreement",
            ]);
        }

        if (systems.length) {
            const systemIds = systems.map((s) => s.system_id);
            const existingSystems = await SystemModel.getSystemsByIdsTx(conn, systemIds);
            const existingSet = new Set(
                existingSystems
                    .filter((row) => Number(row?.is_deleted) !== 1)
                    .map((row) => Number(row.id))
            );
            const missing = systemIds.filter((id) => !existingSet.has(id));
            if (missing.length) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `Invalid system_id(s): ${missing.join(", ")}`,
                ]);
            }
        }

        if (gsmGateways.length) {
            for (const gateway of gsmGateways) {
                const existing = await AdminModel.getGsmGatewayByIdTx(
                    conn,
                    gateway.gateway_id
                );
                if (!existing || Number(existing.is_deleted) === 1) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `Invalid gateway_id: ${gateway.gateway_id}`,
                    ]);
                }
            }
        }

        if (servers.length) {
            for (const server of servers) {
                const existing = await AdminModel.getServerByIdTx(conn, server.server_id);
                if (!existing || Number(existing.is_deleted) === 1) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `Invalid server_id: ${server.server_id}`,
                    ]);
                }
            }
        }

        if (assets.length) {
            const allocatedAssets = await AgreementModel.listAllocatedAssetsForClientTx(
                conn,
                clientId
            );
            const allocatedSet = new Set(
                (allocatedAssets || []).map((row) => Number(row.asset_id))
            );
            const desired = assets.map((a) => Number(a.asset_id));
            const notAllocated = desired.filter((id) => !allocatedSet.has(id));
            if (notAllocated.length) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `Asset(s) not allocated to this client: ${notAllocated.join(", ")}`,
                ]);
            }
        }

        const agreementUniqueId = await generatePrefixedId(
            conn,
            "agreements",
            "agreement_unique_id",
            "AGR"
        );

        const agreementData = {
            client_id: clientId,
            rent_amount: rentAmount,
            billing_cycle_day: billingCycleDay,
            agreement_start_date: startDate,
            agreement_end_date: endDate,
            payment_type: paymentTypeRaw || "prepaid",
            status: computedStatus,
            created_by: user.admin_id || user.employee_id,
            agreement_unique_id: agreementUniqueId,
        };

        const agreementId = await AgreementModel.createAgreement(conn, agreementData);

        await AgreementModel.insertAgreementSystemsTx(conn, agreementId, systems);
        await AgreementModel.insertAgreementAssetsTx(conn, agreementId, assets);
        await AgreementModel.insertAgreementGsmGatewaysTx(conn, agreementId, gsmGateways);
        await AgreementModel.insertAgreementServersTx(conn, agreementId, servers);

        return {
            agreement_id: agreementId,
            agreement_unique_id: agreementUniqueId,
            rent_amount: rentAmount,
        };
    });
};
export const listAgreements = async ({ search, status, client_id, page, limit }) => {
    const result = await AgreementModel.listAgreements({
        search,
        status,
        client_id,
        page,
        limit,
    });

    const data = (result?.data || []).map((agreement) => {
        const isTerminated =
            agreement?.terminated_at !== null && agreement?.terminated_at !== undefined
                ? true
                : String(agreement?.status || "").trim().toLowerCase() === "terminated";
        if (isTerminated) return { ...agreement, status: "terminated" };

        const computed = computeAgreementStatus(
            agreement?.agreement_start_date,
            agreement?.agreement_end_date
        );

        return { ...agreement, status: computed };
    });

    return { ...result, data };
};

export const getAgreementById = async (agreementId) => {
    return withTransaction(async (conn) => {
        const agreement = await AgreementModel.getAgreementByIdTx(
            conn,
            agreementId
        );

        if (!agreement) {
            throw new ApiError([STATUS_CODES.NOT_FOUND, "Agreement not found"]);
        }

        const [systems, assets, gsm_gateways, servers] = await Promise.all([
            AgreementModel.getAgreementSystemsTx(conn, agreementId),
            AgreementModel.getAgreementAssetsTx(conn, agreementId),
            AgreementModel.getAgreementGsmGatewaysTx(conn, agreementId),
            AgreementModel.getAgreementServersTx(conn, agreementId),
        ]);

        const isTerminated =
            agreement?.terminated_at !== null && agreement?.terminated_at !== undefined
                ? true
                : String(agreement?.status || "").trim().toLowerCase() === "terminated";
        if (isTerminated) {
            return {
                ...agreement,
                status: "terminated",
                systems: systems || [],
                assets: assets || [],
                gsm_gateways: gsm_gateways || [],
                servers: servers || [],
            };
        }

        const computed = computeAgreementStatus(
            agreement?.agreement_start_date,
            agreement?.agreement_end_date
        );

        return {
            ...agreement,
            status: computed,
            systems: systems || [],
            assets: assets || [],
            gsm_gateways: gsm_gateways || [],
            servers: servers || [],
        };
    });
};

export const updateAgreement = async (user, agreementId, payload) => {
    return withTransaction(async (conn) => {
        const existing = await AgreementModel.getAgreementByIdTx(
            conn,
            agreementId
        );

        if (!existing) {
            throw new ApiError([STATUS_CODES.NOT_FOUND, "Agreement not found"]);
        }

        // If caller uses the new "create-like" payload, do a full replace update.
        // Otherwise keep the old partial update behavior.
        const usesNewPayload =
            payload?.systems !== undefined ||
            payload?.assets !== undefined ||
            payload?.gsm_gateways !== undefined ||
            payload?.servers !== undefined ||
            payload?.client_id !== undefined ||
            payload?.start_date !== undefined ||
            payload?.end_date !== undefined ||
            payload?.billing_cycle_day !== undefined;

        if (usesNewPayload) {
            ensureObjectPayload(payload);

            const shouldUpdateSystems = payload.systems !== undefined;
            const shouldUpdateAssets = payload.assets !== undefined;
            const shouldUpdateGateways = payload.gsm_gateways !== undefined;
            const shouldUpdateServers = payload.servers !== undefined;

            const [existingSystemsRows, existingAssetsRows, existingGatewayRows, existingServerRows] =
                await Promise.all([
                    AgreementModel.getAgreementSystemsTx(conn, agreementId),
                    AgreementModel.getAgreementAssetsTx(conn, agreementId),
                    AgreementModel.getAgreementGsmGatewaysTx(conn, agreementId),
                    AgreementModel.getAgreementServersTx(conn, agreementId),
                ]);

            // NOTE: old rent amount can be derived from existing rows if needed for audits.

            const clientId =
                payload.client_id !== undefined
                    ? toSafeInt(payload.client_id)
                    : Number(existing.client_id);
            if (!clientId || clientId <= 0) {
                throw new ApiError([STATUS_CODES.BAD_REQUEST, "client_id is required"]);
            }

            const billingCycleDay =
                payload.billing_cycle_day !== undefined
                    ? toSafeInt(payload.billing_cycle_day)
                    : Number(existing.billing_cycle_day);
            if (!billingCycleDay || billingCycleDay < 1 || billingCycleDay > 31) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "billing_cycle_day must be between 1 and 31",
                ]);
            }

            const startDate =
                payload.start_date !== undefined
                    ? validateDateString(payload.start_date, "start_date")
                    : existing.agreement_start_date;
            const endDate =
                payload.end_date !== undefined
                    ? validateDateString(payload.end_date, "end_date")
                    : existing.agreement_end_date;
            if (new Date(endDate) < new Date(startDate)) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "end_date must be after start_date",
                ]);
            }

            const paymentTypeRaw =
                payload.payment_type !== undefined
                    ? normalizePaymentType(payload.payment_type)
                    : normalizePaymentType(existing.payment_type);
            if (
                paymentTypeRaw !== null &&
                !["prepaid", "postpaid"].includes(paymentTypeRaw)
            ) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "payment_type must be prepaid or postpaid",
                ]);
            }

            const systems = shouldUpdateSystems
                ? (() => {
                    const systemsRaw = normalizeArray(payload.systems);
                    if (!systemsRaw) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            "systems must be an array",
                        ]);
                    }
                    return systemsRaw.map((item, idx) => {
                        const systemId = toSafeInt(item?.system_id);
                        const price = toSafeNumber(item?.price);
                        if (!systemId || systemId <= 0) {
                            throw new ApiError([
                                STATUS_CODES.BAD_REQUEST,
                                `systems[${idx}].system_id is required`,
                            ]);
                        }
                        if (price === null || price < 0) {
                            throw new ApiError([
                                STATUS_CODES.BAD_REQUEST,
                                `systems[${idx}].price must be a valid number`,
                            ]);
                        }
                        return { system_id: systemId, system_price: price };
                    });
                })()
                : existingSystemsRows.map((row) => ({
                    system_id: Number(row.system_id),
                    system_price: Number(row.system_price || 0),
                }));

            const assets = shouldUpdateAssets
                ? (() => {
                    const assetsRaw = normalizeArray(payload.assets);
                    if (!assetsRaw) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            "assets must be an array",
                        ]);
                    }
                    return assetsRaw.map((item, idx) => {
                        const assetId = toSafeInt(item?.asset_id);
                        const price = toSafeNumber(item?.price);
                        if (!assetId || assetId <= 0) {
                            throw new ApiError([
                                STATUS_CODES.BAD_REQUEST,
                                `assets[${idx}].asset_id is required`,
                            ]);
                        }
                        if (price === null || price < 0) {
                            throw new ApiError([
                                STATUS_CODES.BAD_REQUEST,
                                `assets[${idx}].price must be a valid number`,
                            ]);
                        }
                        return { asset_id: assetId, asset_price: price };
                    });
                })()
                : existingAssetsRows.map((row) => ({
                    asset_id: Number(row.asset_id),
                    asset_price: Number(row.asset_price || 0),
                }));

            const gsmGateways = shouldUpdateGateways
                ? (() => {
                    const gsmGatewaysRaw = normalizeArray(payload.gsm_gateways);
                    if (!gsmGatewaysRaw) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            "gsm_gateways must be an array",
                        ]);
                    }
                    return gsmGatewaysRaw.map((item, idx) => {
                        const gatewayId = toSafeInt(item?.gateway_id);
                        const quantity = toSafeInt(item?.quantity);
                        const pricePerUnit = toSafeNumber(item?.price_per_unit);
                        if (!gatewayId || gatewayId <= 0) {
                            throw new ApiError([
                                STATUS_CODES.BAD_REQUEST,
                                `gsm_gateways[${idx}].gateway_id is required`,
                            ]);
                        }
                        if (!quantity || quantity <= 0) {
                            throw new ApiError([
                                STATUS_CODES.BAD_REQUEST,
                                `gsm_gateways[${idx}].quantity must be a positive integer`,
                            ]);
                        }
                        if (pricePerUnit === null || pricePerUnit < 0) {
                            throw new ApiError([
                                STATUS_CODES.BAD_REQUEST,
                                `gsm_gateways[${idx}].price_per_unit must be a valid number`,
                            ]);
                        }
                        const totalPrice = quantity * pricePerUnit;
                        return {
                            gateway_id: gatewayId,
                            allocated_quantity: quantity,
                            price_per_unit: pricePerUnit,
                            total_price: totalPrice,
                        };
                    });
                })()
                : existingGatewayRows.map((row) => ({
                    gateway_id: Number(row.gateway_id),
                    allocated_quantity: Number(row.allocated_quantity || 0),
                    price_per_unit: Number(row.price_per_unit || 0),
                    total_price: Number(row.total_price || 0),
                }));

            const servers = shouldUpdateServers
                ? (() => {
                    const serversRaw = normalizeArray(payload.servers);
                    if (!serversRaw) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            "servers must be an array",
                        ]);
                    }
                    return serversRaw.map((item, idx) => {
                        const serverId = toSafeInt(item?.server_id);
                        const quantity = toSafeInt(item?.quantity);
                        const pricePerUnit = toSafeNumber(item?.price_per_unit);
                        if (!serverId || serverId <= 0) {
                            throw new ApiError([
                                STATUS_CODES.BAD_REQUEST,
                                `servers[${idx}].server_id is required`,
                            ]);
                        }
                        if (!quantity || quantity <= 0) {
                            throw new ApiError([
                                STATUS_CODES.BAD_REQUEST,
                                `servers[${idx}].quantity must be a positive integer`,
                            ]);
                        }
                        if (pricePerUnit === null || pricePerUnit < 0) {
                            throw new ApiError([
                                STATUS_CODES.BAD_REQUEST,
                                `servers[${idx}].price_per_unit must be a valid number`,
                            ]);
                        }
                        const totalPrice = quantity * pricePerUnit;
                        return {
                            server_id: serverId,
                            allocated_quantity: quantity,
                            price_per_unit: pricePerUnit,
                            total_price: totalPrice,
                        };
                    });
                })()
                : existingServerRows.map((row) => ({
                    server_id: Number(row.server_id),
                    allocated_quantity: Number(row.allocated_quantity || 0),
                    price_per_unit: Number(row.price_per_unit || 0),
                    total_price: Number(row.total_price || 0),
                }));

            const rentAmount =
                systems.reduce(
                    (sum, item) => sum + Number(item.system_price || 0),
                    0
                ) +
                assets.reduce((sum, item) => sum + Number(item.asset_price || 0), 0) +
                gsmGateways.reduce(
                    (sum, item) => sum + Number(item.total_price || 0),
                    0
                ) +
                servers.reduce(
                    (sum, item) => sum + Number(item.total_price || 0),
                    0
                );

            if (rentAmount <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "At least one item with price is required",
                ]);
            }

            if (shouldUpdateSystems && systems.length) {
                const systemIds = systems.map((s) => s.system_id);
                const existingSystems = await SystemModel.getSystemsByIdsTx(
                    conn,
                    systemIds
                );
                const existingSet = new Set(
                    existingSystems
                        .filter((row) => Number(row?.is_deleted) !== 1)
                        .map((row) => Number(row.id))
                );
                const missing = systemIds.filter((id) => !existingSet.has(id));
                if (missing.length) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `Invalid system_id(s): ${missing.join(", ")}`,
                    ]);
                }
            }

            if (shouldUpdateAssets && assets.length) {
                const allocatedAssets = await AgreementModel.listAllocatedAssetsForClientTx(
                    conn,
                    clientId
                );
                const allocatedSet = new Set(
                    (allocatedAssets || []).map((row) => Number(row.asset_id))
                );
                const desired = assets.map((a) => Number(a.asset_id));
                const notAllocated = desired.filter((id) => !allocatedSet.has(id));
                if (notAllocated.length) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `Asset(s) not allocated to this client: ${notAllocated.join(", ")}`,
                    ]);
                }
            }

            if (shouldUpdateGateways && gsmGateways.length) {
                for (const gateway of gsmGateways) {
                    const existingGateway = await AdminModel.getGsmGatewayByIdTx(
                        conn,
                        gateway.gateway_id
                    );
                    if (!existingGateway || Number(existingGateway.is_deleted) === 1) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            `Invalid gateway_id: ${gateway.gateway_id}`,
                        ]);
                    }
                }
            }

            if (shouldUpdateServers && servers.length) {
                for (const server of servers) {
                    const existingServer = await AdminModel.getServerByIdTx(
                        conn,
                        server.server_id
                    );
                    if (!existingServer || Number(existingServer.is_deleted) === 1) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            `Invalid server_id: ${server.server_id}`,
                        ]);
                    }
                }
            }

            const nextStatus =
                String(existing.status || "").toLowerCase() === "terminated"
                    ? "terminated"
                    : computeAgreementStatus(startDate, endDate);

            if (nextStatus === "active") {
                const existingActive =
                    await AgreementModel.getActiveAgreementForClientTx(
                        conn,
                        clientId,
                        agreementId
                    );
                if (existingActive) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        "Client already has an active agreement",
                    ]);
                }
            }

            await AgreementModel.updateAgreementTx(conn, agreementId, {
                client_id: clientId,
                billing_cycle_day: billingCycleDay,
                agreement_start_date: startDate,
                agreement_end_date: endDate,
                payment_type: paymentTypeRaw || "prepaid",
                rent_amount: rentAmount,
                status: nextStatus,
            });

            const changeAt = new Date();
            const { cycleStart, cycleEnd } = computeBillingCycleWindow(
                changeAt,
                billingCycleDay
            );
            const cycleDays = Math.max(1, daysBetween(cycleStart, cycleEnd));
            const remainingDays = Math.max(0, daysBetween(changeAt, cycleEnd));
            const ratio = remainingDays / cycleDays;

            const prorationLineItems = [];

            if (shouldUpdateSystems) {
                const existingMap = new Map(
                    (existingSystemsRows || []).map((row) => [
                        Number(row.system_id),
                        Number(row.system_price || 0),
                    ])
                );
                const nextMap = new Map(
                    (systems || []).map((row) => [
                        Number(row.system_id),
                        Number(row.system_price || 0),
                    ])
                );

                const toDeactivate = [];
                const toInsert = [];

                for (const [systemId, oldPrice] of existingMap.entries()) {
                    if (!nextMap.has(systemId)) {
                        toDeactivate.push(systemId);
                        prorationLineItems.push({
                            item_type: "system",
                            item_ref_id: systemId,
                            description: `System #${systemId} removed (prorated)`,
                            quantity: 1,
                            unit_price: oldPrice,
                            amount: -1 * oldPrice * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                    }
                }

                for (const [systemId, newPrice] of nextMap.entries()) {
                    const oldPrice = existingMap.get(systemId);
                    if (oldPrice === undefined) {
                        toInsert.push({ system_id: systemId, system_price: newPrice });
                        prorationLineItems.push({
                            item_type: "system",
                            item_ref_id: systemId,
                            description: `System #${systemId} added (prorated)`,
                            quantity: 1,
                            unit_price: newPrice,
                            amount: newPrice * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                        continue;
                    }
                    if (Number(oldPrice) !== Number(newPrice)) {
                        toDeactivate.push(systemId);
                        toInsert.push({ system_id: systemId, system_price: newPrice });
                        const delta = Number(newPrice) - Number(oldPrice);
                        prorationLineItems.push({
                            item_type: "system",
                            item_ref_id: systemId,
                            description: `System #${systemId} price changed (prorated)`,
                            quantity: 1,
                            unit_price: delta,
                            amount: delta * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                    }
                }

                await AgreementModel.deactivateAgreementSystemsBySystemIdsTx(
                    conn,
                    agreementId,
                    [...new Set(toDeactivate)],
                    changeAt
                );
                await AgreementModel.insertAgreementSystemsTx(conn, agreementId, toInsert);
            }

            if (shouldUpdateAssets) {
                const existingMap = new Map(
                    (existingAssetsRows || []).map((row) => [
                        Number(row.asset_id),
                        Number(row.asset_price || 0),
                    ])
                );
                const nextMap = new Map(
                    (assets || []).map((row) => [
                        Number(row.asset_id),
                        Number(row.asset_price || 0),
                    ])
                );

                const toDeactivate = [];
                const toInsert = [];

                for (const [assetId, oldPrice] of existingMap.entries()) {
                    if (!nextMap.has(assetId)) {
                        toDeactivate.push(assetId);
                        prorationLineItems.push({
                            item_type: "asset",
                            item_ref_id: assetId,
                            description: `Asset #${assetId} removed (prorated)`,
                            quantity: 1,
                            unit_price: oldPrice,
                            amount: -1 * oldPrice * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                    }
                }

                for (const [assetId, newPrice] of nextMap.entries()) {
                    const oldPrice = existingMap.get(assetId);
                    if (oldPrice === undefined) {
                        toInsert.push({ asset_id: assetId, asset_price: newPrice });
                        prorationLineItems.push({
                            item_type: "asset",
                            item_ref_id: assetId,
                            description: `Asset #${assetId} added (prorated)`,
                            quantity: 1,
                            unit_price: newPrice,
                            amount: newPrice * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                        continue;
                    }
                    if (Number(oldPrice) !== Number(newPrice)) {
                        toDeactivate.push(assetId);
                        toInsert.push({ asset_id: assetId, asset_price: newPrice });
                        const delta = Number(newPrice) - Number(oldPrice);
                        prorationLineItems.push({
                            item_type: "asset",
                            item_ref_id: assetId,
                            description: `Asset #${assetId} price changed (prorated)`,
                            quantity: 1,
                            unit_price: delta,
                            amount: delta * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                    }
                }

                await AgreementModel.deactivateAgreementAssetsByAssetIdsTx(
                    conn,
                    agreementId,
                    [...new Set(toDeactivate)],
                    changeAt
                );
                await AgreementModel.insertAgreementAssetsTx(conn, agreementId, toInsert);
            }

            if (shouldUpdateGateways) {
                const existingMap = new Map(
                    (existingGatewayRows || []).map((row) => [
                        Number(row.gateway_id),
                        {
                            quantity: Number(row.allocated_quantity || 0),
                            unit: Number(row.price_per_unit || 0),
                            total: Number(row.total_price || 0),
                        },
                    ])
                );
                const nextMap = new Map(
                    (gsmGateways || []).map((row) => [
                        Number(row.gateway_id),
                        {
                            quantity: Number(row.allocated_quantity || 0),
                            unit: Number(row.price_per_unit || 0),
                            total: Number(row.total_price || 0),
                        },
                    ])
                );

                const toDeactivate = [];
                const toInsert = [];

                for (const [gatewayId, oldRow] of existingMap.entries()) {
                    if (!nextMap.has(gatewayId)) {
                        toDeactivate.push(gatewayId);
                        prorationLineItems.push({
                            item_type: "gsm_gateway",
                            item_ref_id: gatewayId,
                            description: `GSM Gateway #${gatewayId} removed (prorated)`,
                            quantity: oldRow.quantity,
                            unit_price: oldRow.unit,
                            amount: -1 * oldRow.total * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                    }
                }

                for (const [gatewayId, newRow] of nextMap.entries()) {
                    const oldRow = existingMap.get(gatewayId);
                    if (!oldRow) {
                        toInsert.push({
                            gateway_id: gatewayId,
                            allocated_quantity: newRow.quantity,
                            price_per_unit: newRow.unit,
                        });
                        prorationLineItems.push({
                            item_type: "gsm_gateway",
                            item_ref_id: gatewayId,
                            description: `GSM Gateway #${gatewayId} added (prorated)`,
                            quantity: newRow.quantity,
                            unit_price: newRow.unit,
                            amount: newRow.total * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                        continue;
                    }
                    const changed =
                        oldRow.quantity !== newRow.quantity || oldRow.unit !== newRow.unit;
                    if (changed) {
                        toDeactivate.push(gatewayId);
                        toInsert.push({
                            gateway_id: gatewayId,
                            allocated_quantity: newRow.quantity,
                            price_per_unit: newRow.unit,
                        });
                        const delta = Number(newRow.total) - Number(oldRow.total);
                        prorationLineItems.push({
                            item_type: "gsm_gateway",
                            item_ref_id: gatewayId,
                            description: `GSM Gateway #${gatewayId} changed (prorated)`,
                            quantity: newRow.quantity,
                            unit_price: newRow.unit,
                            amount: delta * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                    }
                }

                await AgreementModel.deactivateAgreementGsmGatewaysByGatewayIdsTx(
                    conn,
                    agreementId,
                    [...new Set(toDeactivate)],
                    changeAt
                );
                await AgreementModel.insertAgreementGsmGatewaysTx(conn, agreementId, toInsert);
            }

            if (shouldUpdateServers) {
                const existingMap = new Map(
                    (existingServerRows || []).map((row) => [
                        Number(row.server_id),
                        {
                            quantity: Number(row.allocated_quantity || 0),
                            unit: Number(row.price_per_unit || 0),
                            total: Number(row.total_price || 0),
                        },
                    ])
                );
                const nextMap = new Map(
                    (servers || []).map((row) => [
                        Number(row.server_id),
                        {
                            quantity: Number(row.allocated_quantity || 0),
                            unit: Number(row.price_per_unit || 0),
                            total: Number(row.total_price || 0),
                        },
                    ])
                );

                const toDeactivate = [];
                const toInsert = [];

                for (const [serverId, oldRow] of existingMap.entries()) {
                    if (!nextMap.has(serverId)) {
                        toDeactivate.push(serverId);
                        prorationLineItems.push({
                            item_type: "server",
                            item_ref_id: serverId,
                            description: `Server #${serverId} removed (prorated)`,
                            quantity: oldRow.quantity,
                            unit_price: oldRow.unit,
                            amount: -1 * oldRow.total * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                    }
                }

                for (const [serverId, newRow] of nextMap.entries()) {
                    const oldRow = existingMap.get(serverId);
                    if (!oldRow) {
                        toInsert.push({
                            server_id: serverId,
                            allocated_quantity: newRow.quantity,
                            price_per_unit: newRow.unit,
                        });
                        prorationLineItems.push({
                            item_type: "server",
                            item_ref_id: serverId,
                            description: `Server #${serverId} added (prorated)`,
                            quantity: newRow.quantity,
                            unit_price: newRow.unit,
                            amount: newRow.total * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                        continue;
                    }
                    const changed =
                        oldRow.quantity !== newRow.quantity || oldRow.unit !== newRow.unit;
                    if (changed) {
                        toDeactivate.push(serverId);
                        toInsert.push({
                            server_id: serverId,
                            allocated_quantity: newRow.quantity,
                            price_per_unit: newRow.unit,
                        });
                        const delta = Number(newRow.total) - Number(oldRow.total);
                        prorationLineItems.push({
                            item_type: "server",
                            item_ref_id: serverId,
                            description: `Server #${serverId} changed (prorated)`,
                            quantity: newRow.quantity,
                            unit_price: newRow.unit,
                            amount: delta * ratio,
                            proration_start: changeAt,
                            proration_end: cycleEnd,
                        });
                    }
                }

                await AgreementModel.deactivateAgreementServersByServerIdsTx(
                    conn,
                    agreementId,
                    [...new Set(toDeactivate)],
                    changeAt
                );
                await AgreementModel.insertAgreementServersTx(conn, agreementId, toInsert);
            }

            const effectiveProrationLines = prorationLineItems
                .map((li) => ({ ...li, amount: Number(li.amount || 0) }))
                .filter((li) => Math.abs(li.amount) > 0.0001);

            if (effectiveProrationLines.length) {
                const invoiceMonth = computeInvoiceMonthForCycleStart(cycleStart);

                const [[currentInvoice]] = await conn.query(
                    `SELECT invoice_id, client_id, status, invoice_unique_id, due_date, invoice_month, carried_forward_amount
                     FROM invoices
                     WHERE agreement_id = ?
                       AND YEAR(invoice_month) = YEAR(?)
                       AND MONTH(invoice_month) = MONTH(?)
                     ORDER BY invoice_id DESC
                     LIMIT 1`,
                    [agreementId, invoiceMonth, invoiceMonth]
                );

                const adjustmentTotal = effectiveProrationLines.reduce(
                    (sum, li) => sum + Number(li.amount || 0),
                    0
                );

                const invoiceStatus = currentInvoice?.status
                    ? String(currentInvoice.status).trim().toLowerCase()
                    : null;

                if (currentInvoice && invoiceStatus !== "paid") {
                    await InvoiceModel.insertInvoiceLineItemsTx(
                        conn,
                        effectiveProrationLines.map((li) => ({
                            invoice_id: currentInvoice.invoice_id,
                            agreement_id: agreementId,
                            item_type: li.item_type,
                            item_ref_id: li.item_ref_id,
                            description: li.description,
                            quantity: li.quantity,
                            unit_price: li.unit_price,
                            amount: li.amount,
                            proration_start: li.proration_start,
                            proration_end: li.proration_end,
                        }))
                    );

                    await LedgerModel.insertLedgerEntry(conn, {
                        client_id: currentInvoice.client_id,
                        invoice_id: currentInvoice.invoice_id,
                        entry_type: adjustmentTotal >= 0 ? "debit" : "credit",
                        amount: Math.abs(adjustmentTotal),
                        description: "Agreement updated (prorated)",
                        reference_type: "agreement_update",
                        reference_id: agreementId,
                    });

                    const [[sumRow]] = await conn.query(
                        `SELECT COALESCE(SUM(amount), 0) AS rent_sum
                         FROM invoice_line_items
                         WHERE invoice_id = ?`,
                        [currentInvoice.invoice_id]
                    );
                    const newRentForInvoice = Number(sumRow?.rent_sum || 0);
                    const carried = Number(currentInvoice.carried_forward_amount || 0);
                    const newTotal = newRentForInvoice + carried;

                    await InvoiceModel.updateInvoiceTotalsTx(conn, currentInvoice.invoice_id, {
                        rent_amount: newRentForInvoice,
                        carried_forward_amount: carried,
                        total_amount: newTotal,
                    });

                    const [[clientData]] = await conn.query(
                        `SELECT full_name, email, phone_number, company_name FROM clients WHERE id = ?`,
                        [currentInvoice.client_id]
                    );
                    const invoiceLineItems = await InvoiceModel.listInvoiceLineItemsTx(
                        conn,
                        currentInvoice.invoice_id
                    );
                    const pdfPath = await generateInvoicePDF(
                        {
                            invoice_unique_id: currentInvoice.invoice_unique_id,
                            due_date: currentInvoice.due_date,
                            rent_amount: newRentForInvoice,
                            carried_forward_amount: carried,
                            total_amount: newTotal,
                            status: currentInvoice.status,
                            invoice_month: currentInvoice.invoice_month,
                        },
                        clientData,
                        {
                            agreement_start_date: startDate,
                            agreement_end_date: endDate,
                        },
                        null,
                        invoiceLineItems
                    );

                    await conn.query(
                        `UPDATE invoices SET invoice_pdf = ? WHERE invoice_id = ?`,
                        [pdfPath, currentInvoice.invoice_id]
                    );
                } else {
                    await LedgerModel.insertLedgerEntry(conn, {
                        client_id: clientId,
                        invoice_id: null,
                        entry_type: adjustmentTotal >= 0 ? "debit" : "credit",
                        amount: Math.abs(adjustmentTotal),
                        description: "Agreement updated (prorated)",
                        reference_type: "agreement_update",
                        reference_id: agreementId,
                    });
                }
            }

            return {
                agreement_id: agreementId,
                rent_amount: rentAmount,
                status: nextStatus,
            };
        }

        // Old partial update mode
        const updateData = {};

        if (payload.rent_amount !== undefined) {
            updateData.rent_amount = payload.rent_amount;
        }

        if (payload.billing_cycle_day !== undefined) {
            updateData.billing_cycle_day = payload.billing_cycle_day;
        }

        if (payload.start_date !== undefined) {
            updateData.agreement_start_date = payload.start_date;
        }

        if (payload.end_date !== undefined) {
            updateData.agreement_end_date = payload.end_date;
        }

        if (payload.payment_type !== undefined) {
            const paymentTypeRaw = normalizePaymentType(payload.payment_type);
            if (
                paymentTypeRaw === null ||
                !["prepaid", "postpaid"].includes(paymentTypeRaw)
            ) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "payment_type must be prepaid or postpaid",
                ]);
            }
            updateData.payment_type = paymentTypeRaw;
        }

        if (payload.status !== undefined) {
            updateData.status = payload.status;
        }

        // If dates are changed in old mode, keep status consistent (unless terminated).
        const nextStart =
            updateData.agreement_start_date !== undefined
                ? updateData.agreement_start_date
                : existing.agreement_start_date;
        const nextEnd =
            updateData.agreement_end_date !== undefined
                ? updateData.agreement_end_date
                : existing.agreement_end_date;
        const existingIsTerminated =
            existing?.terminated_at !== null && existing?.terminated_at !== undefined
                ? true
                : String(existing?.status || "").trim().toLowerCase() === "terminated";

        if (!existingIsTerminated) {
            const shouldRecompute =
                updateData.agreement_start_date !== undefined ||
                updateData.agreement_end_date !== undefined;
            if (shouldRecompute && updateData.status === undefined) {
                updateData.status = computeAgreementStatus(nextStart, nextEnd);
            }
        }

        const nextStatusOldMode =
            updateData.status !== undefined ? String(updateData.status) : null;
        if (nextStatusOldMode && String(nextStatusOldMode).trim().toLowerCase() === "active") {
            const existingActive =
                await AgreementModel.getActiveAgreementForClientTx(
                    conn,
                    Number(existing.client_id),
                    agreementId
                );
            if (existingActive) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "Client already has an active agreement",
                ]);
            }
        }

        if (Object.keys(updateData).length === 0) {
            throw new ApiError([STATUS_CODES.BAD_REQUEST, "No fields to update"]);
        }

        await AgreementModel.updateAgreementTx(conn, agreementId, updateData);

        return { agreement_id: agreementId };
    });
};
//===========================================================
//Code By Darshika
//For Updating price 

export const updateAgreementPrices = async (user, agreementId, payload) => {
    return withTransaction(async (conn) => {

        // ── 1. Agreement exist & valid check ──────────────────────────────
        const agreement = await AgreementModel.getAgreementByIdTxx(conn, agreementId);
        if (!agreement) {
            throw new ApiError([STATUS_CODES.NOT_FOUND, "Agreement not found"]);
        }

        const systems   = normalizeArray(payload.systems)   ?? [];
        const assets    = normalizeArray(payload.assets)    ?? [];
        const gateways  = normalizeArray(payload.gateway)   ?? [];
        const servers   = normalizeArray(payload.servers)   ?? [];

        // ── 2. At least one item must be present ──────────────────────────
        if (!systems.length && !assets.length && !gateways.length && !servers.length) {
            throw new ApiError([
                STATUS_CODES.BAD_REQUEST,
                "At least one of systems, assets, gateway, or servers must be provided",
            ]);
        }

        const updated = { systems: [], assets: [], gateway: [], servers: [] };

        // ── 3. Systems ────────────────────────────────────────────────────
        for (const [idx, item] of systems.entries()) {
            const systemId = toSafeInt(item?.system_id);
            const price    = toSafeNumber(item?.price);

            if (!systemId || systemId <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `systems[${idx}].system_id is required and must be a positive integer`,
                ]);
            }
            if (price === null || price < 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `systems[${idx}].price must be a valid non-negative number`,
                ]);
            }

            const affected = await AgreementModel.updateSystemPriceTx(conn, agreementId, systemId, price);
            if (!affected) {
                throw new ApiError([
                    STATUS_CODES.NOT_FOUND,
                    `system_id ${systemId} not found in this agreement`,
                ]);
            }

            updated.systems.push({ system_id: systemId, price });
        }

        // ── 4. Assets ─────────────────────────────────────────────────────
        for (const [idx, item] of assets.entries()) {
            const assetId = toSafeInt(item?.asset_id);
            const price   = toSafeNumber(item?.price);

            if (!assetId || assetId <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `assets[${idx}].asset_id is required and must be a positive integer`,
                ]);
            }
            if (price === null || price < 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `assets[${idx}].price must be a valid non-negative number`,
                ]);
            }

            const affected = await AgreementModel.updateAssetPriceTx(conn, agreementId, assetId, price);
            if (!affected) {
                throw new ApiError([
                    STATUS_CODES.NOT_FOUND,
                    `asset_id ${assetId} not found in this agreement`,
                ]);
            }

            updated.assets.push({ asset_id: assetId, price });
        }

        // ── 5. GSM Gateways ───────────────────────────────────────────────
        for (const [idx, item] of gateways.entries()) {
            const gatewayId   = toSafeInt(item?.gateway_id);
            const pricePerUnit = toSafeNumber(item?.price_per_unit);

            if (!gatewayId || gatewayId <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `gateway[${idx}].gateway_id is required and must be a positive integer`,
                ]);
            }
            if (pricePerUnit === null || pricePerUnit < 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `gateway[${idx}].price_per_unit must be a valid non-negative number`,
                ]);
            }

            const affected = await AgreementModel.updateGatewayPriceTx(conn, agreementId, gatewayId, pricePerUnit);
            if (!affected) {
                throw new ApiError([
                    STATUS_CODES.NOT_FOUND,
                    `gateway_id ${gatewayId} not found in this agreement`,
                ]);
            }

            updated.gateway.push({ gateway_id: gatewayId, price: pricePerUnit });
        }

        // ── 6. Servers ────────────────────────────────────────────────────
        for (const [idx, item] of servers.entries()) {
            const serverId    = toSafeInt(item?.server_id);
            const pricePerUnit = toSafeNumber(item?.price_per_unit);

            if (!serverId || serverId <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `servers[${idx}].server_id is required and must be a positive integer`,
                ]);
            }
            if (pricePerUnit === null || pricePerUnit < 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `servers[${idx}].price_per_unit must be a valid non-negative number`,
                ]);
            }

            const affected = await AgreementModel.updateServerPriceTx(conn, agreementId, serverId, pricePerUnit);
            if (!affected) {
                throw new ApiError([
                    STATUS_CODES.NOT_FOUND,
                    `server_id ${serverId} not found in this agreement`,
                ]);
            }

            updated.servers.push({ server_id: serverId, price: pricePerUnit });
        }

        // ── 7. Recalculate rent_amount ────────────────────────────────────
        const newRentAmount = await AgreementModel.recalculateRentAmountTx(conn, agreementId);

        return {
            agreement_id: agreementId,
            rent_amount:  newRentAmount,
            updated,
        };
    });
};

//============================================================
export const updateAgreementStatus = async (user, agreementId, status) => {
    return withTransaction(async (conn) => {
        const agreement = await AgreementModel.getAgreementByIdTx(
            conn,
            agreementId
        );

        if (!agreement) {
            throw new ApiError([STATUS_CODES.NOT_FOUND, "Agreement not found"]);
        }

        const action = status === undefined || status === null ? "" : String(status).trim().toLowerCase();
        if (!["terminated", "reinstate"].includes(action)) {
            throw new ApiError([
                STATUS_CODES.BAD_REQUEST,
                "status must be terminated or reinstate",
            ]);
        }

        const isCurrentlyTerminated =
            agreement?.terminated_at !== null && agreement?.terminated_at !== undefined
                ? true
                : String(agreement?.status || "").trim().toLowerCase() === "terminated";

        if (action === "terminated") {
            if (isCurrentlyTerminated) {
                return {
                    agreement_id: agreementId,
                    status: "terminated",
                    terminated_at: agreement.terminated_at || null,
                };
            }

            const now = new Date();
            await AgreementModel.setAgreementTerminationTx(conn, agreementId, {
                status: "terminated",
                terminated_at: now,
            });

            return { agreement_id: agreementId, status: "terminated", terminated_at: now };
        }

        // reinstate
        if (!isCurrentlyTerminated) {
            const computed = computeAgreementStatus(
                agreement?.agreement_start_date,
                agreement?.agreement_end_date
            );
            return { agreement_id: agreementId, status: computed, terminated_at: null };
        }

        const computed = computeAgreementStatus(
            agreement?.agreement_start_date,
            agreement?.agreement_end_date
        );
        if (computed === "active") {
            const existingActive =
                await AgreementModel.getActiveAgreementForClientTx(
                    conn,
                    Number(agreement.client_id),
                    agreementId
                );
            if (existingActive) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "Client already has an active agreement",
                ]);
            }
        }

        await AgreementModel.setAgreementTerminationTx(conn, agreementId, {
            status: computed,
            terminated_at: null,
        });

        return { agreement_id: agreementId, status: computed, terminated_at: null };
    });
};

export const getAgreementOptionsForClient = async (clientId) => {
    return withTransaction(async (conn) => {
        const safeClientId = Number(clientId);
        if (!Number.isInteger(safeClientId) || safeClientId <= 0) {
            throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid client_id"]);
        }

        const client = await UserModel.getClientByIdTx(conn, safeClientId);
        if (!client) {
            throw new ApiError([STATUS_CODES.NOT_FOUND, "Client not found"]);
        }

        const [systems, gsmGateways, servers, assets] = await Promise.all([
            AgreementModel.listAllocatedSystemsForClientTx(conn, safeClientId),
            AgreementModel.listAllocatedGsmGatewaysForClientTx(conn, safeClientId),
            AgreementModel.listAllocatedServersForClientTx(conn, safeClientId),
            AgreementModel.listAllocatedAssetsForClientTx(conn, safeClientId),
        ]);

        return {
            client_id: safeClientId,
            systems,
            gsm_gateways: gsmGateways,
            servers,
            assets,
        };
    });
};
