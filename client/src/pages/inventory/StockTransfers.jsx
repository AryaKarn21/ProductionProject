import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import FormModal from "@/components/shared/FormModal";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Plus } from "lucide-react";

import { inventoryAPI } from "@/api/inventory.api";

import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import Badge from "@/components/ui/Badge";

export default function StockTransfers() {
  const [params, setParams] = useState({
    search: "",
    status: "",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      itemId: "",
      fromWarehouseId: "",
      toWarehouseId: "",
      quantity: 1,
      transferDate: new Date().toISOString().split("T")[0],
      remarks: "",
    },
  });
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["stock-transfers", params],
    queryFn: () => inventoryAPI.getTransfers(params).then((r) => r.data),
  });

  const { data: items = [] } = useQuery({
    queryKey: ["inventory-items"],
    queryFn: () => inventoryAPI.getItems().then((res) => res.data.items || []),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => inventoryAPI.getWarehouses().then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: inventoryAPI.createTransfer,

    onSuccess: () => {
      toast.success("Stock transferred successfully");

      queryClient.invalidateQueries({
        queryKey: ["stock-transfers"],
      });

      reset();

      setModalOpen(false);
    },

    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to create transfer");
    },
  });

  const columns = [
    {
      key: "referenceNo",
      label: "Reference",
    },

    {
      key: "item",
      label: "Item",
      render: (_, row) => row.item?.name || "—",
    },

    {
      key: "fromWarehouse",
      label: "From",
      render: (_, row) => row.fromWarehouse?.name || "—",
    },

    {
      key: "toWarehouse",
      label: "To",
      render: (_, row) => row.toWarehouse?.name || "—",
    },

    {
      key: "quantity",
      label: "Qty",
    },

    {
      key: "status",
      label: "Status",
      render: (value) => (
        <Badge variant={value === "Completed" ? "success" : "gray"}>
          {value}
        </Badge>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4">
        <div>
          <h1
            className="text-[18px] font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Stock Transfers
          </h1>

          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {data.length} Transfers
          </p>
        </div>

        <button className="btn btn-primary w-full sm:w-auto justify-center" onClick={() => setModalOpen(true)}>
          <Plus size={15} />
          New Transfer
        </button>
      </div>

      <FilterBar
        searchPlaceholder="Search Transfer..."
        values={params}
        onChange={(k, v) =>
          setParams((prev) => ({
            ...prev,
            [k]: v,
          }))
        }
      />

      <div className="mx-3 sm:mx-6 mb-6 card overflow-hidden">
        <DataTable
          columns={columns}
          data={data}
          loading={isLoading}
          error={error}
          page={1}
          total={data.length}
          pageSize={20}
          onPageChange={() => {}}
          emptyTitle="No Transfers"
          emptyDescription="Create your first stock transfer."
          mobileCard={(row) => (
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {row.referenceNo}
                </p>
                <Badge variant={row.status === "Completed" ? "success" : "gray"}>{row.status}</Badge>
              </div>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {row.item?.name || "—"}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                <span className="truncate">{row.fromWarehouse?.name || "—"}</span>
                <ArrowRightLeft size={11} className="flex-shrink-0" />
                <span className="truncate">{row.toWarehouse?.name || "—"}</span>
                <span className="ml-auto flex-shrink-0">Qty {row.quantity}</span>
              </div>
            </div>
          )}
        />
      </div>

      <FormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          reset();
        }}
        title="New Stock Transfer"
        submitLabel="Transfer Stock"
        loading={createMutation.isPending}
        onSubmit={handleSubmit((formData) => createMutation.mutate(formData))}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group col-span-2">
            <label className="form-label">Inventory Item *</label>

            <select
              className="input"
              {...register("itemId", {
                required: "Please select an item",
              })}
            >
              <option value="">Select Item</option>

              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} - {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">From Warehouse</label>

            <select className="input" {...register("fromWarehouseId")}>
              <option value="">Select Warehouse</option>

              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} - {warehouse.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">To Warehouse</label>

            <select className="input" {...register("toWarehouseId")}>
              <option value="">Select Warehouse</option>

              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} - {warehouse.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Quantity</label>

            <input type="number" className="input" {...register("quantity")} />
          </div>

          <div className="form-group">
            <label className="form-label">Transfer Date</label>

            <input
              type="date"
              className="input"
              {...register("transferDate")}
            />
          </div>

          <div className="form-group col-span-2">
            <label className="form-label">Remarks</label>

            <textarea rows={3} className="input" {...register("remarks")} />
          </div>
        </div>
      </FormModal>
    </div>
  );
}