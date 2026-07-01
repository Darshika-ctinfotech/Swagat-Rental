import admin from "firebase-admin";
import { readFileSync } from "fs";
import { join } from "path";

const serviceAccountPath = join(process.cwd(), "firebase-service-account.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export async function sendPushToAllClients(pool, title, body) {
  try {
  
      const [rows] = await pool.query(
      "SELECT fcm_token FROM clients WHERE fcm_token IS NOT NULL AND fcm_token != ''"
    );
    
    if (rows.length === 0) {
      console.log("No Token Found In DataBase");
      return { success: false, message: "No registered devices found in database." };
    }

    const allTokens = rows.map(row => row.fcm_token);
    console.log(`Sending to ${allTokens.length} devices`);

    let totalSuccessCount = 0;
    let totalFailureCount = 0;
    const failedTokens = [];


    const CHUNK_SIZE = 500;
    for (let i = 0; i < allTokens.length; i += CHUNK_SIZE) {
      const tokenChunk = allTokens.slice(i, i + CHUNK_SIZE);

      const message = {
        notification: { title, body },
        tokens: tokenChunk,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      
      totalSuccessCount += response.successCount;
      totalFailureCount += response.failureCount;

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            if (errCode === 'messaging/invalid-registration-token' ||
                errCode === 'messaging/registration-token-not-registered') {
              failedTokens.push(tokenChunk[idx]);
            }
          }
        });
      }
    }
    if (failedTokens.length > 0) {
      await pool.query(
        "UPDATE clients SET fcm_token = NULL WHERE fcm_token IN (?)", 
        [failedTokens]
      );
      console.log(`Cleaned up ${failedTokens.length} expired tokens.`);
    }

    return {
      success: true,
      successCount: totalSuccessCount,
      failureCount: totalFailureCount
    };

  } catch (error) {
    console.error("❌ Error inside sendPushToAllClients service:", error);
    throw error;
  }
}
export async function sendPushToClient(pool, clientId, title, body) {
  try {
    const [rows] = await pool.query(
      "SELECT fcm_token FROM clients WHERE id = ? LIMIT 1",
      [clientId]
    );

    if (rows.length === 0) {
      console.log(`[Push] Client not found for client_id ${clientId}`);
      return { success: false, message: "Client not found." };
    }

    const fcmToken = rows[0].fcm_token;

    if (!fcmToken) {
      console.log(`[Push] No FCM token found for client_id ${clientId}`);
      return { success: false, message: "FCM token not found for this client." };
    }

    const message = {
      notification: { title, body },
      token: fcmToken,
    };

    try {
      const response = await admin.messaging().send(message);
      console.log(`[Push] Sent to client_id ${clientId}, messageId: ${response}`);
      return { success: true, messageId: response };
    } catch (sendError) {
      const errCode = sendError?.code;

      // token is dead/invalid -> clean it up
      if (
        errCode === "messaging/invalid-registration-token" ||
        errCode === "messaging/registration-token-not-registered"
      ) {
        await pool.query(
          "UPDATE clients SET fcm_token = NULL WHERE id = ?",
          [clientId]
        );
        console.log(`[Push] Invalid/expired token cleaned up for client_id ${clientId}`);
        return { success: false, message: "FCM token was invalid and has been removed." };
      }

      console.error(`[Push] Failed to send to client_id ${clientId}:`, sendError);
      return { success: false, message: sendError.message || "Failed to send push." };
    }
  } catch (error) {
    console.error("❌ Error inside sendPushToClient service:", error);
    throw error;
  }
}