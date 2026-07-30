import express from "express";
import { Op } from "sequelize";
import { User, Company } from "../models/index.js";
import { authorizePermission } from "../middleware/auth.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| GET /api/users
|--------------------------------------------------------------------------
|
| A lightweight user list used by assignee dropdowns across the CRM
| (lead owner, task assignee, ticket handler, meeting attendee).
|
| What changed and why:
|
|  1. It had NO authorization at all — not even a role check — so any
|     authenticated user could enumerate the directory.
|
|  2. It logged every user's name and email to stdout on every single
|     call. Those console.log lines are gone.
|
|  3. The company filter was `where: { id: req.companyId }` on the
|     joined Company. For a super admin working across all companies
|     req.companyId is null, so the join matched nothing and the
|     endpoint returned an empty list. Now handled explicitly.
*/
router.get("/", authorizePermission("users.view"), async (req, res, next) => {
  try {
    const { search, includeInactive } = req.query;

    const where = {};
    if (!includeInactive || includeInactive === "false") {
      where.isActive = true;
    }
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    const include = [];

    if (req.companyId) {
      // Normal case: restrict to members of the active company.
      include.push({
        model: Company,
        as: "companies",
        where: { id: req.companyId },
        through: { attributes: [] },
        attributes: [],
        required: true,
      });
    }
    // Super admin with no company selected sees everyone — that is the
    // documented cross-company view, not an accident.

    include.push({
      association: "roleInfo",
      attributes: ["id", "name"],
      required: false,
    });

    const users = await User.findAll({
      where,
      include,
      attributes: ["id", "name", "email", "role", "roleId", "avatar", "isActive"],
      order: [["name", "ASC"]],
      limit: 500,
    });

    res.json({
      success: true,
      data: users,
    });
  } catch (err) {
    next(err);
  }
});

/*
|--------------------------------------------------------------------------
| GET /api/users/assignable
|--------------------------------------------------------------------------
| Same shape, but trimmed to what a picker needs. Kept separate so the
| main list can grow without slowing every dropdown in the app.
*/
router.get("/assignable", async (req, res, next) => {
  try {
    const include = [];
    if (req.companyId) {
      include.push({
        model: Company,
        as: "companies",
        where: { id: req.companyId },
        through: { attributes: [] },
        attributes: [],
        required: true,
      });
    }

    const users = await User.findAll({
      where: { isActive: true },
      include,
      attributes: ["id", "name", "email", "avatar"],
      order: [["name", "ASC"]],
      limit: 500,
    });

    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

export default router;