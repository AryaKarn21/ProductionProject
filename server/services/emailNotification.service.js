import { sendEmail } from "./email.services.js";

function formatDateTime(date) {
  return new Date(date).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function buildWelcomeEmailHtml({ name, email, tempPassword, companyName }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#111827;">Welcome to ${companyName || "OS Group CRM"}</h2>
      <p style="color:#374151;">Hi ${name},</p>
      <p style="color:#374151;">
        An account has been created for you so you can log in to the CRM,
        get invited to meetings, and access your employee portal.
      </p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:20px 0;">
        <p style="margin:4px 0;color:#374151;"><strong>Email:</strong> ${email}</p>
        <p style="margin:4px 0;color:#374151;"><strong>Temporary Password:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px;">${tempPassword}</code></p>
      </div>
      <p style="color:#374151;">Please log in and change your password as soon as possible.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#9ca3af;font-size:12px;">Sent automatically by OS Group CRM.</p>
    </div>
  `;
}

export const sendEmployeeWelcomeEmail = async ({ to, name, email, tempPassword, companyName }) => {
  if (!to) return;
  await sendEmail({
    to,
    subject: `Your ${companyName || "OS Group CRM"} account is ready`,
    html: buildWelcomeEmailHtml({ name, email, tempPassword, companyName }),
  });
};

// Self-contained inline template — the shipped `notification.html` file
// exists but is empty, so this doesn't depend on it.
function buildMeetingReminderHtml({ recipientName, meeting, minutesBefore }) {
  const when = formatDateTime(meeting.startTime);
  const joinBlock =
    meeting.meetingType === "online" && meeting.meetingLink
      ? `<p style="margin:16px 0;"><a href="${meeting.meetingLink}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Join Meeting</a></p>`
      : meeting.location
      ? `<p style="margin:16px 0;color:#374151;"><strong>Location:</strong> ${meeting.location}</p>`
      : "";

  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#111827;">Meeting Reminder</h2>
      <p style="color:#374151;">Hi ${recipientName || "there"},</p>
      <p style="color:#374151;">
        This is a reminder that <strong>${meeting.title}</strong> starts in
        ${minutesBefore >= 1440 ? `${Math.round(minutesBefore / 1440)} day(s)` : `${minutesBefore} minutes`}.
      </p>
      <p style="color:#374151;"><strong>When:</strong> ${when}</p>
      ${joinBlock}
      ${meeting.description ? `<p style="color:#6b7280;margin-top:16px;">${meeting.description}</p>` : ""}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#9ca3af;font-size:12px;">Sent automatically by OS Group CRM.</p>
    </div>
  `;
}

export const sendMeetingReminderEmail = async ({ to, recipientName, meeting, minutesBefore }) => {
  if (!to) return;
  await sendEmail({
    to,
    subject: `Reminder: ${meeting.title} starts soon`,
    html: buildMeetingReminderHtml({ recipientName, meeting, minutesBefore }),
  });
};