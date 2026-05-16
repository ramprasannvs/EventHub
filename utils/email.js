const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter
// const transporter = nodemailer.createTransport({
//     service: 'gmail',
//     auth: {
//         user: process.env.EMAIL_USER,
//         pass: process.env.EMAIL_PASS
//     }
// });
const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 2525,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify transporter configuration
// transporter.verify((error, success) => {
//     if (error) {
//         console.error('Email transporter verification failed:', error);
//     } else {
//         console.log('Email server is ready to send messages');
//     }
// });

// Send booking confirmation email
const sendBookingEmail = async (userEmail, userName, eventTitle) => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.warn('Email credentials not configured. Skipping email send.');
            return;
        }

        const mailOptions = {
            from: 'EventHub <ramprasann503@gmail.com>',
            to: userEmail,
            subject: `🎉 Booking Confirmed: ${eventTitle}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .event-title { font-size: 24px; font-weight: bold; color: #667eea; margin: 20px 0; }
                        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
                        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🎉 Booking Confirmed!</h1>
                        </div>
                        <div class="content">
                            <p>Hi <strong>${userName}</strong>,</p>
                            <p>Great news! Your booking has been confirmed by the event organizer.</p>
                            <div class="event-title">📆${eventTitle}</div>
                            <p>Your ticket is now active. We look forward to seeing you at the event!</p>
                            <p>If you have any questions, feel free to reach out to us.</p>
                            <p>Best regards,<br><strong>EventHub Team</strong></p>
                        </div>
                        <div class="footer">
                            <p>This is an automated email from EventHub. Please do not reply to this email.</p>
                            <p>&copy; ${new Date().getFullYear()} EventHub. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Booking confirmation email sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending booking email:', error.message);
        throw error;
    }
};

// Send OTP email
const sendOTPEmail = async (userEmail, otp, type) => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.warn('Email credentials not configured. Skipping email send.');
            return;
        }

        const isAccountVerification = type === 'account_verification';
        const title = isAccountVerification
            ? '🔐 Verify Your EventHub Account'
            : '🎫 Verify Your Event Booking';

        const message = isAccountVerification
            ? 'Welcome to EventHub! Please use the following OTP to verify your account and complete registration.'
            : 'You\'re almost there! Please use the following OTP to verify and confirm your event booking.';

        const mailOptions = {
            from: 'EventHub <ramprasann503@gmail.com>',
            to: userEmail,
            subject: title,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; text-align: center; border-radius: 0 0 10px 10px; }
                        .otp-box { background: white; border: 2px dashed #667eea; padding: 20px; margin: 30px 0; border-radius: 10px; }
                        .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea; font-family: 'Courier New', monospace; }
                        .warning { color: #e74c3c; font-size: 14px; margin-top: 20px; }
                        .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>${title}</h1>
                        </div>
                        <div class="content">
                            <p>${message}</p>
                            <div class="otp-box">
                                <p style="margin: 0; color: #666; font-size: 14px;">Your OTP Code</p>
                                <div class="otp-code">${otp}</div>
                            </div>
                            <p class="warning">⚠️ This code expires in 5 minutes</p>
                            <p style="color: #666; font-size: 14px; margin-top: 30px;">
                                If you didn't request this code, please ignore this email or contact support if you have concerns.
                            </p>
                        </div>
                        <div class="footer">
                            <p>This is an automated email from EventHub. Please do not reply to this email.</p>
                            <p>&copy; ${new Date().getFullYear()} EventHub. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        return info;
    } catch (error) {
        console.error('Error sending OTP email:', error.message);
        throw error;
    }
};

module.exports = { sendBookingEmail, sendOTPEmail };
