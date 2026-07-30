import express from "express";
import { Meeting, MeetingAttendee, User } from "../models/index.js";
import { protect } from "../middleware/auth.js";
import { sendMeetingInviteEmail } from "../services/emailNotification.service.js";

const router = express.Router();

router.post("/:meetingId/attendees", protect, async (req, res) => {
  try {
   
    const { users } = req.body;

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one user.",
      });
    }

    const meeting = await Meeting.findOne({
      where: {
        id: req.params.meetingId,
        companyId: req.companyId,
        isDeleted: false,
      },
      include: [{ model: User, as: "organizer", attributes: ["id", "name", "email"] }],
    });

    console.log("Meeting:", meeting);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
    }



    const attendees = [];

    for (const userId of users) {

      console.log("Checking User:", userId);

      const user = await User.findByPk(userId);

      console.log("User:", user);

      if (!user) continue;

      const attendee = await MeetingAttendee.create({
        meetingId: meeting.id,
        userId: user.id,
        status: "pending",
      });

      console.log("Created:", attendee);

      attendees.push(attendee);

      // Best-effort: a bad SMTP config or one invalid email address
      // shouldn't roll back attendees who were already added successfully,
      // so failures here are logged, not thrown.
      if (user.email) {
        sendMeetingInviteEmail({
          to: user.email,
          recipientName: user.name,
          meeting,
          organizer: meeting.organizer
            ? { name: meeting.organizer.name, email: meeting.organizer.email }
            : undefined,
        }).catch((err) =>
          console.error(`Meeting invite email failed for ${user.email}:`, err.message)
        );
      }
    }

    res.status(201).json({
      success: true,
      message: "Attendees added successfully.",
      data: attendees,
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }
});

router.get("/:meetingId/attendees", protect, async (req, res) => {
  try {

    const meeting = await Meeting.findOne({
      where: {
        id: req.params.meetingId,
        companyId: req.companyId,
        isDeleted: false,
      },
    });

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
    }

    const attendees = await MeetingAttendee.findAll({
      where: {
        meetingId: meeting.id,
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email", "role"],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    res.json({
      success: true,
      count: attendees.length,
      data: attendees,
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }
});

router.patch("/:meetingId/attendees/me", async (req, res, next) => {
  const attendee = await MeetingAttendee.findOne({
    where: { meetingId: req.params.meetingId, userId: req.user.id },
  });
  if (!attendee) return res.status(404).json({ success: false, message: "Invitation not found" });
  await attendee.update({ status: req.body.status });
  res.json({ success: true, data: attendee });
});

router.delete("/:meetingId/attendees/:userId", async (req, res, next) => {
  await MeetingAttendee.destroy({ where: { meetingId: req.params.meetingId, userId: req.params.userId } });
  res.json({ success: true });
});

export default router;