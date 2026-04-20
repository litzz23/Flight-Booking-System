const nodemailer = require("nodemailer");

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  return cachedTransporter;
}

async function sendEmail(to, subject, html) {
  try {
    if (!to) {
      return null;
    }

    const transporter = getTransporter();
    if (!transporter) {
      throw new Error("EMAIL_USER and EMAIL_PASS must be configured.");
    }

    return await transporter.sendMail({
      from: `"Binayak Airlines" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("sendEmail failed:", err.message);
    return null;
  }
}

module.exports = {
  getTransporter,
  sendEmail,
};
