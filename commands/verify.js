const crypto = require("crypto");
const fs = require("fs");
const helpers = require("../helpers/helpers.js");
const nodemailer = require("nodemailer");

const memberRole = fs.readFileSync("/etc/discord.member.role", "utf-8").trim();
const brickbotSecret = fs.readFileSync("/etc/brickbot.secret", "utf-8").trim();
const brickbotMailer = nodemailer.createTransport({
    // We can't directly connect to mail.redbrick.dcu.ie.
    host: "mail.internal",
    port: 587,
    secure: false,
    logger: true,
    requireTLS: true,
    auth: {
        user: "brickbot",
        pass: brickbotSecret,
    },
    tls: {
        rejectUnauthorized: false
    }
});

const activeVerifications = {};

// Every 10 minutes, clear verification requests that have been around for longer than 15 minutes.
setInterval(() => {
    const startTime = Date.now().getTime();
    Object.keys(activeVerifications).forEach((author) => {
        const outstandingVerification = activeVerifications[author];
        const duration = (outstandingVerification.createdAt.getTime() - startTime);
        if (duration > 15 * 60 * 100) {
            activeVerifications[author] = undefined;
        }
    });
}, 10 * 60 * 1000);

function generateVerificationCode() {
    // 4 bytes seems like a good number. Some people might be transcribing this number manually,
    // so it shouldn't be ridiculously long for no reason.
    return crypto.randomBytes(4).toString('hex');
}

function handleFirstStep(args, receivedMessage) {
    if (args.length !== 1) {
        receivedMessage.channel.send("!verify <your-redbrick-email-address>");
        return;
    }
    const emailAddress = args[0];
    if (!emailAddress.endsWith("@redbrick.dcu.ie")) {
        receivedMessage.reply("That's not a valid email address. It must be username@redbrick.dcu.ie");
        return;
    }
    const code = generateVerificationCode();
    brickbotMailer.sendMail({
        from: "brickbot <brickbot@redbrick.dcu.ie>",
        to: emailAddress,
        subject: "Redbrick Discord Verification",
        text: code,
    }, function(error, info) {
        if (error) {
            console.log(error);
            receivedMessage.reply("I couldn't send the verification email. Sorry :-(");
        } else {
            activeVerifications[receivedMessage.author] = {
                code: code,
                createdAt: Date.now(),
            };
            receivedMessage.reply("A verification code has been sent to the provided email address. Use !verify <code> once you have received it.");
        }
    });
}

function handleSecondStep(args, receivedMessage) {
    if (args.length !== 1) {
        receivedMessage.reply("Use !verify <code> to finish your verification.");
        return;
    }
    const code = args[0];
    if (activeVerifications[receivedMessage.author].code !== code) {
        receivedMessage.reply("That's not the correct verification code.");
        return;
    }
    activeVerifications[receivedMessage.author] = undefined;
    receivedMessage.reply("You have been verified successfully!");
}

module.exports = {
    verifyCommand: function(bot, args, receivedMessage) {
        if (receivedMessage.channel.type !== "dm") {
            receivedMessage.reply("The verfy command can only be used in direct messages.");
            return;
        }
        if (!activeVerifications[receivedMessage.author]) {
            handleFirstStep(args, receivedMessage);
        } else {
            handleSecondStep(args, receivedMessage);
        }
    }
};
