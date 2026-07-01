import path from "path";
import { readFile } from "fs/promises";
import handlebars from "handlebars";
import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";
import Msg from "./messages.util.js";
import { env } from "../config/env.js";
import { smtpConfig, __dirname, LOGO_URL, SENDGRID_API_KEY, FROM_EMAIL, API_URL, SENDGRID_API_KEY_HELLO, FROM_EMAIL_HELLO } from '../constants.js';


handlebars.registerHelper("eq", (a, b) => a === b);

/* =========================================================
   🔴 SMTP TRANSPORTER (OPTIONAL / FALLBACK) (CURRENT ACTIVE)
========================================================= */


const smtpTransporter = nodemailer.createTransport({
  host: smtpConfig.SMTP_HOST,
  port: smtpConfig.SMTP_PORT || 587,
  secure: false, // true only for 465
  auth: {
    user: smtpConfig.EMAIL_USER,
    pass: smtpConfig.EMAIL_PASS,
  },
  requireTLS: true,
  connectionTimeout: 10000,
});

// Optional: SMTP connection test
// smtpTransporter.verify((error, success) => {
//   if (error) {
//     console.error("❌ SMTP Connection Error:", error);
//   } else {
//     console.log("✅ SMTP Server Ready");
//   }
// });


// 🔴 SMTP EMAIL SENDER (COMPLETE)
const resolveFromAddress = (from) =>
  from ||
  smtpConfig.SMTP_FROM_EMAIL ||
  smtpConfig.HELLO_FROM_EMAIL ||
  smtpConfig.EVENT_FROM_EMAIL ||
  smtpConfig.ADMIN_EMAIL ||
  smtpConfig.EMAIL_USER;

const sendEmail = async ({ to, subject, html, from }) => {
  try {
    const mailOptions = {
      from: resolveFromAddress(from),
      to,
      subject,
      html,
    };

    await smtpTransporter.sendMail(mailOptions);
    console.log(`📧 SMTP email sent → ${to}`);
  } catch (error) {
    console.error("❌ SMTP send error:", error);
    throw new Error(Msg.errorToSendingEmail);
  }
};

/* =========================================================
   🟢 SENDGRID EMAIL SENDER (CURRENT INACTIVE)
========================================================= */

// const sendEmail = async ({ to, subject, html, useAccount = "default" }) => {
//   const apiKey =
//     useAccount === "hello"
//       ? env.SENDGRID_API_KEY_HELLO
//       : env.SENDGRID_API_KEY;

//   const fromEmail =
//     useAccount === "hello"
//       ? env.FROM_EMAIL_HELLO
//       : env.FROM_EMAIL;

//   sgMail.setApiKey(apiKey);

//   const msg = {
//     to,
//     from: fromEmail,
//     subject,
//     html,
//   };

//   try {
//     await sgMail.send(msg);
//     console.log(`📧 Email sent → ${to} (${useAccount})`);
//   } catch (error) {
//     console.error(
//       "❌ SendGrid Error:",
//       error?.response?.body || error.message
//     );
//     throw new Error(Msg.errorToSendingEmail);
//   }
// };

/* =========================================================
   📩 OTP VERIFICATION EMAIL
========================================================= */

export const sendOtpVerificationEmail = async ({ email, otp }) => {
  try {
     const context = {
      logo_url: env.LOGO_URL,
      email_title: Msg.accountActivate,
      heading: Msg.confirmYourEmailAddress,
      message: Msg.verifiedMessage,
      verification_code: otp,

      // ✅ FIXED HERE
      company_name: env.APP_NAME,

      support_url: "#",
      support_text: "We are here to help you out",
    };

    const templatePath = path.join(
      process.cwd(),
      "src",
      "views",
      "otp_mail_template.handlebars"
    );

    const source = await readFile(templatePath, "utf-8");
    const template = handlebars.compile(source);
    const html = template(context);

    await sendEmail({
      to: email,
      subject: Msg.otpVerification,
      html,
      useAccount: "hello",
    });
  } catch (error) {
    console.error("❌ Error sending OTP email:", error);
    throw new Error(Msg.errorToSendingEmail);
  }
};


export const sendForgotPasswordEmail = async ({ email, otp }) => {
  const context = {
    logo_url: env.LOGO_URL,
    email_title: Msg.resetPasswordTitle,
    heading: Msg.resetPasswordHeading,
    message: Msg.resetPasswordMessage,
    verification_code: otp,
    company_name: env.APP_NAME,
    support_url: "#",
    support_text: "We are here to help you out",
  };

  const templatePath = path.join(
    process.cwd(),
    "src",
    "views",
    "otp_mail_template.handlebars"
  );

  const source = await readFile(templatePath, "utf-8");
  const template = handlebars.compile(source);
  const html = template(context);

  await sendEmail({
    to: email,
    subject: Msg.resetPasswordSubject,
    html,
    useAccount: "hello",
  });
};


/**
 * Send Forgot Password Reset Link Email
 */
export const sendForgotPasswordLinkEmail = async ({ email, resetLink }) => {
  try {
    const context = {
      logo_url: env.LOGO_URL,
      email_title: Msg.resetPasswordTitle,
      heading: Msg.resetPasswordHeading,
      message: Msg.resetPasswordMessage,
      reset_link: resetLink,
      company_name: env.APP_NAME, // Swagat Rentals
      support_url: "#",
      support_text: "We are here to help you out",
    };

    const templatePath = path.join(
      process.cwd(),
      "src",
      "views",
      "forgot_password_template.handlebars"
    );

    const source = await readFile(templatePath, "utf-8");
    const template = handlebars.compile(source);
    const html = template(context);

    await sendEmail({
      to: email,
      subject: Msg.resetPasswordSubject,
      html,
      useAccount: "hello",
    });

    console.log(`📧 Forgot password email sent → ${email}`);
  } catch (error) {
    console.error("❌ Error sending forgot password email:", error);
    throw new Error(Msg.errorToSendingEmail);
  }
};

/**
 * Send welcome email when admin creates a client
 */
export const sendClientCreatedEmail = async ({ email, full_name, resetLink }) => {
  try {
    const context = {
      logo_url: env.LOGO_URL,
      email_title: Msg.clientWelcomeTitle,
      heading: Msg.clientWelcomeHeading,
      message: Msg.clientWelcomeMessage,
      reset_link: resetLink,
      full_name,
      company_name: env.APP_NAME,
      support_url: "#",
      support_text: "We are here to help you out",
    };

    const templatePath = path.join(
      process.cwd(),
      "src",
      "views",
      "client_created_template.handlebars"
    );

    const source = await readFile(templatePath, "utf-8");
    const template = handlebars.compile(source);
    const html = template(context);

    await sendEmail({
      to: email,
      subject: Msg.clientWelcomeSubject,
      html,
      useAccount: "hello",
    });

    console.log(`Client welcome email sent -> ${email}`);
  } catch (error) {
    console.error("Error sending client welcome email:", error);
    throw new Error(Msg.errorToSendingEmail);
  }
};

// WhatsApp onboarding (kept intentionally commented for future enablement)
export const sendClientCreatedWhatsApp = async ({
  country_code,
  mobile_no,
  full_name,
  resetLink,
}) => {
  try {
    const phone = `${country_code || ""}${mobile_no || ""}`.replace(/\s+/g, "");
    if (!phone) return;

    // Example implementation (Twilio / Meta API) kept commented as requested
    // await axios.post("https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages", {
    //   messaging_product: "whatsapp",
    //   to: phone.replace(/^\+/, ""),
    //   type: "template",
    //   template: {
    //     name: "client_welcome",
    //     language: { code: "en" },
    //     components: [
    //       {
    //         type: "body",
    //         parameters: [
    //           { type: "text", text: full_name || "Client" },
    //           { type: "text", text: resetLink || "" },
    //         ],
    //       },
    //     ],
    //   },
    // }, {
    //   headers: {
    //     Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    //     "Content-Type": "application/json",
    //   },
    // });

    console.log(
      `WhatsApp hook ready for client onboarding (currently disabled): ${phone}`
    );
  } catch (error) {
    console.error("Error preparing WhatsApp onboarding message:", error);
  }
};

export const sendEmployeeCreatedEmail = async ({ email, full_name, temp_password }) => {
  try {
    const context = {
      logo_url: env.LOGO_URL,
      email_title: Msg.employeeWelcomeTitle,
      heading: Msg.employeeWelcomeHeading,
      message: Msg.employeeWelcomeMessage,
      full_name,
      temp_password,
      company_name: env.APP_NAME,
      support_url: "#",
      support_text: "We are here to help you out",
    };

    const templatePath = path.join(
      process.cwd(),
      "src",
      "views",
      "employee_created_template.handlebars"
    );

    const source = await readFile(templatePath, "utf-8");
    const template = handlebars.compile(source);
    const html = template(context);

    await sendEmail({
      to: email,
      subject: Msg.employeeWelcomeSubject,
      html,
      useAccount: "hello",
    });

    console.log(`Employee welcome email sent -> ${email}`);
  } catch (error) {
    console.error("Error sending employee welcome email:", error);
    throw new Error(Msg.errorToSendingEmail);
  }
};

export const sendDeviceAssignedEmail = async ({
  email,
  full_name,
  device_uid,
  device_type,
  client_name,
  installation_date,
}) => {
  try {
    const context = {
      logo_url: env.LOGO_URL,
      email_title: Msg.deviceAssignedSubject,
      heading: "Device Assigned",
      message: "A device has been assigned to you by admin.",
      full_name,
      device_uid,
      device_type,
      client_name,
      installation_date,
      company_name: env.APP_NAME,
      support_url: "#",
      support_text: "We are here to help you out",
    };

    const templatePath = path.join(
      process.cwd(),
      "src",
      "views",
      "device_assignment_template.handlebars"
    );

    const source = await readFile(templatePath, "utf-8");
    const template = handlebars.compile(source);
    const html = template(context);

    await sendEmail({
      to: email,
      subject: Msg.deviceAssignedSubject,
      html,
      useAccount: "hello",
    });
  } catch (error) {
    console.error("Error sending device assigned email:", error);
  }
};

export const sendDeviceUnassignedEmail = async ({
  email,
  full_name,
  device_uid,
  device_type,
  client_name,
}) => {
  try {
    const context = {
      logo_url: env.LOGO_URL,
      email_title: Msg.deviceUnassignedSubject,
      heading: "Device Unassigned",
      message: "A device has been unassigned from you by admin.",
      full_name,
      device_uid,
      device_type,
      client_name,
      company_name: env.APP_NAME,
      support_url: "#",
      support_text: "We are here to help you out",
    };

    const templatePath = path.join(
      process.cwd(),
      "src",
      "views",
      "device_assignment_template.handlebars"
    );

    const source = await readFile(templatePath, "utf-8");
    const template = handlebars.compile(source);
    const html = template(context);

    await sendEmail({
      to: email,
      subject: Msg.deviceUnassignedSubject,
      html,
      useAccount: "hello",
    });
  } catch (error) {
    console.error("Error sending device unassigned email:", error);
  }
};

export const sendMail = async ({
    to,
    subject,
    html,
    attachments = [],
}) => {
    try {
        const info = await transporter.sendMail({
            from: `"Your Company" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html,
            attachments,
        });

        console.log(
            `Email sent successfully: ${info.messageId}`
        );

        return info;
    } catch (error) {
        console.error("MAIL ERROR =>", error);
        throw error;
    }
};