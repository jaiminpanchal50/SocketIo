import { createTransport } from "nodemailer";
import appConfig from "../configs/config.js";

const transporter = createTransport({
    service: "gmail",
    auth: {
        type: 'OAuth2',
        user: appConfig.EMAIL_USER,
        clientId: appConfig.CLIENT_ID,
        clientSecret: appConfig.CLIENT_SECRET,
        refreshToken: appConfig.REFRESH_TOKEN,
        accessToken: appConfig.ACCESS_TOKEN,
    },
    tls: {
        rejectUnauthorized: true
    }
})


transporter.verify((error, success) => {
    if (error) {
        console.error('Error connecting to email server:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});


export async function sendEmail({ to, subject, html, text }) {

    const mailOption = {
        from: appConfig.EMAIL_USER,
        to,
        subject,
        html,
        text
    }


    const details = await transporter.sendMail(mailOption)
    console.log("email send", details);
    return details

}







export default transporter;