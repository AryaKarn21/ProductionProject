import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class Holiday extends Model {}

Holiday.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    companyId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    sequelize,
    modelName: "Holiday",
    tableName: "holidays",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["companyId", "date"] },
    ],
  },
);

export default Holiday;