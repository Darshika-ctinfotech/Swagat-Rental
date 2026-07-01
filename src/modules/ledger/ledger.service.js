import * as LedgerModel from "../ledger/ledger.model.js";
import { withTransaction } from "../../utils/withTransaction.js";

export const getClientLedger = async (clientId) => {
    return withTransaction(async (conn) => {
        const entries = await LedgerModel.getLedgerByClient(conn, clientId);

        let balance = 0;

        const formatted = entries.map((row) => {
            if (row.entry_type === "debit") {
                balance += Number(row.amount);
            } else {
                balance -= Number(row.amount);
            }

            return {
                ...row,
                running_balance: balance,
            };
        });

        return formatted;
    });
};

export const getClientBalance = async (clientId) => {
    return withTransaction(async (conn) => {
        const result = await LedgerModel.getClientBalance(conn, clientId);

        return {
            total_debit: result.total_debit,
            total_credit: result.total_credit,
            balance: result.total_debit - result.total_credit,
        };
    });
};