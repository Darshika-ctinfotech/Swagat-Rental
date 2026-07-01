import * as InvoiceModel from "./invoice.model.js";
import * as LedgerModel from "../ledger/ledger.model.js";
import * as AgreementModel from "../agreement/agreement.model.js";
import { withTransaction } from "../../utils/withTransaction.js";
import { generatePrefixedId } from "../../utils/uniqueId.js";
import { generateInvoicePDF } from "../../utils/invoicePdf.js";
import { buildPublicFileUrl } from "../../utils/file-url.util.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import * as InventoryMovementModel from "../inventory/inventoryMovement.model.js";
import * as AuthModel from "../auth/auth.model.js";
import { hashPassword } from "../../utils/password.utils.js";

const toSafeInt = (value) => {
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) return null;
    return num;
};

const toSafeNumber = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
};

const getColumnSetTx = async (conn, tableName) => {
    const [rows] = await conn.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?`,
        [tableName]
    );
    return new Set(rows.map((row) => row.COLUMN_NAME));
};

const generatePassword = (length = 8) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let password = "";

    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return password;
};

const computeAgreementRentBreakdownTx = async (conn, agreementId) => {
    const [systems, assets, gsmGateways, servers] = await Promise.all([
        AgreementModel.getAgreementSystemsTx(conn, agreementId),
        AgreementModel.getAgreementAssetsTx(conn, agreementId),
        AgreementModel.getAgreementGsmGatewaysTx(conn, agreementId),
        AgreementModel.getAgreementServersTx(conn, agreementId),
    ]);

    const systemsTotal = (systems || []).reduce(
        (sum, item) => sum + Number(item?.system_price || 0),
        0
    );
    const assetsTotal = (assets || []).reduce(
        (sum, item) => sum + Number(item?.asset_price || 0),
        0
    );
    const gsmGatewaysTotal = (gsmGateways || []).reduce(
        (sum, item) => sum + Number(item?.total_price || 0),
        0
    );
    const serversTotal = (servers || []).reduce(
        (sum, item) => sum + Number(item?.total_price || 0),
        0
    );

    return {
        systems: systems || [],
        assets: assets || [],
        gsm_gateways: gsmGateways || [],
        servers: servers || [],
        totals: {
            systems: systemsTotal,
            assets: assetsTotal,
            gsm_gateways: gsmGatewaysTotal,
            servers: serversTotal,
            rent: systemsTotal + assetsTotal + gsmGatewaysTotal + serversTotal,
        },
    };
};

export const runInvoiceGeneration = async () => {
    return withTransaction(async (conn) => {
        const today = new Date().getDate();
        const status = "pending";

        // 1. Get active agreements whose billing cycle day is today
        const [agreements] = await conn.query(
            `
            SELECT
              a.*
            FROM agreements a
            INNER JOIN clients c ON c.id = a.client_id
            WHERE a.status = 'active'
              AND a.billing_cycle_day = ?
              AND c.is_deleted = 0
              AND c.is_disabled = 0
              AND a.agreement_start_date <= CURDATE()
              AND a.agreement_end_date >= CURDATE()
            `,
            [today]
        );

        for (const agreement of agreements) {
            const clientId = agreement.client_id;

            // 3. Check if invoice already exists for this month
            const now = new Date();
            const invoiceMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            invoiceMonth.setHours(0, 0, 0, 0);

            // Use YEAR/MONTH match to avoid timezone/time-component mismatches.
            const [[existingInvoice]] = await conn.query(
                `SELECT invoice_id
                 FROM invoices
                 WHERE agreement_id = ?
                   AND YEAR(invoice_month) = YEAR(CURDATE())
                   AND MONTH(invoice_month) = MONTH(CURDATE())
                 LIMIT 1`,
                [agreement.agreement_id]
            );

            if (existingInvoice) continue;

            // 4. Calculate previous due (ledger based)
            const [[ledger]] = await conn.query(
                `SELECT 
                COALESCE(SUM(CASE WHEN entry_type='debit' THEN amount ELSE 0 END),0) -
                COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount ELSE 0 END),0)
                AS balance
                FROM payment_ledger
                WHERE client_id = ?`,
                [clientId]
            );

            const previousDue = ledger.balance || 0;

            // 5. Prepare invoice data
            const breakdown = await computeAgreementRentBreakdownTx(
                conn,
                agreement.agreement_id
            );
            const rentFromAgreement = Number(agreement.rent_amount || 0);
            const rent =
                Number(breakdown?.totals?.rent || 0) > 0
                    ? Number(breakdown.totals.rent)
                    : rentFromAgreement;

            const totalAmount = rent + previousDue;

            const dueDate = new Date(now);
            dueDate.setHours(0, 0, 0, 0);
            dueDate.setDate(dueDate.getDate() + 5); // grace period

            const invoiceUniqueId = await generatePrefixedId(
                conn,
                "invoices",
                "invoice_unique_id",
                "INV"
            );
            // 6. Insert invoice
            const [invoiceResult] = await conn.query(
                `INSERT INTO invoices
                (invoice_unique_id, client_id, agreement_id, invoice_month, due_date, rent_amount, carried_forward_amount, total_amount, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    invoiceUniqueId,
                    clientId,
                    agreement.agreement_id,
                    invoiceMonth,
                    dueDate,
                    rent,
                    previousDue,
                    totalAmount,
                    status,
                ]
            );

            const invoiceId = invoiceResult.insertId;

            // Snapshot invoice line items (so future agreement changes don't rewrite history)
            const baseLineItems = [
                ...(breakdown.systems || []).map((row) => ({
                    invoice_id: invoiceId,
                    agreement_id: agreement.agreement_id,
                    item_type: "system",
                    item_ref_id: row.system_id,
                    description:
                        row?.system_uid || row?.system_uuid
                            ? `System ${row.system_uid || row.system_uuid}`
                            : `System #${row.system_id}`,
                    quantity: 1,
                    unit_price: Number(row?.system_price || 0),
                    amount: Number(row?.system_price || 0),
                })),
                ...(breakdown.assets || []).map((row) => ({
                    invoice_id: invoiceId,
                    agreement_id: agreement.agreement_id,
                    item_type: "asset",
                    item_ref_id: row.asset_id,
                    description: row?.serial_number
                        ? `Asset ${row.serial_number}`
                        : `Asset #${row.asset_id}`,
                    quantity: 1,
                    unit_price: Number(row?.asset_price || 0),
                    amount: Number(row?.asset_price || 0),
                })),
                ...(breakdown.gsm_gateways || []).map((row) => ({
                    invoice_id: invoiceId,
                    agreement_id: agreement.agreement_id,
                    item_type: "gsm_gateway",
                    item_ref_id: row.gateway_id,
                    description: row?.gateway_name
                        ? `GSM Gateway ${row.gateway_name}`
                        : `GSM Gateway #${row.gateway_id}`,
                    quantity: Number(row?.allocated_quantity || 0),
                    unit_price: Number(row?.price_per_unit || 0),
                    amount: Number(row?.total_price || 0),
                })),
                ...(breakdown.servers || []).map((row) => ({
                    invoice_id: invoiceId,
                    agreement_id: agreement.agreement_id,
                    item_type: "server",
                    item_ref_id: row.server_id,
                    description: row?.server_name
                        ? `Server ${row.server_name}`
                        : `Server #${row.server_id}`,
                    quantity: Number(row?.allocated_quantity || 0),
                    unit_price: Number(row?.price_per_unit || 0),
                    amount: Number(row?.total_price || 0),
                })),
            ];
            await InvoiceModel.insertInvoiceLineItemsTx(conn, baseLineItems);

            // fetch client details
            const [[clientData]] = await conn.query(
                `SELECT full_name, email, company_name FROM clients WHERE id = ?`,
                [clientId]
            );

            // prepare invoice object
            const invoiceData = {
                invoice_unique_id: invoiceUniqueId,
                due_date: dueDate,
                rent_amount: rent,
                carried_forward_amount: previousDue,
                total_amount: totalAmount,
                status,
                invoice_month: invoiceMonth,
            };

            // 🧾 generate PDF
            const invoiceLineItems = await InvoiceModel.listInvoiceLineItemsTx(
                conn,
                invoiceId
            );

            const pdfPath = await generateInvoicePDF(
                invoiceData,
                clientData,
                agreement,
                breakdown,
                invoiceLineItems
            );

            // 🧾 save PDF path
            await conn.query(
                `UPDATE invoices SET invoice_pdf = ? WHERE invoice_id = ?`,
                [pdfPath, invoiceId]
            );

            // 7. Add ledger entry (DEBIT)
            await conn.query(
                `INSERT INTO payment_ledger
                (client_id, invoice_id, entry_type, amount, description, reference_type, reference_id)
                VALUES (?, ?, 'debit', ?, 'Monthly Invoice', 'invoice', ?)`,
                // Only the current month charge should be a new debit.
                // The carried-forward amount already exists in the ledger as previous debits - credits.
                [clientId, invoiceId, rent, invoiceId]
            );

            console.log(`Invoice created for client ${clientId}`);
        }
    });
};

// export const listInvoices = async (filters) => {
//     return InvoiceModel.listInvoices(filters);
// };

export const listInvoices = async (filters) => {
    const result = await InvoiceModel.listInvoices(filters);

    // 🔥 map each invoice
    const updatedData = result.data.map((invoice) => ({
        ...invoice,
        invoice_pdf: buildPublicFileUrl(invoice.invoice_pdf),
    }));

    return {
        ...result,
        data: updatedData,
    };
};

export const getInvoiceDetails = async (invoiceId) => {
    return withTransaction(async (conn) => {
        const invoice = await InvoiceModel.getInvoiceById(conn, invoiceId);

        if (!invoice) throw new ApiError([STATUS_CODES.NOT_FOUND, "Invoice not found"]);

        const payments = await InvoiceModel.getInvoicePayments(conn, invoiceId);
        const ledger = await InvoiceModel.getInvoiceLedger(conn, invoiceId);
        const invoice_items = await InvoiceModel.listInvoiceLineItemsTx(conn, invoiceId);

        const invoiceStatus = invoice?.status
            ? String(invoice.status).trim().toLowerCase()
            : null;

        let latestPaymentStatus = null;
        if (payments.length) {
            const latest = payments.reduce((current, next) =>
                Number(next?.payment_id || 0) > Number(current?.payment_id || 0)
                    ? next
                    : current
            );
            latestPaymentStatus = latest?.status
                ? String(latest.status).trim().toLowerCase()
                : null;
        }

        const combinedStatus =
            invoiceStatus === "paid"
                ? "paid"
                : latestPaymentStatus === "pending"
                    ? "processing"
                    : latestPaymentStatus === "rejected"
                        ? "rejected"
                        : invoice.status;

        const totalPaid = ledger
            .filter((entry) => String(entry?.entry_type).toLowerCase() === "credit")
            .reduce((sum, entry) => sum + Number(entry?.amount || 0), 0);
        const totalAmount = Number(invoice?.total_amount || 0);
        const remainingAmount = Math.max(0, totalAmount - totalPaid);

        return {
            ...invoice,
            status: combinedStatus,
            invoice_pdf: buildPublicFileUrl(invoice?.invoice_pdf),
            payments,
            ledger,
            invoice_items,
            total_paid: totalPaid,
            remaining_amount: remainingAmount,
        };
    });
};

export const getManualInvoiceCreateOptions = async ({
    buyer_type = "client",
    search = null,
    limit = null,
} = {}) => {
    return withTransaction(async (conn) => {
        const safeBuyerType =
            String(buyer_type).toLowerCase() === "walk_in" ? "walk_in" : "client";

        const [clientColumns, systemColumns] = await Promise.all([
            getColumnSetTx(conn, "clients"),
            getColumnSetTx(conn, "systems"),
        ]);
        const hasClientType = clientColumns.has("client_type");
        const hasSystemAvailabilityType = systemColumns.has("availability_type");

        const safeLimit = (() => {
            const n = Number(limit);
            if (!Number.isInteger(n) || n <= 0) return 200;
            return Math.min(1000, n);
        })();

        const term = search ? String(search).trim() : "";
        const hasTerm = Boolean(term);

        const clientsPromise =
            safeBuyerType === "client"
                ? conn.query(
                      `
                      SELECT id, u_unique_id, full_name, email, phone_number, company_name
                      FROM clients
                      WHERE is_deleted = 0
                        AND is_disabled = 0
                        ${hasClientType ? "AND client_type = 'swagat'" : ""}
                        ${
                            hasTerm
                                ? "AND (full_name LIKE ? OR email LIKE ? OR phone_number LIKE ?)"
                                : ""
                        }
                      ORDER BY id DESC
                      LIMIT ?
                      `,
                      hasTerm
                          ? [`%${term}%`, `%${term}%`, `%${term}%`, safeLimit]
                          : [safeLimit]
                  )
                : Promise.resolve([[]]);

        const systemsPromise = conn.query(
            `
            SELECT id, system_uid, system_uuid, device_type
            FROM systems
            WHERE is_deleted = 0
              AND client_id IS NULL
              ${hasSystemAvailabilityType ? "AND availability_type = 'available'" : ""}
            ORDER BY id DESC
            `
        );

        const assetsPromise = conn.query(
            `
            SELECT
              a.asset_id,
              a.asset_category_id,
              t.name AS asset_category_name,
              a.brand,
              a.model,
              a.serial_number,
              a.manufacturer,
              a.spec_json,
              a.is_available,
              a.status,
              a.created_at,
              a.updated_at
            FROM assets a
            INNER JOIN asset_category t ON t.id = a.asset_category_id
            LEFT JOIN client_asset_allocations ca
              ON ca.asset_id = a.asset_id
             AND ca.is_deleted = 0
             AND ca.deallocated_at IS NULL
            LEFT JOIN system_assets sa
              ON sa.asset_id = a.asset_id
             AND sa.is_deleted = 0
             AND sa.removed_at IS NULL
            LEFT JOIN (
              SELECT
                im.item_id,
                COALESCE(SUM(CASE WHEN im.movement_type='sale' THEN im.qty ELSE 0 END), 0)
                  - COALESCE(SUM(CASE WHEN im.movement_type='sale_void' THEN im.qty ELSE 0 END), 0) AS net_sold
              FROM inventory_movements im
              WHERE im.item_type = 'asset'
              GROUP BY im.item_id
            ) sold ON sold.item_id = a.asset_id
            WHERE a.is_deleted = 0
              AND a.is_available = 1
              AND a.status = 'in_stock'
              AND ca.asset_id IS NULL
              AND sa.asset_id IS NULL
              AND COALESCE(sold.net_sold, 0) = 0
            ORDER BY a.asset_id DESC
            `
        );

        const serversPromise = conn.query(
            `
            SELECT
              s.*,
              (
                s.total_quantity
                - (
                  SELECT COALESCE(SUM(csa.allocated_quantity), 0)
                  FROM client_server_allocations csa
                  WHERE csa.server_id = s.id
                )
                - (
                  SELECT COALESCE(SUM(CASE WHEN im.movement_type='sale' THEN im.qty ELSE 0 END), 0)
                       - COALESCE(SUM(CASE WHEN im.movement_type='sale_void' THEN im.qty ELSE 0 END), 0)
                  FROM inventory_movements im
                  WHERE im.item_type = 'server'
                    AND im.item_id = s.id
                )
              ) AS available_quantity
            FROM servers s
            WHERE s.is_deleted = 0
              AND s.status = 'active'
            HAVING available_quantity > 0
            ORDER BY s.id DESC
            `
        );

        const gatewaysPromise = conn.query(
            `
            SELECT
              g.*,
              (
                g.total_quantity
                - (
                  SELECT COALESCE(SUM(cga.allocated_quantity), 0)
                  FROM client_gsm_gateway_allocations cga
                  WHERE cga.gateway_id = g.id
                )
                - (
                  SELECT COALESCE(SUM(CASE WHEN im.movement_type='sale' THEN im.qty ELSE 0 END), 0)
                       - COALESCE(SUM(CASE WHEN im.movement_type='sale_void' THEN im.qty ELSE 0 END), 0)
                  FROM inventory_movements im
                  WHERE im.item_type = 'gsm_gateway'
                    AND im.item_id = g.id
                )
              ) AS available_quantity
            FROM gsm_gateways g
            WHERE g.is_deleted = 0
              AND g.status = 'active'
            HAVING available_quantity > 0
            ORDER BY g.id DESC
            `
        );

        const [[clients], [systems], [assets], [servers], [gsm_gateways]] =
            await Promise.all([
                clientsPromise,
                systemsPromise,
                assetsPromise,
                serversPromise,
                gatewaysPromise,
            ]);

        return {
            clients: clients || [],
            systems: systems || [],
            assets: assets || [],
            servers: servers || [],
            gsm_gateways: gsm_gateways || [],
        };
    });
};

export const createInvoice = async (payload, user) => {
    return withTransaction(async (conn) => {
        const requestedInvoiceType =
            payload?.invoice_type ||
            (Array.isArray(payload?.items) ? "manual" : "agreement");

        if (String(requestedInvoiceType).toLowerCase() === "manual") {
            const [clientColumns, systemColumns] = await Promise.all([
                getColumnSetTx(conn, "clients"),
                getColumnSetTx(conn, "systems"),
            ]);
            const hasClientType = clientColumns.has("client_type");
            const hasSystemAvailabilityType = systemColumns.has("availability_type");

            const items = Array.isArray(payload?.items) ? payload.items : [];
            if (!items.length) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "items is required for manual invoice",
                ]);
            }

            const buyerTypeRaw =
                String(payload?.buyer_type || "client").toLowerCase() === "walk_in"
                    ? "walk_in"
                    : "client";

            let clientId =
                buyerTypeRaw === "client" ? toSafeInt(payload?.client_id) : null;

            if (buyerTypeRaw === "client" && !clientId) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "client_id is required when buyer_type is client",
                ]);
            }

            const dueDate = payload?.due_date ? new Date(payload.due_date) : new Date();
            if (Number.isNaN(dueDate.getTime())) {
                throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid due_date"]);
            }

            const invoiceMonth = payload?.invoice_month
                ? new Date(payload.invoice_month)
                : new Date();
            if (Number.isNaN(invoiceMonth.getTime())) {
                throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invalid invoice_month"]);
            }

            const actorId = user?.admin_id || user?.employee_id || null;
            const actorRole =
                user?.role && String(user.role).toLowerCase() === "sub_admin"
                    ? "sub_admin"
                    : "admin";

            let clientForPdf = null;
            if (buyerTypeRaw === "client") {
                const [[client]] = await conn.query(
                    `SELECT full_name, email, phone_number, company_name
                     FROM clients
                     WHERE id = ?
                       AND is_deleted = 0
                     LIMIT 1`,
                    [clientId]
                );
                if (!client) {
                    throw new ApiError([STATUS_CODES.NOT_FOUND, "Client not found"]);
                }
                clientForPdf = client;
            } else {
                const name = String(payload?.buyer_name || "").trim();
                const email = String(payload?.buyer_email || "").trim();
                const phone = String(payload?.buyer_phone || "").trim();
                if (!name) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        "buyer_name is required when buyer_type is walk_in",
                    ]);
                }
                if (!email || !email.includes("@")) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        "buyer_email is required when buyer_type is walk_in",
                    ]);
                }
                clientForPdf = {
                    full_name: name,
                    email,
                    phone_number: phone || "-",
                    company_name: payload?.buyer_company_name || null,
                };

                const [[existingEmail]] = await conn.query(
                    `SELECT id FROM clients WHERE email = ? AND is_deleted = 0 LIMIT 1`,
                    [email]
                );
                if (existingEmail) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        "buyer_email already exists. Use buyer_type=client instead.",
                    ]);
                }

                const rawPassword = generatePassword(8);
                const hashedPassword = await hashPassword(rawPassword);

                clientId = await AuthModel.createClient(conn, {
                    full_name: name,
                    email,
                    password: hashedPassword,
                    show_password: rawPassword,
                    email_otp: null,
                    is_verified: 0,
                    role: "user",
                    created_by: actorId,
                    created_by_role: actorRole,
                    kyc_status: "pending",
                    country_code: payload?.country_code || null,
                    phone_number: phone || null,
                    company_name: payload?.buyer_company_name || null,
                    company_address: payload?.buyer_address || null,
                    is_initial_password_changed: "false",
                    client_type: hasClientType ? "walk_in" : undefined,
                });
            }

            const agreementIdForPdf =
                buyerTypeRaw !== "walk_in" ? toSafeInt(payload?.agreement_id) : null;
            let agreementForPdf = null;
            if (agreementIdForPdf) {
                const [[agreementRow]] = await conn.query(
                    `SELECT agreement_id, client_id, agreement_start_date, agreement_end_date
                     FROM agreements
                     WHERE agreement_id = ?
                     LIMIT 1`,
                    [agreementIdForPdf]
                );
                if (!agreementRow) {
                    throw new ApiError([STATUS_CODES.NOT_FOUND, "Agreement not found"]);
                }
                if (
                    buyerTypeRaw === "client" &&
                    clientId &&
                    Number(agreementRow.client_id) !== Number(clientId)
                ) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        "agreement_id does not belong to this client",
                    ]);
                }
                agreementForPdf = agreementRow;
            }

            const invoiceUniqueId = await generatePrefixedId(
                conn,
                "invoices",
                "invoice_unique_id",
                "INV"
            );

            // Pre-validate and lock sellable items
            const assetIds = [];
            const systemIds = [];
            const serverRequests = [];
            const gatewayRequests = [];

            for (const item of items) {
                const itemType = String(item?.item_type || "").trim().toLowerCase();
                if (!itemType) {
                    throw new ApiError([STATUS_CODES.BAD_REQUEST, "item_type is required"]);
                }

                if (itemType === "asset") {
                    const assetId = toSafeInt(item?.item_ref_id ?? item?.asset_id);
                    if (!assetId) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            "asset item_ref_id(asset_id) must be a positive integer",
                        ]);
                    }
                    assetIds.push(assetId);
                    continue;
                }

                if (itemType === "system") {
                    const systemId = toSafeInt(item?.item_ref_id ?? item?.system_id);
                    if (!systemId) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            "system item_ref_id(system_id) must be a positive integer",
                        ]);
                    }
                    systemIds.push(systemId);
                    continue;
                }

                if (itemType === "server") {
                    const serverId = toSafeInt(item?.item_ref_id ?? item?.server_id);
                    const qty = toSafeInt(item?.quantity) ?? 1;
                    if (!serverId) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            "server item_ref_id(server_id) must be a positive integer",
                        ]);
                    }
                    serverRequests.push({ id: serverId, qty });
                    continue;
                }

                if (itemType === "gsm_gateway") {
                    const gatewayId = toSafeInt(item?.item_ref_id ?? item?.gateway_id);
                    const qty = toSafeInt(item?.quantity) ?? 1;
                    if (!gatewayId) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            "gsm_gateway item_ref_id(gateway_id) must be a positive integer",
                        ]);
                    }
                    gatewayRequests.push({ id: gatewayId, qty });
                    continue;
                }

                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    `Unsupported item_type: ${itemType}`,
                ]);
            }

            const uniqueAssetIds = [...new Set(assetIds)];
            const uniqueSystemIds = [...new Set(systemIds)];

            if (uniqueAssetIds.length) {
                const [assetRows] = await conn.query(
                    `SELECT asset_id, status, is_available, is_deleted, serial_number, brand, model
                     FROM assets
                     WHERE asset_id IN (?)
                     FOR UPDATE`,
                    [uniqueAssetIds]
                );
                const byId = new Map(assetRows.map((r) => [Number(r.asset_id), r]));
                const missing = uniqueAssetIds.filter((id) => !byId.has(id));
                if (missing.length) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `Assets not found: ${missing.join(", ")}`,
                    ]);
                }
                const invalid = assetRows.filter(
                    (a) =>
                        a.is_deleted ||
                        Number(a.is_available) !== 1 ||
                        String(a.status) !== "in_stock"
                );
                if (invalid.length) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `Assets not sellable (must be in_stock & is_available=1): ${invalid
                            .map((a) => a.asset_id)
                            .join(", ")}`,
                    ]);
                }
            }

            if (uniqueSystemIds.length) {
                const [systemRows] = await conn.query(
                    `SELECT id, system_uid, client_id, is_deleted${
                        hasSystemAvailabilityType ? ", availability_type" : ""
                    }
                     FROM systems
                     WHERE id IN (?)
                     FOR UPDATE`,
                    [uniqueSystemIds]
                );
                const byId = new Map(systemRows.map((r) => [Number(r.id), r]));
                const missing = uniqueSystemIds.filter((id) => !byId.has(id));
                if (missing.length) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `Systems not found: ${missing.join(", ")}`,
                    ]);
                }
                const invalid = systemRows.filter((s) => {
                    if (s.is_deleted) return true;
                    if (s.client_id !== null) return true;
                    if (!hasSystemAvailabilityType) return false;
                    const type = s?.availability_type
                        ? String(s.availability_type).trim().toLowerCase()
                        : "available";
                    return type !== "available";
                });
                if (invalid.length) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `Systems not sellable (must be available & unallocated & not deleted): ${invalid
                            .map((s) => s.id)
                            .join(", ")}`,
                    ]);
                }
            }

            const serverQtyById = new Map();
            for (const req of serverRequests) {
                serverQtyById.set(req.id, (serverQtyById.get(req.id) || 0) + req.qty);
            }
            const gatewayQtyById = new Map();
            for (const req of gatewayRequests) {
                gatewayQtyById.set(req.id, (gatewayQtyById.get(req.id) || 0) + req.qty);
            }

            const serverIds = [...serverQtyById.keys()];
            const gatewayIds = [...gatewayQtyById.keys()];

            if (serverIds.length) {
                const [rows] = await conn.query(
                    `
                    SELECT
                      s.id,
                      s.total_quantity,
                      s.status,
                      s.is_deleted,
                      (
                        SELECT COALESCE(SUM(csa.allocated_quantity), 0)
                        FROM client_server_allocations csa
                        WHERE csa.server_id = s.id
                      ) AS allocated_qty,
                      (
                        SELECT COALESCE(SUM(CASE WHEN im.movement_type='sale' THEN im.qty ELSE 0 END), 0)
                             - COALESCE(SUM(CASE WHEN im.movement_type='sale_void' THEN im.qty ELSE 0 END), 0)
                        FROM inventory_movements im
                        WHERE im.item_type = 'server'
                          AND im.item_id = s.id
                      ) AS sold_qty
                    FROM servers s
                    WHERE s.id IN (?)
                    FOR UPDATE
                    `,
                    [serverIds]
                );

                const byId = new Map(rows.map((r) => [Number(r.id), r]));
                const missing = serverIds.filter((id) => !byId.has(id));
                if (missing.length) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `Servers not found: ${missing.join(", ")}`,
                    ]);
                }

                for (const id of serverIds) {
                    const row = byId.get(id);
                    if (row.is_deleted || String(row.status) !== "active") {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            `Server #${id} is not active`,
                        ]);
                    }
                    const requested = serverQtyById.get(id) || 0;
                    const totalQty = Number(row.total_quantity || 0);
                    const allocated = Number(row.allocated_qty || 0);
                    const sold = Number(row.sold_qty || 0);
                    const available = Math.max(0, totalQty - allocated - sold);
                    if (requested > available) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            `Server #${id} not enough quantity. Available ${available}, requested ${requested}`,
                        ]);
                    }
                }
            }

            if (gatewayIds.length) {
                const [rows] = await conn.query(
                    `
                    SELECT
                      g.id,
                      g.total_quantity,
                      g.status,
                      g.is_deleted,
                      (
                        SELECT COALESCE(SUM(cga.allocated_quantity), 0)
                        FROM client_gsm_gateway_allocations cga
                        WHERE cga.gateway_id = g.id
                      ) AS allocated_qty,
                      (
                        SELECT COALESCE(SUM(CASE WHEN im.movement_type='sale' THEN im.qty ELSE 0 END), 0)
                             - COALESCE(SUM(CASE WHEN im.movement_type='sale_void' THEN im.qty ELSE 0 END), 0)
                        FROM inventory_movements im
                        WHERE im.item_type = 'gsm_gateway'
                          AND im.item_id = g.id
                      ) AS sold_qty
                    FROM gsm_gateways g
                    WHERE g.id IN (?)
                    FOR UPDATE
                    `,
                    [gatewayIds]
                );

                const byId = new Map(rows.map((r) => [Number(r.id), r]));
                const missing = gatewayIds.filter((id) => !byId.has(id));
                if (missing.length) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `GSM Gateways not found: ${missing.join(", ")}`,
                    ]);
                }

                for (const id of gatewayIds) {
                    const row = byId.get(id);
                    if (row.is_deleted || String(row.status) !== "active") {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            `GSM Gateway #${id} is not active`,
                        ]);
                    }
                    const requested = gatewayQtyById.get(id) || 0;
                    const totalQty = Number(row.total_quantity || 0);
                    const allocated = Number(row.allocated_qty || 0);
                    const sold = Number(row.sold_qty || 0);
                    const available = Math.max(0, totalQty - allocated - sold);
                    if (requested > available) {
                        throw new ApiError([
                            STATUS_CODES.BAD_REQUEST,
                            `GSM Gateway #${id} not enough quantity. Available ${available}, requested ${requested}`,
                        ]);
                    }
                }
            }

            // Build line items (invoice_line_items) and movements (inventory_movements)
            const invoiceLineItems = [];
            const movementRows = [];
            let totalAmount = 0;

            for (const item of items) {
                const itemType = String(item?.item_type || "").trim().toLowerCase();
                const unitPrice = toSafeNumber(item?.unit_price);
                if (unitPrice === null || unitPrice < 0) {
                    throw new ApiError([
                        STATUS_CODES.BAD_REQUEST,
                        `Invalid unit_price for item_type ${itemType}`,
                    ]);
                }

                if (itemType === "asset") {
                    const assetId = toSafeInt(item?.item_ref_id ?? item?.asset_id);
                    const description =
                        String(item?.description || "").trim() || `Asset #${assetId}`;
                    const amount = unitPrice;
                    totalAmount += amount;

                    invoiceLineItems.push({
                        agreement_id: null,
                        item_type: "asset",
                        item_ref_id: assetId,
                        description,
                        quantity: 1,
                        unit_price: unitPrice,
                        amount,
                    });

                    movementRows.push({
                        item_type: "asset",
                        item_id: assetId,
                        qty: 1,
                        movement_type: "sale",
                        reference_type: "invoice",
                        client_id: clientId,
                        unit_price: unitPrice,
                        amount,
                        note: "Manual sale",
                        created_by_role: actorRole,
                        created_by: actorId,
                    });

                    continue;
                }

                if (itemType === "system") {
                    const systemId = toSafeInt(item?.item_ref_id ?? item?.system_id);
                    const description =
                        String(item?.description || "").trim() || `System #${systemId}`;
                    const amount = unitPrice;
                    totalAmount += amount;

                    invoiceLineItems.push({
                        agreement_id: null,
                        item_type: "system",
                        item_ref_id: systemId,
                        description,
                        quantity: 1,
                        unit_price: unitPrice,
                        amount,
                    });

                    movementRows.push({
                        item_type: "system",
                        item_id: systemId,
                        qty: 1,
                        movement_type: "sale",
                        reference_type: "invoice",
                        client_id: clientId,
                        unit_price: unitPrice,
                        amount,
                        note: "Manual sale",
                        created_by_role: actorRole,
                        created_by: actorId,
                    });

                    continue;
                }

                if (itemType === "server") {
                    const serverId = toSafeInt(item?.item_ref_id ?? item?.server_id);
                    const qty = toSafeInt(item?.quantity) ?? 1;
                    const description =
                        String(item?.description || "").trim() || `Server #${serverId}`;
                    const amount = unitPrice * qty;
                    totalAmount += amount;

                    invoiceLineItems.push({
                        agreement_id: null,
                        item_type: "server",
                        item_ref_id: serverId,
                        description,
                        quantity: qty,
                        unit_price: unitPrice,
                        amount,
                    });

                    movementRows.push({
                        item_type: "server",
                        item_id: serverId,
                        qty,
                        movement_type: "sale",
                        reference_type: "invoice",
                        client_id: clientId,
                        unit_price: unitPrice,
                        amount,
                        note: "Manual sale",
                        created_by_role: actorRole,
                        created_by: actorId,
                    });

                    continue;
                }

                if (itemType === "gsm_gateway") {
                    const gatewayId = toSafeInt(item?.item_ref_id ?? item?.gateway_id);
                    const qty = toSafeInt(item?.quantity) ?? 1;
                    const description =
                        String(item?.description || "").trim() ||
                        `GSM Gateway #${gatewayId}`;
                    const amount = unitPrice * qty;
                    totalAmount += amount;

                    invoiceLineItems.push({
                        agreement_id: null,
                        item_type: "gsm_gateway",
                        item_ref_id: gatewayId,
                        description,
                        quantity: qty,
                        unit_price: unitPrice,
                        amount,
                    });

                    movementRows.push({
                        item_type: "gsm_gateway",
                        item_id: gatewayId,
                        qty,
                        movement_type: "sale",
                        reference_type: "invoice",
                        client_id: clientId,
                        unit_price: unitPrice,
                        amount,
                        note: "Manual sale",
                        created_by_role: actorRole,
                        created_by: actorId,
                    });

                    continue;
                }
            }

            if (totalAmount <= 0) {
                throw new ApiError([
                    STATUS_CODES.BAD_REQUEST,
                    "Total amount must be greater than 0",
                ]);
            }

            const invoiceId = await InvoiceModel.insertInvoice(conn, {
                invoice_unique_id: invoiceUniqueId,
                client_id: clientId,
                agreement_id: agreementIdForPdf || null,
                invoice_type: "manual",
                buyer_type: buyerTypeRaw,
                created_by_role: actorRole,
                created_by: actorId,
                rent_amount: totalAmount,
                carried_forward_amount: 0,
                total_amount: totalAmount,
                due_date: dueDate,
                invoice_month: invoiceMonth,
            });

            const lineItemsForInsert = invoiceLineItems.map((li) => ({
                ...li,
                invoice_id: invoiceId,
            }));
            await InvoiceModel.insertInvoiceLineItemsTx(conn, lineItemsForInsert);

            // Attach invoice id to movement references
            const movementsForInsert = movementRows.map((m) => ({
                ...m,
                reference_id: invoiceId,
            }));
            await InventoryMovementModel.insertInventoryMovementsTx(
                conn,
                movementsForInsert
            );

            if (uniqueSystemIds.length) {
                const updates = { client_id: clientId };
                if (hasSystemAvailabilityType) {
                    updates.availability_type = "sold";
                }

                const fields = Object.keys(updates)
                    .map((k) => `${k} = ?`)
                    .join(", ");

                await conn.query(
                    `UPDATE systems
                     SET ${fields}, updated_at = NOW()
                     WHERE id IN (?)
                       AND is_deleted = 0`,
                    [...Object.values(updates), uniqueSystemIds]
                );
            }

            // Update assets table for sold items (servers/gateways are tracked via movements)
            if (uniqueAssetIds.length) {
                await conn.query(
                    `UPDATE assets
                     SET status = 'sold',
                         is_available = 0,
                         updated_at = NOW()
                     WHERE asset_id IN (?)
                       AND is_deleted = 0
                       AND status = 'in_stock'
                       AND is_available = 1`,
                    [uniqueAssetIds]
                );
            }

            const persistedLineItems = await InvoiceModel.listInvoiceLineItemsTx(
                conn,
                invoiceId
            );

            const pdfPath = await generateInvoicePDF(
                {
                    invoice_unique_id: invoiceUniqueId,
                    total_amount: totalAmount,
                    due_date: dueDate,
                    rent_amount: totalAmount,
                    carried_forward_amount: 0,
                    status: "pending",
                    invoice_month: invoiceMonth,
                },
                clientForPdf,
                agreementForPdf,
                null,
                persistedLineItems
            );

            await conn.query(
                `UPDATE invoices SET invoice_pdf = ? WHERE invoice_id = ?`,
                [pdfPath, invoiceId]
            );

            if (clientId) {
                await LedgerModel.insertLedgerEntry(conn, {
                    client_id: clientId,
                    invoice_id: invoiceId,
                    entry_type: "debit",
                    amount: totalAmount,
                    description: "Manual invoice created",
                    reference_type: "invoice",
                    reference_id: invoiceId,
                });
            }

            await InvoiceModel.insertInvoiceLog(conn, {
                invoice_id: invoiceId,
                action: "created",
                changed_by: actorId,
                note: "Manual invoice created",
            });

            return {
                invoice_id: invoiceId,
                invoice_unique_id: invoiceUniqueId,
                invoice_pdf: pdfPath ? buildPublicFileUrl(pdfPath) : null,
            };
        }

        const {
            client_id,
            agreement_id,
            rent_amount,
            due_date,
            invoice_month,
        } = payload;

        const previousDue = await LedgerModel.getClientRemainingBalance(
            conn,
            client_id
        );

        const breakdown = await computeAgreementRentBreakdownTx(conn, agreement_id);
        const rentFromAgreement = Number(breakdown?.totals?.rent || 0);
        const rentAmount =
            rentFromAgreement > 0 ? rentFromAgreement : Number(rent_amount || 0);
        const carriedForwardAmount = Number(previousDue || 0);
        const totalAmount = rentAmount + carriedForwardAmount;

        // 🔥 1. Generate Invoice Unique ID
        const invoiceUniqueId = await generatePrefixedId(
            conn,
            "invoices",
            "invoice_unique_id",
            "INV"
        );

        // 🔥 2. Fetch client (for PDF)
        const [[client]] = await conn.query(
            `SELECT full_name, email, phone_number, company_name 
            FROM clients WHERE id = ?`,
            [client_id]
        );

        // 🔥 3. Fetch agreement (for PDF)
        const [[agreement]] = await conn.query(
            `SELECT agreement_start_date, agreement_end_date 
            FROM agreements WHERE agreement_id = ?`,
            [agreement_id]
        );

        // 🔥 4. Create invoice
        const invoiceId = await InvoiceModel.insertInvoice(conn, {
            invoice_unique_id: invoiceUniqueId,
            client_id,
            agreement_id,
            rent_amount: rentAmount,
            carried_forward_amount: carriedForwardAmount,
            total_amount: totalAmount,
            due_date,
            invoice_month,
        });

        // 🔥 5. Generate PDF
        const baseLineItems = [
            ...(breakdown.systems || []).map((row) => ({
                invoice_id: invoiceId,
                agreement_id,
                item_type: "system",
                item_ref_id: row.system_id,
                description:
                    row?.system_uid || row?.system_uuid
                        ? `System ${row.system_uid || row.system_uuid}`
                        : `System #${row.system_id}`,
                quantity: 1,
                unit_price: Number(row?.system_price || 0),
                amount: Number(row?.system_price || 0),
            })),
            ...(breakdown.gsm_gateways || []).map((row) => ({
                invoice_id: invoiceId,
                agreement_id,
                item_type: "gsm_gateway",
                item_ref_id: row.gateway_id,
                description: row?.gateway_name
                    ? `GSM Gateway ${row.gateway_name}`
                    : `GSM Gateway #${row.gateway_id}`,
                quantity: Number(row?.allocated_quantity || 0),
                unit_price: Number(row?.price_per_unit || 0),
                amount: Number(row?.total_price || 0),
            })),
            ...(breakdown.servers || []).map((row) => ({
                invoice_id: invoiceId,
                agreement_id,
                item_type: "server",
                item_ref_id: row.server_id,
                description: row?.server_name
                    ? `Server ${row.server_name}`
                    : `Server #${row.server_id}`,
                quantity: Number(row?.allocated_quantity || 0),
                unit_price: Number(row?.price_per_unit || 0),
                amount: Number(row?.total_price || 0),
            })),
        ];
        await InvoiceModel.insertInvoiceLineItemsTx(conn, baseLineItems);

        const invoiceLineItems = await InvoiceModel.listInvoiceLineItemsTx(
            conn,
            invoiceId
        );

        const pdfPath = await generateInvoicePDF(
            {
                invoice_unique_id: invoiceUniqueId,
                total_amount: totalAmount,
                due_date,
                rent_amount: rentAmount,
                carried_forward_amount: carriedForwardAmount,
                status: "pending",
                invoice_month,
            },
            client,
            agreement,
            breakdown,
            invoiceLineItems
        );

        // 🔥 6. Save PDF path
        await conn.query(
            `UPDATE invoices SET invoice_pdf = ? WHERE invoice_id = ?`,
            [pdfPath, invoiceId]
        );

        // 🔥 7. Ledger DEBIT
        await LedgerModel.insertLedgerEntry(conn, {
            client_id,
            invoice_id: invoiceId,
            entry_type: "debit",
            amount: rentAmount,
            description: "Manual invoice created",
            reference_type: "invoice",
            reference_id: invoiceId,
        });

        // 🔥 8. Log
        await InvoiceModel.insertInvoiceLog(conn, {
            invoice_id: invoiceId,
            action: "created",
            changed_by: user.admin_id || user.employee_id,
            note: "Manual invoice created",
        });

        return {
            invoice_id: invoiceId,
            invoice_unique_id: invoiceUniqueId,
            invoice_pdf: pdfPath ? buildPublicFileUrl(pdfPath) : null,
        };
    });
};

export const getInvoiceLogs = async (invoiceId) => {
    return InvoiceModel.getInvoiceLogs(invoiceId);
};

export const setInvoiceUrgency = async (invoiceId, isUrgent, user) => {
    return withTransaction(async (conn) => {
        const invoice = await InvoiceModel.getInvoiceById(conn, invoiceId);

        if (!invoice) {
            throw new ApiError([STATUS_CODES.NOT_FOUND, "Invoice not found"]);
        }

        const invoiceStatus = invoice?.status
            ? String(invoice.status).trim().toLowerCase()
            : null;

        if (invoiceStatus === "paid" && Number(isUrgent) === 1) {
            throw new ApiError([
                STATUS_CODES.BAD_REQUEST,
                "Paid invoice cannot be marked urgent",
            ]);
        }

        const safeUrgency = Number(isUrgent) === 1 ? 1 : 0;

        await InvoiceModel.updateInvoiceUrgencyTx(conn, invoiceId, safeUrgency);

        await InvoiceModel.insertInvoiceLog(conn, {
            invoice_id: invoiceId,
            action: safeUrgency ? "urgent_on" : "urgent_off",
            changed_by: user.admin_id || user.employee_id,
            note: safeUrgency
                ? "Invoice marked as urgent"
                : "Invoice urgency removed",
        });

        return { invoice_id: invoiceId, is_urgent: safeUrgency };
    });
};
