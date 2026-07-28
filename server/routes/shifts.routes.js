import express from "express";
import { Shift } from "../models/index.js";
import { protect } from "../middleware/auth.js";
import { findInScope } from '../utils/scope.js'

const router = express.Router();

const getCompany = (req) => req.companyId;

// Get all shifts
router.get("/", protect, async (req, res, next) => {
  try {
    const companyId = getCompany(req);

    const shifts = await Shift.findAll({
      where: { companyId },
      order: [["createdAt", "ASC"]],
    });

    res.json(shifts);
  } catch (err) {
    next(err);
  }
});

// Create shift
router.post("/", protect, async (req, res, next) => {
  try {
    const companyId = getCompany(req);

    const shift = await Shift.create({
      ...req.body,
      companyId,
    });

    res.status(201).json(shift);
  } catch (err) {
    next(err);
  }
});

// Update shift
router.patch("/:id", protect, async (req, res, next) => {
  try {
    const shift = await findInScope(req, Shift, req.params.id);

    if (!shift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }

    await shift.update(req.body);

    res.json(shift);
  } catch (err) {
    next(err);
  }
});

// Delete shift
router.delete("/:id", protect, async (req, res, next) => {
  try {
    const shift = await findInScope(req, Shift, req.params.id);

    if (!shift) {
      return res.status(404).json({
        message: "Shift not found",
      });
    }

    await shift.destroy();

    res.json({
      message: "Shift deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

export default router;