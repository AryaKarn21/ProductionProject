import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

/*
|--------------------------------------------------------------------------
| Employee work experience
|--------------------------------------------------------------------------
|
| One row per previous job. This is the record HR reaches for when
| somebody asks "what did we actually hire this person on the strength
| of?" — so it carries not just where they worked, but the things that
| are impossible to reconstruct later: who the referee was, why they
| left, and whether anybody checked.
|
| PREVIOUS employment only. The current role at THIS company lives on the
| employees table (designation, department, joinDate) and is not
| duplicated here — two sources for the same fact drift apart, and then
| nobody knows which is right.
|
| Scoped through the employee, same as EmployeeEducation.
*/
class EmployeeExperience extends Model {}

EmployeeExperience.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    companyName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    designation: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    department: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    /*
     * Mirrors employees.employmentType, with Internship and Freelance
     * added. A candidate's history routinely includes both, and folding
     * them into "Contract" would misrepresent the record — an internship
     * is not equivalent experience and an interviewer needs to see that.
     */
    employmentType: {
      type: DataTypes.ENUM(
        "Full-Time",
        "Part-Time",
        "Contract",
        "Internship",
        "Freelance",
        "Consultant"
      ),
      defaultValue: "Full-Time",
    },

    location: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    /*
     * Null while isCurrent is true.
     *
     * The route layer enforces the pairing, because the two can
     * contradict each other and a contradiction here silently corrupts
     * the total-experience calculation.
     */
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    // Still working there — true for a candidate serving notice.
    isCurrent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    lastSalary: {
      type: DataTypes.FLOAT,
      allowNull: true,
      validate: { min: 0 },
    },

    currency: {
      type: DataTypes.STRING(10),
      defaultValue: "NPR",
    },

    responsibilities: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    reasonForLeaving: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    // ── Reference ────────────────────────────────────────────────
    referenceName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    referenceDesignation: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    referenceContact: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Experience / relieving letter.
    documentUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    /*
     * Has this employment been confirmed with the previous employer?
     *
     * Kept as three separate facts — whether, when, by whom — rather
     * than a single boolean. "Verified" with no date and no name is not
     * actually verified by anyone's standard.
     */
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    verifiedById: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "EmployeeExperience",
    tableName: "employee_experiences",
    timestamps: true,

    indexes: [
      { fields: ["employeeId"] },
      { fields: ["employeeId", "startDate"] },
    ],
  }
);

export default EmployeeExperience;