import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

import { opportunitiesAPI } from "@/api/opportunities.api";
import { accountsAPI } from "@/api/accounts.api";
import { settingsAPI } from "@/api/settings.api";
import { opportunitySchema } from "@/lib/validations";

export default function OpportunityEdit() {
  const { id } = useParams();

  const navigate = useNavigate();


  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(opportunitySchema),

    defaultValues: {
      name: "",
      accountId: "",
      stage: "",
      value: 0,
      probability: 0,
      closeDate: "",
      assignedToId: "",
      description: "",
    },
  });

  // Opportunity
  const { data: opportunity, isLoading } = useQuery({
    queryKey: ["opportunity", id],

    queryFn: () => opportunitiesAPI.getById(id).then((res) => res.data),
  });

  // Accounts
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

  // Users
  const { data: usersData } = useQuery({
    queryKey: ["users"],

    queryFn: () =>
      settingsAPI
        .getUsers({
          page: 1,
          limit: 1000,
        })
        .then((res) => res.data),
  });

  const users = usersData?.users || usersData || [];

  useEffect(() => {
    if (!opportunity) return;

    reset({
      name: opportunity.name || "",
      accountId: opportunity.accountId || "",
      stage: opportunity.stage || "",
      value: opportunity.value || 0,
      probability: opportunity.probability || 0,
      closeDate: opportunity.closeDate?.slice(0, 10) || "",
      assignedToId: opportunity.assignedToId || "",
      description: opportunity.description || "",
    });
  }, [opportunity, reset]);

 

  
  const updateMutation = useMutation({
  mutationFn: async (data) => {
    console.log("Sending PATCH...");

    const res = await opportunitiesAPI.update(id, {
      ...data,
      value: Number(data.value),
      probability: Number(data.probability),
      assignedToId: data.assignedToId || null,
    });

    console.log("PATCH Response:", res);

    return res;
  },

  onSuccess: () => {
    console.log("SUCCESS");

    toast.success("Opportunity updated successfully");

    navigate(`/crm/opportunities/${id}`);
  },

  onError: (err) => {
    console.log("ERROR:", err);
    console.log("Response:", err.response);
    console.log("Data:", err.response?.data);

    toast.error(
      err.response?.data?.message ||
      "Failed to update opportunity"
    );
  },
});
if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }
  return (
    <div className="animate-fade-in p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </button>

        <h1 className="text-2xl font-bold">Edit Opportunity</h1>
      </div>

      <form
        className="card p-4 sm:p-6 flex flex-col gap-5"
        onSubmit={handleSubmit((data) => {
  console.log("Submitted:", data);

  updateMutation.mutate(data);
})}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Opportunity Name */}
          <div className="form-group">
            <label>Opportunity Name *</label>

            <input className="input" {...register("name")} />

            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Account */}
          <div className="form-group">
            <label>Account *</label>

            <select className="input" {...register("accountId")}>
              <option value="">Select Account</option>

              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stage */}
          <div className="form-group">
            <label>Stage *</label>

            <select className="input" {...register("stage")}>
              <option value="">Select Stage</option>
              <option value="Prospecting">Prospecting</option>
              <option value="Qualification">Qualification</option>
              <option value="Proposal">Proposal</option>
              <option value="Negotiation">Negotiation</option>
              <option value="Closed Won">Closed Won</option>
              <option value="Closed Lost">Closed Lost</option>
            </select>
          </div>

          {/* Value */}
          <div className="form-group">
            <label>Value</label>

            <input type="number" className="input" {...register("value")} />
          </div>

          {/* Probability */}
          <div className="form-group">
            <label>Probability (%)</label>

            <input
              type="number"
              className="input"
              {...register("probability")}
            />
          </div>

          {/* Close Date */}
          <div className="form-group">
            <label>Close Date</label>

            <input type="date" className="input" {...register("closeDate")} />
          </div>

          {/* Owner */}
          <div className="form-group md:col-span-2">
            <label>Owner</label>

            <select className="input" {...register("assignedToId")}>
              <option value="">Unassigned</option>

              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="form-group md:col-span-2">
            <label>Description</label>

            <textarea rows={5} className="input" {...register("description")} />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            className="btn btn-secondary w-full sm:w-auto"
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="btn btn-primary w-full sm:w-auto"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
