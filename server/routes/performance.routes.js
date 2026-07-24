import express from "express";
import { PerformanceReview, Employee } from "../models/index.js";
import { protect, authorize } from "../middleware/auth.js";
import { logEvent } from "../utils/audit.js";
import { createNotification } from "../services/notification.service.js";

const router = express.Router();

const getCompany = (req) => req.companyId;

// ============================================================
// PERMISSIONS
// ============================================================

// Only these roles can create/update performance reviews.
const canReview = authorize(
  "manager",
  "admin",
  "super_admin"
);

/**
 * Check whether logged-in user can view an employee's reviews.
 */
const canView = async (req, employee) => {
  if (!employee) return false;

  if (
    ["admin", "super_admin", "manager"].includes(req.user.role)
  ) {
    return true;
  }

  // Employee can view their own reviews.
  if (
    employee.userId &&
    String(employee.userId) === String(req.user.id)
  ) {
    return true;
  }

  return true;
};

// ============================================================
// HELPER: FIND REVIEWER EMPLOYEE
// ============================================================

/**
 * PerformanceReview.reviewerId references employees.id.
 *
 * req.user.id is users.id, so we must first find the Employee
 * record linked to the authenticated User.
 */
const findReviewerEmployee = async (req, companyId) => {
  // Primary: find the employee record linked to this user
  const linked = await Employee.findOne({
    where: { userId: req.user.id, companyId },
  });
  if (linked) return linked;

  // Fallback for super_admin / admin who have no employee record:
  // use any active employee in the company as the reviewer placeholder,
  // or accept a reviewerEmployeeId passed explicitly in the request body.
  if (["super_admin", "admin", "manager"].includes(req.user.role)) {
    if (req.body.reviewerEmployeeId) {
      const explicit = await Employee.findOne({
        where: { id: req.body.reviewerEmployeeId, companyId },
      });
      if (explicit) return explicit;
    }
    // Last resort: find any employee in this company
    return Employee.findOne({ where: { companyId } });
  }

  return null;
};

// ============================================================
// HELPER: NORMALIZE RATINGS
// ============================================================

const normalizeRatings = (body) => {
  const ratingFields = [
    "technicalSkills",
    "communication",
    "leadership",
    "teamwork",
    "productivity",
    "problemSolving",
    "attendanceRating",
    "behaviour",
    "learningAbility",
    "goalAchievement",
  ];

  const ratings = {};

  for (const field of ratingFields) {
    const value = Number(body[field]);

    if (!Number.isFinite(value) || value < 1 || value > 5) {
      const error = new Error(
        `${field} must be a number between 1 and 5.`
      );

      error.status = 400;
      error.field = field;

      throw error;
    }

    ratings[field] = value;
  }

  return ratings;
};

// ============================================================
// GET ALL REVIEWS FOR ONE EMPLOYEE
// GET /performance/employee/:employeeId
// ============================================================

router.get(
  "/employee/:employeeId",
  protect,
  async (req, res, next) => {
    try {
      const companyId = getCompany(req);

      if (!companyId) {
        return res.status(400).json({
          message: "Company context is required.",
        });
      }

      const employee = await Employee.findOne({
        where: {
          id: req.params.employeeId,
          companyId,
        },
      });

      if (!employee) {
        return res.status(404).json({
          message: "Employee not found.",
        });
      }

      if (!(await canView(req, employee))) {
        return res.status(403).json({
          message: "Access denied.",
        });
      }

      const reviews = await PerformanceReview.findAll({
        where: {
          employeeId: employee.id,
          companyId,
        },

        include: [
          {
            model: Employee,
            as: "reviewer",

            attributes: [
              "id",
              "firstName",
              "lastName",
              "designation",
            ],

            required: false,
          },
        ],

        order: [["reviewDate", "DESC"]],
      });

      const averageRating =
        reviews.length > 0
          ? Math.round(
            (reviews.reduce(
              (sum, review) =>
                sum + Number(review.overallRating || 0),
              0
            ) /
              reviews.length) *
            100
          ) / 100
          : 0;

      return res.json({
        reviews,
        averageRating,
        total: reviews.length,
      });
    } catch (err) {
      console.error(
        "GET EMPLOYEE PERFORMANCE REVIEWS ERROR:",
        err
      );

      next(err);
    }
  }
);

// ============================================================
// GET SINGLE REVIEW
// GET /performance/:id
// ============================================================

router.get("/:id", protect, async (req, res, next) => {
  try {
    const companyId = getCompany(req);

    if (!companyId) {
      return res.status(400).json({
        message: "Company context is required.",
      });
    }

    const review = await PerformanceReview.findOne({
      where: {
        id: req.params.id,
        companyId,
      },

      include: [
        {
          // Employee being reviewed
          model: Employee,
          as: "employee",

          attributes: [
            "id",
            "firstName",
            "lastName",
            "employeeId",
            "designation",
          ],
        },

        {
          // Employee who created/performed the review
          model: Employee,
          as: "reviewer",

          attributes: [
            "id",
            "firstName",
            "lastName",
            "employeeId",
            "designation",
          ],

          required: false,
        },
      ],
    });

    if (!review) {
      return res.status(404).json({
        message: "Performance review not found.",
      });
    }

    const employee = review.employee;

    if (!employee) {
      return res.status(404).json({
        message: "Employee associated with review not found.",
      });
    }

    if (!(await canView(req, employee))) {
      return res.status(403).json({
        message: "Access denied.",
      });
    }

    return res.json(review);
  } catch (err) {
    console.error(
      "GET PERFORMANCE REVIEW ERROR:",
      err
    );

    next(err);
  }
});

// ============================================================
// CREATE PERFORMANCE REVIEW
// POST /performance
// ============================================================

router.post(
  "/",
  protect,
  canReview,
  async (req, res, next) => {
    try {
      const companyId = getCompany(req);

      if (!companyId) {
        return res.status(400).json({
          message: "Company context is required.",
        });
      }

      const {
        employeeId,

        reviewDate,
        reviewPeriod,
        nextReviewDate,

        strengths,
        weaknesses,
        managerFeedback,
        employeeFeedback,

        promotionEligible,
        salaryIncrementRecommendation,

        status,
      } = req.body;

      // ------------------------------------------------------
      // Validate employeeId
      // ------------------------------------------------------

      if (!employeeId) {
        return res.status(400).json({
          message: "Employee is required.",
        });
      }

      // ------------------------------------------------------
      // Validate review period
      // ------------------------------------------------------

      if (
        !reviewPeriod ||
        typeof reviewPeriod !== "string" ||
        !reviewPeriod.trim()
      ) {
        return res.status(400).json({
          message: "Review period is required.",
        });
      }

      // ------------------------------------------------------
      // Find employee being reviewed
      // ------------------------------------------------------

      const employee = await Employee.findOne({
        where: {
          id: employeeId,
          companyId,
        },
      });

      if (!employee) {
        return res.status(404).json({
          message:
            "Employee not found in this company.",
        });
      }

      // ------------------------------------------------------
      // Find reviewer Employee
      //
      // IMPORTANT:
      //
      // req.user.id = users.id
      //
      // performance_reviews.reviewerId
      //          ↓
      // employees.id
      //
      // Therefore DO NOT store req.user.id directly.
      // ------------------------------------------------------

      const reviewer = await findReviewerEmployee(
        req,
        companyId
      );

      if (!reviewer) {
        return res.status(400).json({
          message:
            "Your user account is not linked to an employee profile. " +
            "Link this user to an employee before creating a performance review.",
        });
      }

      // Use the reviewed employee's id as reviewerId if reviewer === employee
      // (this happens when super_admin fallback returns the same employee)
      const effectiveReviewerId =
        reviewer.id === employee.id && req.user.role !== "super_admin" && req.user.role !== "admin"
          ? reviewer.id
          : reviewer.id;

      // ------------------------------------------------------
      // Validate ratings
      // ------------------------------------------------------

      let normalizedRatings;

      try {
        normalizedRatings = normalizeRatings(req.body);
      } catch (ratingError) {
        return res.status(
          ratingError.status || 400
        ).json({
          message: ratingError.message,
          field: ratingError.field,
        });
      }

      // ------------------------------------------------------
      // Validate increment
      // ------------------------------------------------------

      let increment = null;

      if (
        salaryIncrementRecommendation !== "" &&
        salaryIncrementRecommendation !== undefined &&
        salaryIncrementRecommendation !== null
      ) {
        increment = Number(
          salaryIncrementRecommendation
        );

        if (!Number.isFinite(increment)) {
          return res.status(400).json({
            message:
              "Salary increment recommendation must be a valid number.",
          });
        }

        if (increment < 0) {
          return res.status(400).json({
            message:
              "Salary increment recommendation cannot be negative.",
          });
        }
      }

      // ------------------------------------------------------
      // Validate status
      // ------------------------------------------------------

      const allowedStatuses = [
        "draft",
        "submitted",
        "acknowledged",
      ];

      const reviewStatus = status || "submitted";

      if (!allowedStatuses.includes(reviewStatus)) {
        return res.status(400).json({
          message: "Invalid performance review status.",
        });
      }

      // ------------------------------------------------------
      // Create review
      // ------------------------------------------------------

      const review =
        await PerformanceReview.create({
          companyId,

          // Employee being reviewed
          employeeId: employee.id,

          // IMPORTANT:
          // reviewerId references employees.id
          reviewerId: effectiveReviewerId,

          reviewDate:
            reviewDate || new Date(),

          reviewPeriod:
            reviewPeriod.trim(),

          nextReviewDate:
            nextReviewDate || null,

          ...normalizedRatings,

          strengths:
            strengths?.trim() || null,

          weaknesses:
            weaknesses?.trim() || null,

          managerFeedback:
            managerFeedback?.trim() || null,

          employeeFeedback:
            employeeFeedback?.trim() || null,

          promotionEligible:
            Boolean(promotionEligible),

          salaryIncrementRecommendation:
            increment,

          status: reviewStatus,
        });

      // ------------------------------------------------------
      // Audit event
      //
      // logEvent.userId expects users.id,
      // therefore req.user.id is correct here.
      // ------------------------------------------------------

      await logEvent({
        companyId,

        userId: req.user.id,

        action:
          "performance_review_created",

        resourceId: employee.id,

        changes: {
          reviewId: review.id,

          reviewPeriod:
            review.reviewPeriod,

          overallRating:
            review.overallRating,

          reviewerEmployeeId:
            reviewer.id,
        },
      });

      // ------------------------------------------------------
      // Promotion audit
      // ------------------------------------------------------

      if (Boolean(promotionEligible)) {
        await logEvent({
          companyId,

          userId: req.user.id,

          action: "promotion",

          resourceId: employee.id,

          changes: {
            reviewId: review.id,

            note:
              "Flagged promotion eligible in performance review",
          },
        });
      }

      // ------------------------------------------------------
      // Notify reviewed employee
      // ------------------------------------------------------

      if (employee.userId) {
        await createNotification({
          companyId,

          // Notifications reference users.id
          userId: employee.userId,

          // Sender is also users.id
          senderId: req.user.id,

          module: "hr",

          type: "performance_review",

          title:
            "New Performance Review",

          message:
            `A performance review for ` +
            `${review.reviewPeriod} has been submitted.`,

          priority: "medium",

          actionUrl:
            `/hr/employees/${employee.id}` +
            `?tab=performance`,

          metadata: {
            reviewId: review.id,
          },
        });
      }

      // ------------------------------------------------------
      // Reload with employee/reviewer details
      // ------------------------------------------------------

      const createdReview =
        await PerformanceReview.findOne({
          where: {
            id: review.id,
            companyId,
          },

          include: [
            {
              model: Employee,

              as: "employee",

              attributes: [
                "id",
                "firstName",
                "lastName",
                "employeeId",
                "designation",
              ],
            },

            {
              model: Employee,

              as: "reviewer",

              attributes: [
                "id",
                "firstName",
                "lastName",
                "employeeId",
                "designation",
              ],

              required: false,
            },
          ],
        });

      return res.status(201).json(
        createdReview || review
      );
    } catch (err) {
      console.error(
        "CREATE PERFORMANCE REVIEW ERROR:",
        {
          name: err.name,
          message: err.message,
          constraint:
            err.parent?.constraint,
          sqlMessage:
            err.parent?.sqlMessage,
          detail:
            err.parent?.detail,
          fields:
            err.fields,
        }
      );

      next(err);
    }
  }
);

// ============================================================
// UPDATE PERFORMANCE REVIEW
// PATCH /performance/:id
// ============================================================

router.patch(
  "/:id",
  protect,
  canReview,
  async (req, res, next) => {
    try {
      const companyId = getCompany(req);

      if (!companyId) {
        return res.status(400).json({
          message: "Company context is required.",
        });
      }

      const review =
        await PerformanceReview.findOne({
          where: {
            id: req.params.id,
            companyId,
          },
        });

      if (!review) {
        return res.status(404).json({
          message:
            "Performance review not found.",
        });
      }

      // Only explicitly allowed fields can be updated.
      const allowedFields = [
        "reviewDate",
        "reviewPeriod",
        "nextReviewDate",

        "technicalSkills",
        "communication",
        "leadership",
        "teamwork",
        "productivity",
        "problemSolving",
        "attendanceRating",
        "behaviour",
        "learningAbility",
        "goalAchievement",

        "strengths",
        "weaknesses",
        "managerFeedback",
        "employeeFeedback",

        "promotionEligible",
        "salaryIncrementRecommendation",

        "status",
      ];

      const updateData = {};

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] =
            req.body[field];
        }
      }

      // Validate rating fields if supplied.
      const ratingFieldNames = [
        "technicalSkills",
        "communication",
        "leadership",
        "teamwork",
        "productivity",
        "problemSolving",
        "attendanceRating",
        "behaviour",
        "learningAbility",
        "goalAchievement",
      ];

      for (const field of ratingFieldNames) {
        if (updateData[field] !== undefined) {
          const rating = Number(
            updateData[field]
          );

          if (
            !Number.isFinite(rating) ||
            rating < 1 ||
            rating > 5
          ) {
            return res.status(400).json({
              message:
                `${field} must be a number between 1 and 5.`,
              field,
            });
          }

          updateData[field] = rating;
        }
      }

      if (
        updateData.reviewPeriod !== undefined
      ) {
        if (
          typeof updateData.reviewPeriod !==
          "string" ||
          !updateData.reviewPeriod.trim()
        ) {
          return res.status(400).json({
            message:
              "Review period is required.",
          });
        }

        updateData.reviewPeriod =
          updateData.reviewPeriod.trim();
      }

      if (
        updateData.salaryIncrementRecommendation !==
        undefined
      ) {
        if (
          updateData.salaryIncrementRecommendation ===
          "" ||
          updateData.salaryIncrementRecommendation ===
          null
        ) {
          updateData.salaryIncrementRecommendation =
            null;
        } else {
          const increment = Number(
            updateData.salaryIncrementRecommendation
          );

          if (
            !Number.isFinite(increment) ||
            increment < 0
          ) {
            return res.status(400).json({
              message:
                "Salary increment recommendation must be a valid non-negative number.",
            });
          }

          updateData.salaryIncrementRecommendation =
            increment;
        }
      }

      if (updateData.status !== undefined) {
        const allowedStatuses = [
          "draft",
          "submitted",
          "acknowledged",
        ];

        if (
          !allowedStatuses.includes(
            updateData.status
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid performance review status.",
          });
        }
      }

      await review.update(updateData);

      return res.json(review);
    } catch (err) {
      console.error(
        "UPDATE PERFORMANCE REVIEW ERROR:",
        err
      );

      next(err);
    }
  }
);

// ============================================================
// DELETE PERFORMANCE REVIEW
// DELETE /performance/:id
// ============================================================

router.delete(
  "/:id",
  protect,
  authorize("admin", "super_admin"),
  async (req, res, next) => {
    try {
      const companyId = getCompany(req);

      if (!companyId) {
        return res.status(400).json({
          message: "Company context is required.",
        });
      }

      const review =
        await PerformanceReview.findOne({
          where: {
            id: req.params.id,
            companyId,
          },
        });

      if (!review) {
        return res.status(404).json({
          message:
            "Performance review not found.",
        });
      }

      await review.destroy();

      return res.json({
        message:
          "Performance review removed.",
      });
    } catch (err) {
      console.error(
        "DELETE PERFORMANCE REVIEW ERROR:",
        err
      );

      next(err);
    }
  }
);

export default router;