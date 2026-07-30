// ─────────────────────────────────────────────────────────────────────────
// Minimal iCalendar (.ics) builder for meeting invites.
//
// No external dependency — the format is a handful of well-defined lines,
// and pulling in a whole library for this is overkill. Covers exactly what
// a meeting invite needs: METHOD:REQUEST (invite/update) and
// METHOD:CANCEL (cancellation), both of which Outlook, Gmail, and Apple
// Mail render as a native "Accept / Decline" calendar card, not just a
// plain attachment.
// ─────────────────────────────────────────────────────────────────────────

function escapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Folds lines longer than 75 octets per RFC 5545 §3.1 — some strict
// calendar clients (notably older Outlook builds) reject unfolded lines.
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function toIcsDate(date) {
  return new Date(date)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * Builds a single-event .ics calendar invite (or cancellation).
 *
 * @param {object} opts
 * @param {string} opts.uid            stable per-meeting identifier — same
 *                                      UID on every send so a client updates
 *                                      the existing calendar entry instead
 *                                      of creating a duplicate.
 * @param {"REQUEST"|"CANCEL"} opts.method
 * @param {string} opts.title
 * @param {string} [opts.description]
 * @param {string} [opts.location]
 * @param {Date|string} opts.startTime
 * @param {Date|string} opts.endTime
 * @param {{name?: string, email: string}} opts.organizer
 * @param {{name?: string, email: string}[]} opts.attendees
 * @param {number} [opts.sequence]     bump on every re-send of the same UID
 */
export function buildMeetingIcs({
  uid,
  method = "REQUEST",
  title,
  description,
  location,
  startTime,
  endTime,
  organizer,
  attendees = [],
  sequence = 0,
}) {
  const now = toIcsDate(new Date());
  const status = method === "CANCEL" ? "CANCELLED" : "CONFIRMED";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OS Group CRM//Calendar//EN",
    `METHOD:${method}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsDate(startTime)}`,
    `DTEND:${toIcsDate(endTime)}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `STATUS:${status}`,
  ];

  if (description) lines.push(foldLine(`DESCRIPTION:${escapeIcsText(description)}`));
  if (location) lines.push(foldLine(`LOCATION:${escapeIcsText(location)}`));
  if (organizer?.email) {
    lines.push(
      foldLine(`ORGANIZER;CN=${escapeIcsText(organizer.name || organizer.email)}:mailto:${organizer.email}`)
    );
  }
  for (const a of attendees) {
    if (!a?.email) continue;
    lines.push(
      foldLine(
        `ATTENDEE;CN=${escapeIcsText(a.name || a.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`
      )
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}

/**
 * Wraps a built .ics string as a nodemailer attachment. `method` needs to
 * match what was passed to buildMeetingIcs — the content-type's `method`
 * parameter is what makes Outlook/Gmail render Accept/Decline buttons
 * instead of treating it as a plain file.
 */
export function icsAttachment(icsContent, method = "REQUEST") {
  return {
    filename: "invite.ics",
    content: icsContent,
    contentType: `text/calendar; charset=utf-8; method=${method}`,
  };
}