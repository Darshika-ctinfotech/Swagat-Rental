
const birthdayTemplate = (clientName) => {
  return `
  <!DOCTYPE html>
  <html>
  <body style="font-family: Arial; background:#f5f5f5; padding:30px;">
  
      <div style="
        max-width:600px;
        margin:auto;
        background:#ffffff;
        padding:40px;
        border-radius:10px;
      ">

          <h1 style="color:#ff9800;">
              🎂 Happy Birthday ${clientName}!
          </h1>

          <p>
              Dear ${clientName},
          </p>

          <p>
              Wishing you a wonderful birthday filled with happiness,
              success, and memorable moments.
          </p>

          <p>
              Thank you for choosing <b>Swagt Rental</b>.
              We truly value your trust and support.
          </p>

          <p>
              May your special day bring joy and prosperity.
          </p>

          <br/>

          <p>
              Warm Regards,
          </p>

          <h3>Swagt Rental Team</h3>

      </div>

  </body>
  </html>
  `;
};
export default birthdayTemplate;