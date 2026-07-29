import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class Employee extends Model {}

Employee.init(
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

    // Optional link to User account
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      unique: true,
    },

    employeeId: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    // =========================================================
    // Personal Information
    // =========================================================

    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // IMPORTANT:
    // Keep only ONE email field.
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: "Email is required",
        },

        isEmailOrBlank(value) {
          if (value === null || value === undefined || value === "") {
            return;
          }

          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            throw new Error("Must be a valid email address");
          }
        },
      },
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    gender: {
      type: DataTypes.ENUM(
        "Male",
        "Female",
        "Other"
      ),
      allowNull: true,
    },

    maritalStatus: {
      type: DataTypes.ENUM(
        "Single",
        "Married",
        "Divorced",
        "Widowed"
      ),
      allowNull: true,
    },

    bloodGroup: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    nationality: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    citizenshipNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // =========================================================
    // Contact Information
    // =========================================================

    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    country: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    postalCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    emergencyContactName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    emergencyPhone: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // =========================================================
    // Employment Information
    // =========================================================

    department: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    designation: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    joinDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    employmentType: {
      type: DataTypes.ENUM(
        "Full-Time",
        "Part-Time",
        "Contract",
        "Intern",
        "Consultant"
      ),
      defaultValue: "Full-Time",
    },

    confirmationDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    // Must contain a valid Shift UUID or null.
    // Never send "".
    shiftId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    // Must contain a valid Employee UUID or null.
    // Never send "".
    reportingManagerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    workLocation: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        "active",
        "inactive",
        "on_leave",
        "terminated"
      ),
      defaultValue: "active",
    },

    // =========================================================
    // Salary Information
    // =========================================================

    salary: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    salaryType: {
      type: DataTypes.ENUM(
        "Monthly",
        "Daily",
        "Hourly"
      ),
      defaultValue: "Monthly",
    },

    currency: {
      type: DataTypes.STRING,
      defaultValue: "NPR",
    },

    salaryEffectiveDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    allowances: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    bonus: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    overtime: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    tax: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    pf: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    insurance: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },

    // =========================================================
    // Bank Information
    // =========================================================

    bankName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    accountHolderName: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    bankAccountNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    ifscSwiftCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    paymentMethod: {
      type: DataTypes.ENUM(
        "Bank Transfer",
        "Cash",
        "Cheque",
        "Digital Wallet"
      ),
      defaultValue: "Bank Transfer",
    },

    // =========================================================
    // Government Information
    // =========================================================

    panTaxNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    pfNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    esiNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // =========================================================
    // Background (education + past employment)
    // =========================================================
    //
    // The detail lives in two child tables — employee_educations and
    // employee_experiences. These two columns are the SUMMARY, kept
    // here so the employee list can filter and sort on them without
    // joining and aggregating two tables on every page load.

    /*
     * Fresher or experienced.
     *
     * Stored explicitly rather than derived from "are there any
     * experience rows?", because that question cannot tell a genuine
     * fresher apart from a record nobody has filled in yet. Those are
     * very different things to an HR manager, and conflating them
     * means the gap never gets noticed.
     */
    employmentBackground: {
      type: DataTypes.ENUM(
        "Fresher",
        "Experienced"
      ),
      defaultValue: "Fresher",
    },

    /*
     * Total prior experience in MONTHS.
     *
     * Months, not years: "2.5 years" as a float invites rounding
     * arguments at appraisal time, and an integer month count is
     * exact. Recalculated server-side from employee_experiences
     * whenever a row is added, edited or removed — never written
     * directly from a request body, so it cannot drift from the rows
     * it summarises.
     */
    totalExperienceMonths: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: { min: 0 },
    },

    // =========================================================
    // Misc
    // =========================================================

    salaryNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },

  {
    sequelize,

    modelName: "Employee",

    tableName: "employees",

    timestamps: true,

    indexes: [
      {
        unique: true,
        fields: ["companyId", "employeeId"],
      },

      {
        fields: ["companyId", "department"],
      },

      {
        fields: ["companyId", "status"],
      },

      {
        fields: ["shiftId"],
      },

      {
        fields: ["reportingManagerId"],
      },
    ],
  }
);

export default Employee;