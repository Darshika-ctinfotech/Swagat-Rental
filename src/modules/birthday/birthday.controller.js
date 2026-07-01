import { getTodayBirthdays } from "../../services/birthday.services.js";
import transporter from "../../config/mailer.js";       // <---------------------------------
import birthdayTemplate from "../../templates/birthday.Template.js";
import {apiHandler} from "../../utils/api.util.js"
export const sendBirthdayMails = async (req, res) => {
  try {
    const clients = await getTodayBirthdays();

    let sentCount = 0;

    for (const client of clients) {
      await transporter.sendMail({
        from: `"Swagt Rental" <${process.env.MAIL_USER}>`,
        to: client.email,
        subject: "🎉 Happy Birthday from Swagt Rental",
        html: birthdayTemplate(client.name),
      });

      sentCount++;
    }

    return res.status(200).json({
      success: true,
      totalClients: clients.length,
      sentCount,
    });
  } catch (error) {
    console.error("Birthday Mail Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getUserProfile = apiHandler(async (req, res) => {
  const clientId = Number(req.params.id);

  if (!Number.isInteger(clientId)) {
    throw new Error("Invalid client id");
  }

  const client = await UserService.getUserProfileById(clientId);

  return apiResponse(
    [STATUS_CODES.OK, Msg.profileFetched],
    "Client",
    client,
    res,
    "object"
  );
});