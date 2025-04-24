require('dotenv').config(); // Load environment variables from .env
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors'); // Import cors

const app = express();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Enable CORS
app.use(cors());

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Route to handle form submissions
app.post('/send-email', async (req, res) => {
    console.log('Raw request body:', req.body); // Debugging

    const { name, email, message } = req.body; // Extract form data
    console.log('Parsed form data:', { name, email, message }); // Debugging

    try {
        // Create a transporter for sending emails
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: true, // Use TLS
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        // Send email to yourself
        await transporter.sendMail({
            from: `"${name}" <${email}>`,
            to: process.env.SMTP_USER,
            subject: 'New Contact Form Submission',
            text: `You have received a new message from ${name} (${email}):\n\n${message}`,
        });

        // Send confirmation email to the sender
        await transporter.sendMail({
            from: `"AlvarezSM | Portfolio" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'Thank you for contacting us!',
            html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="text-align: center; padding: 20px; background-color: #f4f4f4;">
                    <img src="https://port.alvarezsm.com/images/pa_logo.png" alt="PA Logo" style="max-width: 100px; width: 150px; height: auto; display: block; margin: 0 auto;">
                </div>
                <div style="padding: 20px;">
                    <h2 style="color: #007f66;">Hi ${name},</h2>
                    <p>Thank you for reaching out! We have received your message:</p>
                    <blockquote style="border-left: 4px solid #007f66; padding-left: 10px; color: #555;">
                        ${message}
                    </blockquote>
                    <p>We will get back to you shortly.</p>
                    <p>Best regards,</p>
                    <p><strong>Pedro Alvarez</strong></p>
                </div>
                <div style="text-align: center; padding: 10px; background-color: #f4f4f4; color: #777;">
                    <p style="margin: 0;">&copy; 2025 AlvarezSM. All rights reserved.</p>
                    <p style="margin: 0;">
                        <a href="https://port.alvarezsm.com/privacy-policy.html" style="color: #007f66; text-decoration: none;">Privacy Policy</a> |
                        <a href="https://port.alvarezsm.com/terms-conditions.html" style="color: #007f66; text-decoration: none;">Terms & Conditions</a>
                    </p>
                </div>
            </div>
        `,
        });

        res.status(200).send('Emails sent successfully!');
    } catch (error) {
        console.error('Error:', error.message); // Log the error message
        console.error('Error details:', error); // Log the full error object
        res.status(500).send('Failed to send emails.');
    }
});
