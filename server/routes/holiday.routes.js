import express from "express";
import { Op } from "sequelize";
import { Holiday } from "../models/index.js";


const router = express.Router();



// GET /api/holidays
router.get("/", async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({
        message: "Active company is required",
      });
    }

    const { year } = req.query;

    const where = {
      companyId,
    };

    if (year) {
      where.date = {
        [Op.between]: [
          `${year}-01-01`,
          `${year}-12-31`,
        ],
      };
    }

    const holidays = await Holiday.findAll({
      where,
      order: [["date", "ASC"]],
    });

    res.json({
      holidays,
      total: holidays.length,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/holidays
router.post("/", async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user?.companyId;

    const {
      name,
      date,
      isActive = true,
    } = req.body;

    if (!companyId) {
      return res.status(400).json({
        message: "Active company is required",
      });
    }

    if (!name?.trim() || !date) {
      return res.status(400).json({
        message: "Holiday name and date are required",
      });
    }

    const existing = await Holiday.findOne({
      where: {
        companyId,
        date,
      },
    });

    if (existing) {
      return res.status(409).json({
        message: "A holiday already exists on this date",
      });
    }

    const holiday = await Holiday.create({
      companyId,
      name: name.trim(),
      date,
      isActive,
    });

    res.status(201).json({
      message: "Holiday created successfully",
      holiday,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/holidays/:id
router.patch("/:id", async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user?.companyId;

    const holiday = await Holiday.findOne({
      where: {
        id: req.params.id,
        companyId,
      },
    });

    if (!holiday) {
      return res.status(404).json({
        message: "Holiday not found",
      });
    }

    const {
      name,
      date,
      isActive,
    } = req.body;

    if (date && date !== holiday.date) {
      const duplicate = await Holiday.findOne({
        where: {
          companyId,
          date,
          id: {
            [Op.ne]: holiday.id,
          },
        },
      });

      if (duplicate) {
        return res.status(409).json({
          message: "A holiday already exists on this date",
        });
      }
    }

    await holiday.update({
      ...(name !== undefined && {
        name: name.trim(),
      }),

      ...(date !== undefined && {
        date,
      }),

      ...(isActive !== undefined && {
        isActive,
      }),
    });

    res.json({
      message: "Holiday updated successfully",
      holiday,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/holidays/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const companyId = req.companyId || req.user?.companyId;

    const holiday = await Holiday.findOne({
      where: {
        id: req.params.id,
        companyId,
      },
    });

    if (!holiday) {
      return res.status(404).json({
        message: "Holiday not found",
      });
    }

    await holiday.destroy();

    res.json({
      message: "Holiday deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

export default router;