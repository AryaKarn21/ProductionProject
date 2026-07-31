import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Copy,
  FileText,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";

import emailAPI from "@/api/email.api";

function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Something went wrong."
  );
}

function normalizeTemplates(data) {
  const response = data?.data ?? data;
  if (Array.isArray(response?.templates)) return response.templates;
  if (Array.isArray(response)) return response;
  return [];
}

const EMPTY_FORM = { name: "", category: "", subject: "", bodyHtml: "" };

function TemplateCard({ template, onPreview, onCopy, onEdit, onDelete, onUse, copied }) {
  return (
    <article className="group flex min-w-0 flex-col rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <FileText size={19} />
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {template.name}
            </h2>

            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {template.subject}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(template)}
            aria-label={`Edit ${template.name}`}
            title="Edit"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200"
          >
            <Pencil size={14} />
          </button>

          <button
            type="button"
            onClick={() => onDelete(template)}
            aria-label={`Delete ${template.name}`}
            title="Delete"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <p className="mt-4 line-clamp-4 whitespace-pre-line text-sm leading-6 text-gray-600 dark:text-gray-400">
        {template.bodyHtml}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-5">
        <button
          type="button"
          onClick={() => onUse(template)}
          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Send size={14} />
          Use in Compose
        </button>

        <button
          type="button"
          onClick={() => onPreview(template)}
          className="min-h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
        >
          Preview
        </button>

        <button
          type="button"
          onClick={() => onCopy(template)}
          aria-label={`Copy ${template.name}`}
          title="Copy template"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
        >
          <Copy size={16} />
        </button>
      </div>

      {copied && (
        <p className="mt-2 text-right text-xs font-medium text-green-600 dark:text-green-400">
          Copied
        </p>
      )}
    </article>
  );
}

function TemplateFormModal({ initial, onClose, onSubmit, saving, error }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const isEdit = Boolean(initial?.id);

  const update = (field) => (event) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]"
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form);
        }}
        className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-gray-950 sm:max-w-xl sm:rounded-2xl"
      >
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 dark:border-gray-800 sm:px-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isEdit ? "Edit Template" : "New Template"}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Name
            </label>
            <input
              required
              value={form.name}
              onChange={update("name")}
              placeholder="e.g. Welcome Email"
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Category (optional)
            </label>
            <input
              value={form.category || ""}
              onChange={update("category")}
              placeholder="e.g. Onboarding"
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Subject
            </label>
            <input
              value={form.subject}
              onChange={update("subject")}
              placeholder="Email subject line"
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Body — use {"{{"}placeholder{"}}"} for dynamic fields
            </label>
            <textarea
              rows={8}
              value={form.bodyHtml}
              onChange={update("bodyHtml")}
              placeholder={"Hi {{name}},\n\n..."}
              className="w-full rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white"
            />
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Template"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default function Templates() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [formState, setFormState] = useState(null); // null | {} (new) | template (edit)
  const [formError, setFormError] = useState("");

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => emailAPI.getTemplates(),
    staleTime: 30_000,
  });

  const templates = useMemo(() => normalizeTemplates(data), [data]);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templates;

    return templates.filter((template) =>
      [template.name, template.subject, template.bodyHtml].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }, [search, templates]);

  const createMutation = useMutation({
    mutationFn: (payload) => emailAPI.createTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setFormState(null);
      setFormError("");
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => emailAPI.updateTemplate(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setFormState(null);
      setFormError("");
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => emailAPI.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
    },
  });

  const handleCopy = async (template) => {
    const content = [`Subject: ${template.subject}`, "", template.bodyHtml].join("\n");
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(template.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === template.id ? null : current));
      }, 1500);
    } catch {
      setCopiedId(null);
    }
  };

  const handleUse = (template) => {
    const params = new URLSearchParams();
    if (template.subject) params.set("subject", template.subject);
    if (template.bodyHtml) params.set("body", template.bodyHtml);
    navigate(`/email/compose?${params.toString()}`);
  };

  const handleDelete = (template) => {
    if (window.confirm(`Delete template "${template.name}"? This can't be undone.`)) {
      deleteMutation.mutate(template.id);
    }
  };

  const handleFormSubmit = (form) => {
    if (formState?.id) {
      updateMutation.mutate({ id: formState.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <FileText size={21} />
            </div>

            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-2xl">
                Email Templates
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Reusable message templates for common conversations.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError("");
            setFormState({});
          }}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={17} />
          New Template
        </button>
      </header>

      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search
            size={17}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search templates..."
            aria-label="Search email templates"
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-10 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-900 dark:hover:text-gray-200"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          {filteredTemplates.length} {filteredTemplates.length === 1 ? "template" : "templates"}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-sm text-red-500">{getErrorMessage(error)}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 min-h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      ) : filteredTemplates.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onPreview={setSelectedTemplate}
              onCopy={handleCopy}
              onEdit={(t) => {
                setFormError("");
                setFormState(t);
              }}
              onDelete={handleDelete}
              onUse={handleUse}
              copied={copiedId === template.id}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-950">
          <div className="max-w-sm">
            <FileText size={28} className="mx-auto text-gray-400" />
            <h2 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
              No templates found
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {search
                ? "No email templates match your current search."
                : "Create your first reusable template to get started."}
            </p>
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Clear search
              </button>
            )}
          </div>
        </div>
      )}

      {selectedTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-preview-title"
        >
          <button
            type="button"
            aria-label="Close template preview"
            onClick={() => setSelectedTemplate(null)}
            className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]"
          />

          <div className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-gray-950 sm:max-w-2xl sm:rounded-2xl">
            <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 dark:border-gray-800 sm:px-5">
              <h2
                id="template-preview-title"
                className="truncate text-base font-semibold text-gray-900 dark:text-white"
              >
                {selectedTemplate.name}
              </h2>

              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                aria-label="Close preview"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Subject
                </p>
                <p className="mt-2 break-words text-sm font-semibold text-gray-900 dark:text-white">
                  {selectedTemplate.subject}
                </p>
              </div>

              <div className="mt-6 border-t border-gray-100 pt-6 dark:border-gray-900">
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-700 dark:text-gray-300">
                  {selectedTemplate.bodyHtml}
                </p>
              </div>
            </div>

            <footer className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5">
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="min-h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => handleUse(selectedTemplate)}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Send size={16} />
                Use in Compose
              </button>
            </footer>
          </div>
        </div>
      )}

      {formState !== null && (
        <TemplateFormModal
          initial={formState.id ? formState : EMPTY_FORM}
          onClose={() => setFormState(null)}
          onSubmit={handleFormSubmit}
          saving={saving}
          error={formError}
        />
      )}
    </div>
  );
}