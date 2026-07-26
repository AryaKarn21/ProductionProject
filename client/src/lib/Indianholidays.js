// Official Government of India gazetted public holidays, by year.
// Source: Government of India Ministry of Personnel, Public Grievances &
// Pensions holiday notifications. Fixed-date holidays (Republic Day,
// Independence Day, Gandhi Jayanti, Christmas, New Year) repeat every year;
// festival-based holidays (Holi, Eid, Diwali, etc.) follow the lunar/solar
// calendars and shift each year, so each year must be added explicitly below.
//
// To add a new year, add a new `<year>: [ { name, date }, ... ]` entry —
// `date` must be "YYYY-MM-DD".
export const INDIAN_HOLIDAYS_BY_YEAR = {
  2026: [
    { name: "New Year's Day", date: "2026-01-01" },
    { name: "Republic Day", date: "2026-01-26" },
    { name: "Holi", date: "2026-03-04" },
    { name: "Id-ul-Fitr", date: "2026-03-21" },
    { name: "Ram Navami", date: "2026-03-26" },
    { name: "Mahavir Jayanti", date: "2026-03-31" },
    { name: "Good Friday", date: "2026-04-03" },
    { name: "Buddha Purnima", date: "2026-05-01" },
    { name: "Id-ul-Zuha (Bakrid)", date: "2026-05-27" },
    { name: "Muharram", date: "2026-06-26" },
    { name: "Rath Yatra", date: "2026-07-16" },
    { name: "Independence Day", date: "2026-08-15" },
    { name: "Raksha Bandhan", date: "2026-08-28" },
    { name: "Id-e-Milad (Milad-un-Nabi)", date: "2026-08-26" },
    { name: "Janmashtami", date: "2026-09-04" },
    { name: "Mahatma Gandhi Jayanti", date: "2026-10-02" },
    { name: "Dussehra", date: "2026-10-20" },
    { name: "Diwali", date: "2026-11-08" },
    { name: "Guru Nanak Jayanti", date: "2026-11-24" },
    { name: "Christmas Day", date: "2026-12-25" },
  ],
};

/**
 * Returns the list of known Indian public holidays for a given year, or an
 * empty array if that year hasn't been added to INDIAN_HOLIDAYS_BY_YEAR yet.
 */
export function getIndianHolidays(year) {
  return INDIAN_HOLIDAYS_BY_YEAR[Number(year)] || [];
}

export const AVAILABLE_INDIAN_HOLIDAY_YEARS = Object.keys(INDIAN_HOLIDAYS_BY_YEAR)
  .map(Number)
  .sort((a, b) => a - b);