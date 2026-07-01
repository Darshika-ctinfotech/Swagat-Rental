import dayjs from "dayjs";

import {
    getInvoicesForReminder,
    hasEmailBeenSent,
    saveEmailLog
} from "../modules/payment/paymentRemainder.model.js";

import { sendMail } from "../utils/email.util.js";

export const processPaymentReminders = async () => {

    const invoices = await getInvoicesForReminder();

    const today = dayjs();

    for (const invoice of invoices) {

        const dueDate = dayjs(invoice.due_date);

        const daysLeft = dueDate.diff(
            today,
            "day"
        );

        let emailType = null;
        let subject = null;

        if (daysLeft === 5) {
            emailType = "PAYMENT_REMINDER_5_DAYS";
            subject = "Payment Due In 5 Days";
        }

        else if (daysLeft === 3) {
            emailType = "PAYMENT_REMINDER_3_DAYS";
            subject = "Payment Due In 3 Days";
        }

        else if (daysLeft === 0) {
            emailType = "PAYMENT_DUE_TODAY";
            subject = "Payment Due Today";
        }

        else if (
            daysLeft < 0 &&
            ["pending", "partial"].includes(
                invoice.status
            )
        ) {
            emailType = "PAYMENT_OVERDUE";
            subject = "Payment Overdue";
        }

        if (!emailType) continue;

        const alreadySent =
            await hasEmailBeenSent(
                invoice.invoice_id,
                emailType
            );

        if (alreadySent) continue;

        await sendMail({
            to: invoice.email,
            subject,
            html: `
                Hello ${invoice.full_name},
                <br><br>
                Invoice Amount:
                ₹${invoice.total_amount}
                <br>
                Due Date:
                ${invoice.due_date}
            `
        });

        await saveEmailLog(
            invoice.invoice_id,
            emailType
        );
    }
};