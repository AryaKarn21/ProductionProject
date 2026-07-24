import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class Shift extends Model {}

Shift.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },

    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },

    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    // Days of the week this shift is OFF (weekly off), 0 = Sunday ... 6 = Saturday.
    // No SQL-level defaultValue here — MySQL versions before 8.0.13 reject a
    // DEFAULT on JSON columns outright, which breaks the whole table. The
    // hook below achieves the same default ([6] = Saturday) at the
    // application level instead, which works on every MySQL version.
    weeklyOffDays: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Shift",
    tableName: "shifts",
    timestamps: true,
    hooks: {
      beforeValidate: (shift) => {
        if (shift.weeklyOffDays == null) {
          shift.weeklyOffDays = [6];
        }
      },
    },
  }
);

export default Shift;