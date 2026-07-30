import { sendEmail } from "./email.services.js";
import { buildMeetingIcs, icsAttachment } from "../utils/ics.js";

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

// ─────────────────────────────────────────────────────────────────────────
// Meeting invites / cancellations.
//
// Previously the calendar module only ever emailed a reminder shortly
// before a meeting started (see sendMeetingReminderEmail above, wired to
// the scheduler) — nobody got an email the moment they were actually
// invited, and deleting a meeting sent nothing at all telling attendees
// it was off. Both are added here.
//
// Both carry a .ics attachment with the same UID as the meeting (see
// utils/ics.js), so Outlook/Gmail/Apple Mail render a native
// "Accept / Decline" calendar card and file it straight onto the
// recipient's own calendar — not just a plain-text notice.
// ─────────────────────────────────────────────────────────────────────────

const meetingIcsUid = (meetingId) => `meeting-${meetingId}@osgroupcrm`;

function buildMeetingInviteHtml({ recipientName, meeting, organizerName }) {
  const when = formatDateTime(meeting.startTime);
  const joinBlock =
    meeting.meetingType === "online" && meeting.meetingLink
      ? `<p style="margin:16px 0;"><a href="${meeting.meetingLink}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Join Meeting</a></p>`
      : meeting.location
      ? `<p style="margin:16px 0;color:#374151;"><strong>Location:</strong> ${meeting.location}</p>`
      : "";

  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#111827;">You're invited: ${meeting.title}</h2>
      <p style="color:#374151;">Hi ${recipientName || "there"},</p>
      <p style="color:#374151;">
        ${organizerName ? `${organizerName} has` : "You have been"} invited you to a meeting.
        A calendar invite is attached — accept it to add this to your calendar.
      </p>
      <p style="color:#374151;"><strong>When:</strong> ${when}</p>
      ${joinBlock}
      ${meeting.description ? `<p style="color:#6b7280;margin-top:16px;">${meeting.description}</p>` : ""}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#9ca3af;font-size:12px;">Sent automatically by OS Group CRM.</p>
    </div>
  `;
}

function buildMeetingCancellationHtml({ recipientName, meeting }) {
  const when = formatDateTime(meeting.startTime);
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#991b1b;">Cancelled: ${meeting.title}</h2>
      <p style="color:#374151;">Hi ${recipientName || "there"},</p>
      <p style="color:#374151;">This meeting, originally scheduled for <strong>${when}</strong>, has been cancelled.</p>
      <p style="color:#374151;">It has been removed from the calendar attached to this email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#9ca3af;font-size:12px;">Sent automatically by OS Group CRM.</p>
    </div>
  `;
}

/**
 * Sends a calendar invite for a newly-added attendee (or an updated time/
 * location for an existing one — same UID, so it replaces rather than
 * duplicates in the recipient's calendar app).
 */
export const sendMeetingInviteEmail = async ({ to, recipientName, meeting, organizer, attendees = [] }) => {
  if (!to) return;

  const ics = buildMeetingIcs({
    uid: meetingIcsUid(meeting.id),
    method: "REQUEST",
    title: meeting.title,
    description: meeting.description,
    location: meeting.meetingType === "online" ? meeting.meetingLink : meeting.location,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    organizer,
    attendees,
  });

  await sendEmail({
    to,
    subject: `Invitation: ${meeting.title}`,
    html: buildMeetingInviteHtml({ recipientName, meeting, organizerName: organizer?.name }),
    attachments: [icsAttachment(ics, "REQUEST")],
  });
};

/**
 * Sends a cancellation notice + a METHOD:CANCEL .ics, which most calendar
 * clients use to automatically remove the event from the recipient's
 * calendar rather than leaving them to delete it by hand.
 */
export const sendMeetingCancellationEmail = async ({ to, recipientName, meeting, organizer }) => {
  if (!to) return;

  const ics = buildMeetingIcs({
    uid: meetingIcsUid(meeting.id),
    method: "CANCEL",
    title: meeting.title,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    organizer,
    attendees: [{ email: to, name: recipientName }],
  });

  await sendEmail({
    to,
    subject: `Cancelled: ${meeting.title}`,
    html: buildMeetingCancellationHtml({ recipientName, meeting }),
    attachments: [icsAttachment(ics, "CANCEL")],
  });
};