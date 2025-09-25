import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

export const sendPayLaterEmail = async (to, orderId, paymentUrl) => {
  const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.EMAIL_PASSWORD
  },
  connectionTimeout: 10000,
  tls: {
    rejectUnauthorized: false
  }
});



  const mailOptions = {
    from: `"PayLater Payment" <${process.env.EMAIL_FROM}>`,
    to,
    subject: `Complete your payment for Order #${orderId}`,
    html: `
      <p>Hi,</p>
      <p>Thank you for placing your order. Please complete your payment using the link below:</p>
      <p><a href="${paymentUrl}">Pay with PayLater</a></p>
      <p>Once payment is completed, your order will be processed.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};
