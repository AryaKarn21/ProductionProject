import express from "express";
import { Op } from "sequelize";
import { Leave, LeaveType, Employee, User } from "../models/index.js";
import { protect } from "../middleware/auth.js";
import { createNotification } from "../services/notification.service.js";
import { findInScope } from '../utils/scope.js'
const router = express.Router();
const getCompany = (req) => req.companyId;

router.get("/", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);
    const { page = 1, limit = 20, status, employeeId, search } = req.query;
    const where = {};
    if (company) where.companyId = company;
    if (status) where.status = status;

    // Employees can only see their own leave records.
    // HR / Admin / Super Admin can filter by any employeeId or see all.
    if (req.user.role === "employee") {
      const ownEmployee = await Employee.findOne({
        where: { userId: req.user.id, companyId: company },
        attributes: ["id"],
      });
      if (!ownEmployee) {
        // No employee record linked to this account yet — return empty
        return res.json({ leaves: [], total: 0 });
      }
      where.employeeId = ownEmployee.id;
    } else {
      if (employeeId) where.employeeId = employeeId;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows: leaves, count: total } = await Leave.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset,
      limit: parseInt(limit),
      include: [
        {
          model: Employee,
          as: "employee",
          attributes: ["firstName", "lastName", "department", "avatar"],
          where: search
            ? {
                [Op.or]: [
                  { firstName: { [Op.like]: `%${search}%` } },
                  { lastName: { [Op.like]: `%${search}%` } },
                ],
              }
            : undefined,
          required: !!search,
        },
        { model: User, as: "approvedBy", attributes: ["name"] },
      ],
    });
    res.json({ leaves, total });
  } catch (err) {
    next(err);
  }
});

router.get("/types", protect, async (req, res, next) => {
  try {
    const types = await LeaveType.findAll({
      where: { companyId: getCompany(req) },
    });
    res.json(types);
  } catch (err) {
    next(err);
  }
});
router.get("/:id", protect, async (req, res, next) => {
  try {
    const leave = await Leave.findOne({
      where: {
        id: req.params.id,
        companyId: getCompany(req),
      },
      include: [
        {
          model: Employee,
          as: "employee",
          attributes: ["id", "firstName", "lastName", "department", "avatar"],
        },
        {
          model: User,
          as: "approvedBy",
          attributes: ["id", "name"],
        },
      ],
    });

    if (!leave) {
      return res.status(404).json({
        message: "Leave request not found",
      });
    }

    res.json(leave);
  } catch (err) {
    next(err);
  }
});

router.post("/types", protect, async (req, res, next) => {
  try {
    const type = await LeaveType.create({
      ...req.body,
      companyId: getCompany(req),
    });
    res.status(201).json(type);
  } catch (err) {
    next(err);
  }
});

router.post("/", protect, async (req, res, next) => {
  try {
    let employee;

    if (req.user.role === "employee") {
      // SECURITY: Never trust the employeeId from the request body for
      // employees. Always derive the employee record from the authenticated
      // user's own account so they cannot submit on behalf of someone else.
      employee = await Employee.findOne({
        where: { userId: req.user.id, companyId: getCompany(req) },
      });
      if (!employee) {
        return res.status(403).json({
          message: "No employee record is linked to your account. Please contact HR.",
        });
      }
    } else {
      // HR / Admin / Super Admin: trust the supplied employeeId
      employee = await Employee.findByPk(req.body.employeeId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }
    }

    const start = new Date(req.body.startDate);
    const end = new Date(req.body.endDate);

    const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const leave = await Leave.create({
      ...req.body,
      employeeId: employee.id,   // always the server-resolved id
      days,
      companyId: getCompany(req),
    });

    await createNotification({
      companyId: leave.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "hr",
      type: "leave_applied",

      title: "Leave Application Submitted",

      message: `${employee.firstName} ${employee.lastName} applied for leave.`,

      priority: "medium",

      actionUrl: `/hr/leaves/${leave.id}`,

      metadata: {
        leaveId: leave.id,
        employeeId: employee.id,
      },
    });

    res.status(201).json(leave);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", protect, async (req, res, next) => {
  try {
    const leave = await Leave.findOne({
      where: {
        id: req.params.id,
        companyId: getCompany(req),
      },
    });
    if (!leave) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    // Employees can only edit their own leave records.
    if (req.user.role === "employee") {
      const ownEmployee = await Employee.findOne({
        where: { userId: req.user.id, companyId: getCompany(req) },
        attributes: ["id"],
      });
      if (!ownEmployee || String(leave.employeeId) !== String(ownEmployee.id)) {
        return res.status(403).json({ message: "You can only edit your own leave requests." });
      }
      // Employees cannot change the employeeId or status themselves
      delete req.body.employeeId;
      delete req.body.status;
    }

    // Optional: don't allow editing approved leave
    if (leave.status === "approved") {
      return res.status(400).json({
        message: "Approved leave cannot be edited.",
      });
    }

    let updateData = { ...req.body };

    // Recalculate leave days if dates changed
    if (req.body.startDate || req.body.endDate) {
      const start = new Date(req.body.startDate || leave.startDate);

      const end = new Date(req.body.endDate || leave.endDate);

      updateData.days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    }

    await leave.update(updateData);

    const employee = await Employee.findByPk(leave.employeeId);

    await createNotification({
      companyId: leave.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "hr",
      type: "leave_updated",

      title: "Leave Updated",

      message: `${employee.firstName} ${employee.lastName}'s leave request has been updated.`,

      priority: "medium",

      actionUrl: `/hr/leaves/${leave.id}/edit`,

      metadata: {
        leaveId: leave.id,
        employeeId: employee.id,
      },
    });

    res.json(leave);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/approve", protect, async (req, res, next) => {
  try {
    const leave = await findInScope(req, Leave, req.params.id);

    if (!leave) {
      return res.status(404).json({
        message: "Leave request not found",
      });
    }

    await leave.update({
      status: "approved",
      approvedById: req.user.id,
      approvedAt: new Date(),
    });

    const employee = await Employee.findByPk(leave.employeeId);

    await createNotification({
      companyId: leave.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "hr",
      type: "leave_approved",

      title: "Leave Approved",

      message: `${employee.firstName} ${employee.lastName}'s leave has been approved.`,

      priority: "high",

      actionUrl: `/hr/leaves/${leave.id}`,

      metadata: {
        leaveId: leave.id,
        employeeId: employee.id,
      },
    });

    res.json(leave);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/reject", protect, async (req, res, next) => {
  try {
    const leave = await findInScope(req, Leave, req.params.id);

    if (!leave) {
      return res.status(404).json({
        message: "Leave request not found",
      });
    }

    await leave.update({
      status: "rejected",
      approvedById: req.user.id,
      approvedAt: new Date(),
      remarks: req.body.remarks,
    });

    const employee = await Employee.findByPk(leave.employeeId);

    await createNotification({
      companyId: leave.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "hr",
      type: "leave_rejected",

      title: "Leave Rejected",

      message: `${employee.firstName} ${employee.lastName}'s leave has been rejected.`,

      priority: "high",

      actionUrl: `/hr/leaves/${leave.id}`,

      metadata: {
        leaveId: leave.id,
        employeeId: employee.id,
      },
    });

    res.json(leave);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", protect, async (req, res, next) => {
  try {
    const leave = await findInScope(req, Leave, req.params.id);

    if (!leave) {
      return res.status(404).json({
        message: "Leave request not found",
      });
    }

    const employee = await Employee.findByPk(leave.employeeId);

    await createNotification({
      companyId: leave.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "hr",
      type: "leave_deleted",

      title: "Leave Deleted",

      message: `${employee.firstName} ${employee.lastName}'s leave request has been deleted.`,

      priority: "low",

      actionUrl: "/hr/leaves",

      metadata: {
        leaveId: leave.id,
        employeeId: employee.id,
      },
    });

    await leave.destroy();

    res.json({
      message: "Leave request deleted",
    });
  } catch (err) {
    next(err);
  }
});

export default router;