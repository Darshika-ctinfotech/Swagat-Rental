// import crypto from "crypto";

// export const generateResetToken = () => {
//   const token = crypto.randomBytes(32).toString("hex");

//   const hashedToken = crypto
//     .createHash("sha256")
//     .update(token)
//     .digest("hex");

//   return { token, hashedToken };
// };


import { randomBytes, createHash } from "crypto";

export const generateResetToken = () => {
  const token = randomBytes(32).toString("hex");

  const hashedToken = createHash("sha256")
    .update(token)
    .digest("hex");

  return { token, hashedToken };
};
