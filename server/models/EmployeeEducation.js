import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

/*
|--------------------------------------------------------------------------
| Employee education
|--------------------------------------------------------------------------
|
| One row per qualification. A separate table rather than columns on
| `employees` because the relationship is genuinely one-to-many: an
| employee has an SEE, a +2, a Bachelor's, maybe a Master's, plus
| certifications. Flattening that into highestDegree/institution columns
| loses everything below the top one, and HR routinely needs the full
| ladder for verification.
|
| Scoped through the employee, not by its own companyId — the same
| pattern EmployeeDocument uses. Every route loads the employee with
| `where: { id, companyId: req.companyId }` first, so a row can only ever
| be reached through a tenant-checked parent.
*/
class EmployeeEducation extends Model {}

EmployeeEducation.init(
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

    /*
     * The rung on the ladder, kept separate from the free-text degree
     * name. "Bachelor of Computer Application" and "BSc Physics" are
     * both `level: 'Bachelor'`, which is what makes it possible to sort
     * qualifications and answer "what is their highest?" reliably.
     *
     * Nepal-specific rungs (SEE, +2) are included because that is the
     * ladder this CRM's users actually hire against.
     */
    level: {
      type: DataTypes.ENUM(
        "SEE/SLC",
        "+2/Intermediate",
        "Diploma",
        "Bachelor",
        "Master",
        "MPhil",
        "PhD",
        "Certification",
        "Other"
      ),
      allowNull: false,
      defaultValue: "Other",
    },

    // "Bachelor of Computer Application", "AWS Solutions Architect"
    degree: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    fieldOfStudy: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    institution: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Awarding body: Tribhuvan University, NEB, Pokhara University, AWS.
    board: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    /*
     * Years, not dates. Nobody remembers the day they started their
     * Bachelor's, and asking for one produces garbage data. A range of
     * 1950-2100 catches typos like 202 or 20255 without rejecting a
     * legitimate in-progress course.
     */
    startYear: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1950, max: 2100 },
    },

    endYear: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: { min: 1950, max: 2100 },
    },

    // Currently studying — endYear is then the expected completion.
    isPursuing: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    /*
     * Grading is not comparable across systems, so store HOW it was
     * measured alongside the value instead of forcing everything into a
     * percentage. "3.6" means nothing without knowing it is a GPA.
     */
    gradeType: {
      type: DataTypes.ENUM("Percentage", "GPA", "Division", "Grade", "Not Applicable"),
      defaultValue: "Not Applicable",
    },

    gradeValue: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    // Link to the scanned certificate, if one has been uploaded.
    documentUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    /*
     * Has HR seen the original certificate?
     *
     * Recorded rather than assumed: an unverified qualification is not
     * the same as a verified one, and on the day it matters somebody
     * will need to know which this was.
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
    modelName: "EmployeeEducation",
    tableName: "employee_educations",

    /*
     * timestamps ON, deliberately.
     *
     * EmployeeDocument was created with timestamps:false, and the
     * documents route then had to order by `uploadedAt` because
     * createdAt does not exist on it — a footgun that has already been
     * commented in employees.routes.js. Not repeating it here.
     */
    timestamps: true,

    indexes: [
      { fields: ["employeeId"] },
      { fields: ["employeeId", "level"] },
    ],
  }
);

export default EmployeeEducation;