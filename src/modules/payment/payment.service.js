import * as PaymentModel from "./payment.model.js";
import * as LedgerModel from "../ledger/ledger.model.js";
import { withTransaction } from "../../utils/withTransaction.js";
import { ApiError } from "../../utils/api.util.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import { buildPublicFileUrl } from "../../utils/file-url.util.js";

export const getDashboard = async () => {
  return withTransaction(async (conn) => {
    const data = await PaymentModel.getDashboardData(conn);

    const totalReceivable = Number(data.total_receivable || 0);
    const totalReceived = Number(data.total_received || 0);
    const totalOverdue = Number(data.total_overdue || 0);

    return {
      total_receivable: totalReceivable,
      total_received: totalReceived,
      total_pending: totalReceivable - totalReceived,
      total_overdue: totalOverdue,
    };
  });
};

const pad2 = (value) => String(value).padStart(2, "0");

const toMonthKey = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date, months) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

export const getPaymentAnalyticsLast12Months = async () => {
  return withTransaction(async (conn) => {
    const now = new Date();
    const endExclusive = addMonths(startOfMonth(now), 1); // 1st day of next month
    const startInclusive = addMonths(startOfMonth(now), -11); // include current month + previous 11

    const months = [];
    for (let i = 0; i < 12; i += 1) {
      months.push(toMonthKey(addMonths(startInclusive, i)));
    }

    const [invoiceTotals, paidCredits] = await Promise.all([
      PaymentModel.getInvoiceTotalsByMonthTx(conn, startInclusive, endExclusive),
      PaymentModel.getPaidCreditsByMonthTx(conn, startInclusive, endExclusive),
    ]);

    const totalByMonth = new Map(
      invoiceTotals.map((r) => [r.month, Number(r.total_amount || 0)])
    );
    const paidByMonth = new Map(
      paidCredits.map((r) => [r.month, Number(r.paid_amount || 0)])
    );

    const totalSeries = months.map((m) => totalByMonth.get(m) || 0);
    const paidSeries = months.map((m) => paidByMonth.get(m) || 0);
    const remainingSeries = months.map((m, idx) =>
      Math.max(0, Number(totalSeries[idx] || 0) - Number(paidSeries[idx] || 0))
    );

    return {
      range: {
        from: startInclusive.toISOString(),
        to: endExclusive.toISOString(),
      },
      labels: months,
      series: {
        total_amount: totalSeries,
        paid_amount: paidSeries,
        remaining_amount: remainingSeries,
      },
    };
  });
};

export const createPayment = async (clientId, payload) => {
  return withTransaction(async (conn) => {
    const {
      invoice_id,
      amount_paid,
      payment_mode,
      transaction_reference,
      screenshot,
    } = payload;

    // ============================
    // 1. Validate invoice
    // ============================
    const invoice = await PaymentModel.getInvoiceById(
      conn,
      invoice_id,
      clientId
    );

    if (!invoice) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Invoice not found"]);
    }

    const agreementPaymentTypeRaw = invoice?.payment_type
      ? String(invoice.payment_type).trim().toLowerCase()
      : null;
    const agreementPaymentType = ["prepaid", "postpaid"].includes(
      agreementPaymentTypeRaw
    )
      ? agreementPaymentTypeRaw
      : "prepaid";

    // ============================
    // 2. Already paid check
    // ============================
    if (invoice.status === "paid") {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Invoice already paid"]);
    }

    // ============================
    // 3. Prevent duplicate pending
    // ============================
    const existingPending =
      await PaymentModel.getPendingPaymentByInvoice(
        conn,
        invoice_id,
        clientId
      );

    if (existingPending) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        "You already have a pending payment. Please wait for admin approval.",
      ]);
    }

    // ============================
    // 4. Get already paid amount for this invoice
    // ============================
    const alreadyPaid =
      await PaymentModel.getTotalPaidAmountByInvoice(
        conn,
        invoice_id,
        clientId
      );

    const totalInvoiceAmount = Number(invoice.total_amount);
    const remainingAmount = totalInvoiceAmount - alreadyPaid;

    // ============================
    // 5. Validate amount
    // ============================
    if (amount_paid <= 0) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        "Invalid payment amount",
      ]);
    }

    // ❌ Overpayment case
    if (amount_paid > remainingAmount) {
      throw new ApiError([
        STATUS_CODES.BAD_REQUEST,
        `You are trying to pay extra amount. Remaining amount is ₹${remainingAmount}`,
      ]);
    }

    // ============================
    // 6. Insert payment (PENDING)
    // ============================
    const paymentId = await PaymentModel.insertPayment(conn, {
      invoice_id,
      client_id: clientId,
      amount_paid,
      payment_type: agreementPaymentType,
      payment_mode,
      transaction_reference: transaction_reference || null,
      screenshot,
    });

    // ============================
    // 7. Log payment
    // ============================
    await PaymentModel.insertPaymentLog(
      conn,
      paymentId,
      "created",
      clientId,
      "Payment submitted by client"
    );

    // ============================
    // 8. Decide status preview
    // ============================
    let paymentStatus = "pending";

    if (amount_paid === remainingAmount) {
      paymentStatus = "full_payment_submitted";
    } else {
      paymentStatus = "partial_payment_submitted";
    }

    return {
      payment_id: paymentId,
      status: paymentStatus,
      remaining_amount: remainingAmount - amount_paid,
    };
  });
};

export const listPayments = async (filters) => {
  const result = await PaymentModel.listPayments(filters);

  result.data = result.data.map((item) => ({
    ...item,
    invoice_pdf: item.invoice_pdf
      ? buildPublicFileUrl(item.invoice_pdf)
      : null,
    screenshot: item.screenshot ? buildPublicFileUrl(item.screenshot) : null,
  }));

  return result;
};

export const listMyPayments = async (filters) => {
  const result = await PaymentModel.listMyPayments(filters);

  result.data = result.data.map((item) => ({
    ...item,
    invoice_pdf: item.invoice_pdf
      ? buildPublicFileUrl(item.invoice_pdf)
      : null,
    screenshot: item.screenshot ? buildPublicFileUrl(item.screenshot) : null,
  }));

  return result;
};

export const updatePaymentStatus = async (
  user,
  paymentId,
  status,
  note,
  screenshot
) => {
  return withTransaction(async (conn) => {
    // 🔒 Lock row (prevents double approval)
    const payment = await PaymentModel.getPaymentByIdForUpdate(
      conn,
      paymentId
    );

    if (!payment) {
      throw new ApiError([STATUS_CODES.NOT_FOUND, "Payment not found"]);
    }

    // ❌ Prevent double processing
    if (payment.status !== "pending") {
      throw new ApiError([STATUS_CODES.BAD_REQUEST, "Payment already processed"]);
    }

    const verifiedBy = user.admin_id || user.employee_id;

    // ✅ Update payment status
    await PaymentModel.updatePaymentStatusModel(
      conn,
      paymentId,
      {
        status,
        verifiedBy,
        screenshot,
        note,
      }
    );

    // 🔥 ONLY IF APPROVED
    if (status === "approved") {
      // 1. Add ledger CREDIT
      await LedgerModel.insertLedgerEntry(conn, {
        client_id: payment.client_id,
        invoice_id: payment.invoice_id,
        entry_type: "credit",
        amount: payment.amount_paid,
        description: "Payment approved",
        reference_type: "payment",
        reference_id: paymentId,
      });

      // 2. Get invoice total
      const invoice = await PaymentModel.getInvoiceByIdTx(
        conn,
        payment.invoice_id
      );

      if (!invoice) {
        throw new ApiError([STATUS_CODES.NOT_FOUND, "Invoice not found"]);
      }

      // 3. Get total paid for this invoice
      const totalPaid = await LedgerModel.getTotalPaidForInvoice(
        conn,
        payment.invoice_id
      );

      const totalAmount = Number(invoice.total_amount || 0);
      const remainingAmount = Math.max(
        0,
        totalAmount - Number(totalPaid || 0)
      );

      // 4. Decide invoice status
      let invoiceStatus = "pending";

      if (Number(totalPaid || 0) >= totalAmount) {
        invoiceStatus = "paid";
      } else if (Number(totalPaid || 0) > 0) {
        invoiceStatus = "partial";
      }

      // 5. Update invoice
      await PaymentModel.updateInvoicePaymentSummary(conn, payment.invoice_id, {
        totalPaid,
        remainingAmount,
      });
      await PaymentModel.updateInvoiceStatus(conn, payment.invoice_id, invoiceStatus);
    }

    // 📝 Log
    await PaymentModel.insertPaymentLog(
      conn,
      paymentId,
      status,
      verifiedBy,
      note || null
    );

    return {
      payment_id: paymentId,
      status,
    };
  });
};
