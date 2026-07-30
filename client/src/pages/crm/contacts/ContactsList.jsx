import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { contactsAPI } from "@/api/contacts.api";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import FormModal from "@/components/shared/FormModal";
import Avatar from "@/components/ui/Avatar";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { accountsAPI } from "@/api/accounts.api";

export default function ContactsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [params, setParams] = useState({
    page: 1,
    limit: 20,
    search: "",
    sortKey: "createdAt",
    sortDir: "desc",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["contacts", params],
    queryFn: () => contactsAPI.getAll(params).then((r) => r.data),
  });

  const { data: accountsData } = useQuery({
    queryKey: ["accounts-dropdown"],
    queryFn: () =>
      accountsAPI
        .getAll({
          page: 1,
          limit: 1000,
        })
        .then((res) => res.data),
  });

  const accounts = accountsData?.accounts || [];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      jobTitle: "",
      department: "",
      notes: "",
      accountId: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: contactsAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setModalOpen(false);
      reset();
      toast.success("Contact created successfully");
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Failed to create contact");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: contactsAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact deleted");
    },
  });

  const columns = [
    {
      key: "firstName",
      label: "Name",
      sortable: true,
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <Avatar name={`${row.firstName} ${row.lastName}`} size="sm" />
          <div>
            <p
              className="text-[13px] font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {row.firstName} {row.lastName}
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {row.jobTitle || "—"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      render: (val) =>
        val ? (
          <a
            href={`mailto:${val}`}
            className="text-[var(--primary)] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {val}
          </a>
        ) : (
          "—"
        ),
    },
    { key: "phone", label: "Phone" },
    { key: "account", label: "Account", render: (val) => val?.name || "—" },
    { key: "department", label: "Department" },
    {
      key: "createdAt",
      label: "Added",
      sortable: true,
      render: (val) => formatDate(val),
    },
 {
  key: "id",
  label: "Actions",
  render: (id, row) => (
    <div
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="btn btn-ghost btn-sm text-blue-600"
        onClick={() => navigate(`/crm/contacts/${id}/edit`)}
      >
        Edit
      </button>

      <button
        className="btn btn-ghost btn-sm text-red-500"
        onClick={() => {
          if (
            confirm(
              `Delete ${row.firstName} ${row.lastName}?`
            )
          ) {
            deleteMutation.mutate(id);
          }
        }}
      >
        Delete
      </button>
    </div>
  ),
}
  ];
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1
            className="text-[18px] font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Contacts
          </h1>
          <p
            className="text-[12px] mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {data?.total ?? 0} contacts
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={14} /> Add Contact
        </button>
      </div>

      <FilterBar
        searchPlaceholder="Search by name, email..."
        filters={[]}
        values={params}
        onChange={(k, v) => setParams((p) => ({ ...p, [k]: v, page: 1 }))}
      />

      <div className="mx-6 mb-6 card overflow-hidden">
        <DataTable
          columns={columns}
          data={data?.contacts || []}
          total={data?.total || 0}
          page={params.page}
          pageSize={params.limit}
          loading={isLoading}
          error={error}
          sortKey={params.sortKey}
          sortDir={params.sortDir}
          onSort={(k, d) =>
            setParams((p) => ({ ...p, sortKey: k, sortDir: d }))
          }
          onPageChange={(page) => setParams((p) => ({ ...p, page }))}
          emptyTitle="No contacts yet"
        />
      </div>

      <FormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          reset();
        }}
        title="Add New Contact"
        onSubmit={handleSubmit((d) => createMutation.mutate(d))}
        loading={createMutation.isPending}
        submitLabel="Create Contact"
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input
                className="input"
                placeholder="John"
                {...register("firstName", {
                  required: "First name is required",
                })}
              />
              {errors.firstName && (
                <p className="text-[11px] text-red-500">
                  {errors.firstName.message}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input
                className="input"
                placeholder="Doe"
                {...register("lastName", { required: "Last name is required" })}
              />
              {errors.lastName && (
                <p className="text-[11px] text-red-500">
                  {errors.lastName.message}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="john@example.com"
                {...register("email")}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input
                className="input"
                placeholder="+977 98XXXXXXXX"
                {...register("phone")}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Job Title</label>
              <input
                className="input"
                placeholder="e.g. Sales Manager"
                {...register("jobTitle")}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <input
                className="input"
                placeholder="e.g. Marketing"
                {...register("department")}
              />
            </div>
            <div className="form-group col-span-2">
              <label className="form-label">Account</label>

              <select className="input" {...register("accountId")}>
                <option value="">Select Account</option>

                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))} 
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="input"
              rows={3}
              placeholder="Any additional notes..."
              {...register("notes")}
            />
          </div>
        </div>
      </FormModal>
    </div>
  );
}