import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarPlus, Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import holidayAPI from "@/api/holiday.api";
import {
  getIndianHolidays,
  AVAILABLE_INDIAN_HOLIDAY_YEARS,
} from "@/lib/indianHolidays";

const emptyForm = {
  name: "",
  date: "",
  isActive: true,
};

export default function Holidays() {
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);

  const [form, setForm] = useState(emptyForm);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importYear, setImportYear] = useState(
    AVAILABLE_INDIAN_HOLIDAY_YEARS[AVAILABLE_INDIAN_HOLIDAY_YEARS.length - 1]
  );
  const [selectedDates, setSelectedDates] = useState(new Set());

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["holidays"],

    queryFn: async () => {
      const response = await holidayAPI.getAll();
      return response.data;
    },
  });

  const holidays =
    data?.holidays ||
    data?.data ||
    [];

  const createMutation = useMutation({
    mutationFn: (payload) =>
      holidayAPI.create(payload),

    onSuccess: () => {
      toast.success("Holiday added successfully");

      queryClient.invalidateQueries({
        queryKey: ["holidays"],
      });

      closeForm();
    },

    onError: (error) => {
      toast.error(
        error?.response?.data?.message ||
          "Unable to add holiday"
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      holidayAPI.update(id, payload),

    onSuccess: () => {
      toast.success("Holiday updated successfully");

      queryClient.invalidateQueries({
        queryKey: ["holidays"],
      });

      closeForm();
    },

    onError: (error) => {
      toast.error(
        error?.response?.data?.message ||
          "Unable to update holiday"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) =>
      holidayAPI.remove(id),

    onSuccess: () => {
      toast.success("Holiday removed");

      queryClient.invalidateQueries({
        queryKey: ["holidays"],
      });
    },

    onError: (error) => {
      toast.error(
        error?.response?.data?.message ||
          "Unable to remove holiday"
      );
    },
  });

  const importMutation = useMutation({
    mutationFn: async (holidaysToAdd) => {
      const results = await Promise.allSettled(
        holidaysToAdd.map((h) =>
          holidayAPI.create({ name: h.name, date: h.date, isActive: true })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      return { added: holidaysToAdd.length - failed, failed };
    },

    onSuccess: ({ added, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });

      if (added > 0) {
        toast.success(
          `Added ${added} holiday${added === 1 ? "" : "s"} from the Indian calendar`
        );
      }
      if (failed > 0) {
        toast.error(`${failed} holiday${failed === 1 ? "" : "s"} could not be added`);
      }
      if (added === 0 && failed === 0) {
        toast("No holidays selected");
      }

      closeImportModal();
    },

    onError: () => {
      toast.error("Unable to import holidays");
    },
  });

  const existingDates = new Set(
    holidays.map((h) => String(h.date).slice(0, 10))
  );

  const calendarHolidays = getIndianHolidays(importYear);

  const openImportModal = () => {
    // Pre-select every calendar holiday for the year that isn't already
    // configured, so admins usually just review and confirm.
    setSelectedDates(
      new Set(
        calendarHolidays
          .filter((h) => !existingDates.has(h.date))
          .map((h) => h.date)
      )
    );
    setShowImportModal(true);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setSelectedDates(new Set());
  };

  const toggleSelectedDate = (date) => {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const handleImportYearChange = (year) => {
    setImportYear(year);
    const holidaysForYear = getIndianHolidays(year);
    setSelectedDates(
      new Set(
        holidaysForYear
          .filter((h) => !existingDates.has(h.date))
          .map((h) => h.date)
      )
    );
  };

  const handleImportSubmit = () => {
    const holidaysToAdd = calendarHolidays.filter((h) => selectedDates.has(h.date));
    importMutation.mutate(holidaysToAdd);
  };

  const openCreate = () => {
    setEditingHoliday(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (holiday) => {
    setEditingHoliday(holiday);

    setForm({
      name: holiday.name || "",
      date: holiday.date
        ? String(holiday.date).slice(0, 10)
        : "",
      isActive: holiday.isActive !== false,
    });

    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingHoliday(null);
    setForm(emptyForm);
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("Holiday name is required");
      return;
    }

    if (!form.date) {
      toast.error("Holiday date is required");
      return;
    }

    const payload = {
      name: form.name.trim(),
      date: form.date,
      isActive: form.isActive,
    };

    if (editingHoliday) {
      updateMutation.mutate({
        id: editingHoliday.id,
        payload,
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  const saving =
    createMutation.isPending ||
    updateMutation.isPending;

  return (
    <div className="space-y-6">

      {/* HEADER */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Holidays
          </h1>

          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            Manage company holidays used by attendance
            and absence calculations.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary flex items-center gap-2"
            onClick={openImportModal}
          >
            <CalendarPlus size={16} />

            Import Indian Holidays
          </button>

          <button
            type="button"
            className="btn btn-primary flex items-center gap-2"
            onClick={openCreate}
          >
            <Plus size={16} />

            Add Holiday
          </button>
        </div>

      </div>

      {/* FORM */}

      {showForm && (

        <div className="card p-5">

          <h2
            className="font-semibold mb-5"
            style={{ color: "var(--text-primary)" }}
          >
            {editingHoliday
              ? "Edit Holiday"
              : "Add Holiday"}
          </h2>

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div>
                <label className="form-label">
                  Holiday Name *
                </label>

                <input
                  className="form-input"
                  value={form.name}
                  placeholder="e.g. Dashain Holiday"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="form-label">
                  Date *
                </label>

                <input
                  type="date"
                  className="form-input"
                  value={form.date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
              </div>

            </div>

            <label className="flex items-center gap-2">

              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
              />

              <span
                className="text-sm"
                style={{
                  color: "var(--text-secondary)",
                }}
              >
                Active holiday
              </span>

            </label>

            <div className="flex justify-end gap-3">

              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingHoliday
                    ? "Update Holiday"
                    : "Add Holiday"}
              </button>

            </div>

          </form>

        </div>

      )}

      {/* HOLIDAY LIST */}

      <div className="card overflow-hidden">

        {isLoading ? (

          <div
            className="p-10 text-center"
            style={{ color: "var(--text-muted)" }}
          >
            Loading holidays...
          </div>

        ) : isError ? (

          <div
            className="p-10 text-center"
            style={{ color: "var(--danger)" }}
          >
            Unable to load holidays.
          </div>

        ) : holidays.length === 0 ? (

          <div className="p-12 text-center">

            <CalendarDays
              size={38}
              className="mx-auto mb-3 opacity-30"
            />

            <h3
              className="font-medium"
              style={{
                color: "var(--text-primary)",
              }}
            >
              No holidays configured
            </h3>

            <p
              className="text-sm mt-1 mb-4"
              style={{
                color: "var(--text-muted)",
              }}
            >
              Add company holidays so employees are not
              incorrectly marked absent.
            </p>

            <button
              className="btn btn-primary"
              onClick={openCreate}
            >
              Add First Holiday
            </button>

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead>
                <tr
                  style={{
                    borderBottom:
                      "1px solid var(--border)",
                  }}
                >

                  <th className="text-left p-4">
                    Holiday
                  </th>

                  <th className="text-left p-4">
                    Date
                  </th>

                  <th className="text-left p-4">
                    Status
                  </th>

                  <th className="text-right p-4">
                    Actions
                  </th>

                </tr>
              </thead>

              <tbody>

                {holidays.map((holiday) => (

                  <tr
                    key={holiday.id}
                    style={{
                      borderBottom:
                        "1px solid var(--border)",
                    }}
                  >

                    <td
                      className="p-4 font-medium"
                      style={{
                        color:
                          "var(--text-primary)",
                      }}
                    >
                      {holiday.name}
                    </td>

                    <td
                      className="p-4"
                      style={{
                        color:
                          "var(--text-secondary)",
                      }}
                    >
                      {new Date(
                        `${holiday.date}T00:00:00`
                      ).toLocaleDateString()}
                    </td>

                    <td className="p-4">

                      <span>
                        {holiday.isActive
                          ? "Active"
                          : "Inactive"}
                      </span>

                    </td>

                    <td className="p-4">

                      <div className="flex justify-end gap-2">

                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            openEdit(holiday)
                          }
                        >
                          <Pencil size={15} />
                        </button>

                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={
                            deleteMutation.isPending
                          }
                          onClick={() => {
                            const confirmed =
                              window.confirm(
                                `Remove "${holiday.name}"?`
                              );

                            if (confirmed) {
                              deleteMutation.mutate(
                                holiday.id
                              );
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>

                      </div>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

      </div>

      {/* IMPORT INDIAN HOLIDAYS MODAL */}

      {showImportModal && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={closeImportModal}
        >

          <div
            className="card w-full max-w-lg max-h-[85vh] flex flex-col p-5"
            onClick={(event) => event.stopPropagation()}
          >

            <div className="flex items-center justify-between mb-1">
              <h2
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Import Indian Public Holidays
              </h2>

              <select
                className="form-input !w-auto text-sm"
                value={importYear}
                onChange={(event) =>
                  handleImportYearChange(Number(event.target.value))
                }
              >
                {AVAILABLE_INDIAN_HOLIDAY_YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <p
              className="text-sm mb-4"
              style={{ color: "var(--text-muted)" }}
            >
              Based on the official Government of India gazetted holiday
              calendar. Dates already added below are shown as
              &quot;Already added&quot; and are skipped automatically.
            </p>

            {calendarHolidays.length === 0 ? (

              <div
                className="p-6 text-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                No calendar data available for {importYear} yet.
              </div>

            ) : (

              <div className="flex-1 overflow-y-auto space-y-1 pr-1">

                {calendarHolidays.map((holiday) => {
                  const alreadyAdded = existingDates.has(holiday.date);

                  return (
                    <label
                      key={holiday.date}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg"
                      style={{
                        border: "1px solid var(--border)",
                        opacity: alreadyAdded ? 0.5 : 1,
                      }}
                    >

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          disabled={alreadyAdded}
                          checked={
                            alreadyAdded || selectedDates.has(holiday.date)
                          }
                          onChange={() => toggleSelectedDate(holiday.date)}
                        />

                        <div>
                          <p
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {holiday.name}
                          </p>

                          <p
                            className="text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {new Date(
                              `${holiday.date}T00:00:00`
                            ).toLocaleDateString(undefined, {
                              weekday: "short",
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>

                      {alreadyAdded && (
                        <span
                          className="text-xs shrink-0"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Already added
                        </span>
                      )}

                    </label>
                  );
                })}

              </div>

            )}

            <div className="flex justify-end gap-3 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeImportModal}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary"
                disabled={importMutation.isPending || selectedDates.size === 0}
                onClick={handleImportSubmit}
              >
                {importMutation.isPending
                  ? "Importing..."
                  : `Add ${selectedDates.size} Selected`}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}