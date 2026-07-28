import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class InventoryItem extends Model {}

InventoryItem.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    sku: { type: DataTypes.STRING },
    /*
     * `code` was declared TWICE in this object. JavaScript keeps the
     * last one, so the earlier `unique: true` was silently discarded.
     *
     * That turned out to be the lucky outcome: a bare `unique: true`
     * makes the code globally unique across the whole platform, so two
     * companies could not both use item code "A001". The database
     * actually enforces a COMPOSITE unique index on (companyId, code) —
     * per company, which is correct for a multi-tenant system.
     *
     * The single declaration below plus the explicit index in the
     * options block now match the database exactly.
     */
    code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    category: { type: DataTypes.STRING },
    unit: { type: DataTypes.STRING, defaultValue: "pcs" },
    quantity: { type: DataTypes.FLOAT, defaultValue: 0 },
    unitPrice: { type: DataTypes.FLOAT, defaultValue: 0 },
    reorderPoint: { type: DataTypes.FLOAT, defaultValue: 0 },
    valuationMethod: {
      type: DataTypes.ENUM("FIFO", "LIFO", "Weighted Average"),
      defaultValue: "FIFO",
    },
    warehouseId: { type: DataTypes.UUID, allowNull: true },
    description: { type: DataTypes.TEXT },
  },
  {
    sequelize,
    modelName: "InventoryItem",
    tableName: "inventory_items",
    timestamps: true,
    /*
     * These already exist in the database but were declared nowhere in
     * the model, so Sequelize had no idea they were there. Running
     * sync({ alter: true }) against an undeclared index is exactly how
     * a unique constraint gets quietly dropped — including the one
     * stopping two items in the same company sharing a code.
     *
     * Declaring them makes the model an honest description of the
     * table. Names match the existing indexes, so this is a no-op
     * against the current schema rather than a migration.
     */
    indexes: [
      { name: "inventory_items_code_unique", unique: true, fields: ["companyId", "code"] },
      { name: "inventory_items_company_id_category", fields: ["companyId", "category"] },
      { name: "inventory_items_warehouse_id", fields: ["warehouseId"] },
      { name: "inventory_items_sku", fields: ["sku"] },
      { name: "inventory_items_company_id", fields: ["companyId"] },
    ],
  },
);

export default InventoryItem;
