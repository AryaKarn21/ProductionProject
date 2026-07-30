import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.MAIL_PORT) || 587,
  secure: Number(process.env.MAIL_PORT) === 465, // true only for port 465
  requireTLS: true,  // force STARTTLS on port 587
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // avoid cert errors on some hosts
  },
})

// Verify SMTP connection on startup
transporter.verify((error) => {
  if (error) {
    console.error('❌ Mail Server Error:', error.message)
    console.error('👉 Fix: Go to Google Account → Security → App Passwords → generate a new 16-char password and set it as MAIL_PASS in your .env')
  } else {
    console.log('✅ Mail Server Connected')
  }
})

console.log("MAIL_USER:", process.env.MAIL_USER)
console.log("MAIL_PASS:", process.env.MAIL_PASS ? "Loaded ✅" : "Missing ❌")
console.log("MAIL_HOST:", process.env.MAIL_HOST)
console.log("MAIL_PORT:", process.env.MAIL_PORT)

export default transporter