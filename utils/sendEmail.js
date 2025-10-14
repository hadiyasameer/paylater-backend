import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Singleton transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: 465,
  secure: true,
  auth: { user: process.env.EMAIL_FROM, pass: process.env.EMAIL_PASSWORD },
  tls: { rejectUnauthorized: false }
});

export const sendPayLaterEmail = async (to, orderId, paymentUrl) => {
  const mailOptions = {
    from: `"PayLater Payment" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `Complete your payment for Order #${orderId}`,
    html: `<p>Hi,</p><p>Please complete your payment: <a href="${paymentUrl}">Pay with PayLater</a></p>`
  };

  await transporter.sendMail(mailOptions);
};
