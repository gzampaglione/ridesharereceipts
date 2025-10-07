// src/services/gmailService.js
const { google } = require("googleapis");

async function sendEmailViaGmail(auth, to, subject, body, isHtml = false) {
  try {
    const gmail = google.gmail({ version: "v1", auth });

    // Create email in RFC 2822 format
    const contentType = isHtml
      ? "Content-Type: text/html; charset=utf-8"
      : "Content-Type: text/plain; charset=utf-8";

    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      contentType,
      ``,
      body,
    ].join("\n");

    // Encode email in base64url format
    const encodedEmail = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedEmail,
      },
    });

    console.log("✅ Email sent successfully:", result.data.id);
    return { success: true, messageId: result.data.id };
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEmailViaGmail,
};
