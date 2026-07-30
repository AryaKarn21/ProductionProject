import { useEffect, useRef, useState } from "react";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";

import { meetingsAPI } from "@/api/meetings.api";
import MeetingForm from "./MeetingForm";
import CalendarHeader from "./components/CalendarHeader.jsx";
import CalendarStats from "./components/CalendarStats";
import CalendarToolBar from "./components/CalendarToolBar"; // ← check this line exists
import UpcomingMeetings from "./components/UpcomingMeetings";
import "./styles/calendar.css";
import MeetingDetails from "./MeetingDetails";
export default function Calendar() {
  const [events, setEvents] = useState([]);
  const calendarRef = useRef(null);

  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showMeetingDetails, setShowMeetingDetails] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  const [isEditing, setIsEditing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("dayGridMonth");

  // Convert API meetings to FullCalendar events
  const mapMeetingsToEvents = (meetings) => {
    return meetings.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      start: meeting.startTime,
      end: meeting.endTime,

      backgroundColor:
        meeting.priority === "high"
          ? "#ef4444"
          : meeting.priority === "medium"
            ? "#f59e0b"
            : "#22c55e",

      borderColor:
        meeting.priority === "high"
          ? "#ef4444"
          : meeting.priority === "medium"
            ? "#f59e0b"
            : "#22c55e",
      classNames: [
        meeting.priority === "high"
          ? "priority-high"
          : meeting.priority === "medium"
            ? "priority-medium"
            : "priority-low",
      ],
      extendedProps: {
        description: meeting.description,
        location: meeting.location,
        meetingType: meeting.meetingType,
        priority: meeting.priority,
        status: meeting.status,
      },
    }));
  };

  const loadMeetings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await meetingsAPI.getMeetings();

      setEvents(mapMeetingsToEvents(response.data.data));
    } catch (err) {
      console.error(err);
      setError("Failed to load meetings.");
    } finally {
      setLoading(false);
    }
  };

  /*
   * Declared AFTER loadMeetings, not before it.
   *
   * This effect used to sit at the top of the component and call
   * loadMeetings, which is a `const` arrow function defined ~40 lines
   * below. It happened to work — effects run after the whole body has
   * evaluated, so the binding is assigned by then — but it is a
   * temporal-dead-zone reference that breaks the moment anyone calls it
   * during render instead, and it reads as a bug to every linter.
   */
  useEffect(() => {
    loadMeetings();
    // Intentionally once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upcomingMeetings = [...events]
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 5);

  // Open Create Meeting Modal
  const handleDateClick = (info) => {
    setSelectedDate(info.dateStr);
    setShowMeetingForm(true);
    setSelectedMeeting(null);
    setShowMeetingForm(true);
  };

  // Click existing meeting
  const handleEventClick = (info) => {
    setSelectedMeeting(info.event);
    setShowMeetingDetails(true);
  };

  if (loading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold">Loading Calendar...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-500">
        <h2>{error}</h2>
      </div>
    );
  }

  const now = new Date();
  const todayCount = events.filter(
    (e) => new Date(e.start).toDateString() === now.toDateString(),
  ).length;
  const upcomingCount = events.filter((e) => new Date(e.start) > now).length;
  const onlineCount = events.filter(
    (e) =>
      e.extendedProps?.meetingType && e.extendedProps.meetingType !== "offline",
  ).length;

  return (
    <div className="p-6">
      {/* Page Heading */}
      <CalendarHeader
        onCreateMeeting={() => {
          setSelectedDate(null);
          setShowMeetingForm(true);
        }}
      />

      <CalendarStats
        today={todayCount}
        upcoming={upcomingCount}
        online={onlineCount}
        attendees={0}
      />

      <CalendarToolBar
        search={search}
        setSearch={setSearch}
        calendarRef={calendarRef}
        activeView={activeView}
        setActiveView={setActiveView}
      />
      {/* Calendar */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <FullCalendar
            ref={calendarRef}
            plugins={[
              dayGridPlugin,
              timeGridPlugin,
              interactionPlugin,
              listPlugin,
            ]}
            initialView={activeView}
            headerToolbar={false}
            selectable
            editable={false}
            weekends
            height="80vh"
            events={events}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
          />
        </div>

        <UpcomingMeetings meetings={upcomingMeetings} />
      </div>
      {showMeetingForm && (
        <MeetingForm
          meeting={selectedMeeting}
          isEditing={isEditing}
          selectedDate={selectedDate}
          onClose={() => setShowMeetingForm(false)}
          onSuccess={() => {
            setShowMeetingForm(false);
            loadMeetings();
          }}
        />
      )}

      {/* Meeting Details */}
      <MeetingDetails
        meeting={selectedMeeting}
        open={showMeetingDetails}
        onClose={() => {
          setShowMeetingDetails(false);
          setSelectedMeeting(null);
        }}
        onEdit={() => {
          setShowMeetingDetails(false);
          setIsEditing(true);
          setShowMeetingForm(true);
        }}
        onDelete={async () => {
          if (!window.confirm("Delete this meeting?")) return;

          try {
            await meetingsAPI.deleteMeeting(selectedMeeting.id);

            setShowMeetingDetails(false);
            setSelectedMeeting(null);

            loadMeetings();
          } catch (err) {
            console.error(err);
          }
        }}
      />
    </div>
  );
}
