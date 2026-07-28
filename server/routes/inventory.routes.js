import express from "express";
import { Op, col } from "sequelize";
import {
  InventoryItem,
  Warehouse,
  Asset,
  Employee,
  StockTransfer,
  StockAdjustment,
  User,
} from "../models/index.js";
import { protect } from "../middleware/auth.js";
import { createNotification } from "../services/notification.service.js";
import { findInScope } from '../utils/scope.js'
const router = express.Router();
const getCompany = (req) => req.companyId;

router.get("/items", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);
    const { page = 1, limit = 20, search, category, lowStock } = req.query;
    const where = { companyId: company };
    if (category) where.category = category;
    if (search) where.name = { [Op.like]: `%${search}%` };
    if (lowStock === "true") where.quantity = { [Op.lte]: col("reorderPoint") };

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows: items, count: total } = await InventoryItem.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset,
      limit: parseInt(limit),
      include: [
        { model: Warehouse, as: "warehouse", attributes: ["id", "name"] },
      ],
    });
    res.json({ items, total });
  } catch (err) {
    next(err);
  }
});

router.post("/items", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);

    const lastItem = await InventoryItem.findOne({
      where: { companyId: company },
      order: [["createdAt", "DESC"]],
    });

    let code = "INV-0001";

    if (lastItem?.code) {
      const number = parseInt(lastItem.code.replace("INV-", ""), 10);

      code = `INV-${String(number + 1).padStart(4, "0")}`;
    }

    const item = await InventoryItem.create({
      ...req.body,
      companyId: company,
      code,
    });

    await createNotification({
      companyId: item.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "inventory",
      type: "inventory_item_created",

      title: "Inventory Item Added",

      message: `${item.name} (${item.code}) has been added.`,

      priority: "medium",

      actionUrl: `/inventory/items/${item.id}`,

      metadata: {
        itemId: item.id,
      },
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

router.patch("/items/:id", protect, async (req, res, next) => {
  try {
    const item = await findInScope(req, InventoryItem, req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Item not found",
      });
    }

    await item.update(req.body);

    await createNotification({
      companyId: item.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "inventory",

      type: "inventory_item_updated",

      title: "Inventory Item Updated",

      message: `${item.name} (${item.code}) has been updated.`,

      priority: "low",

      actionUrl: `/inventory/items/${item.id}`,

      metadata: {
        itemId: item.id,
      },
    });

    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.delete("/items/:id", protect, async (req, res, next) => {
  try {
    const item = await findInScope(req, InventoryItem, req.params.id);

    if (!item) {
      return res.status(404).json({
        message: "Item not found",
      });
    }

    await createNotification({
      companyId: item.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "inventory",

      type: "inventory_item_deleted",

      title: "Inventory Item Deleted",

      message: `${item.name} has been removed from inventory.`,

      priority: "low",

      metadata: {
        itemId: item.id,
      },
    });

    await item.destroy();

    res.json({
      message: "Item deleted",
    });
  } catch (err) {
    next(err);
  }
});

// ── Warehouses ────────────────────────────────────────────
router.get("/warehouses", protect, async (req, res, next) => {
  try {
    const warehouses = await Warehouse.findAll({
      where: { companyId: getCompany(req) },
    });
    res.json(warehouses);
  } catch (err) {
    next(err);
  }
});

router.get("/warehouses/:id", protect, async (req, res, next) => {
  try {
    const warehouse = await findInScope(req, Warehouse, req.params.id);

    if (!warehouse) {
      return res.status(404).json({
        message: "Warehouse not found",
      });
    }

    res.json(warehouse);
  } catch (err) {
    next(err);
  }
});

router.post("/warehouses", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);

    const lastWarehouse = await Warehouse.findOne({
      where: { companyId: company },
      order: [["createdAt", "DESC"]],
    });

    let code = "WHR-0001";

    if (lastWarehouse?.code) {
      const number = parseInt(lastWarehouse.code.replace("WHR-", ""), 10);

      code = `WHR-${String(number + 1).padStart(4, "0")}`;
    }

    const warehouse = await Warehouse.create({
      ...req.body,
      companyId: company,
      code,
    });

    await createNotification({
      companyId: warehouse.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "inventory",
      type: "warehouse_created",

      title: "Warehouse Created",

      message: `${warehouse.name} (${warehouse.code}) has been created successfully.`,

      priority: "medium",

      actionUrl: "/inventory/warehouses",
      metadata: {
        warehouseId: warehouse.id,
      },
    });

    res.status(201).json(warehouse);
  } catch (err) {
    next(err);
  }
});

router.patch("/warehouses/:id", protect, async (req, res, next) => {
  try {
    const warehouse = await findInScope(req, Warehouse, req.params.id);

    if (!warehouse) {
      return res.status(404).json({
        message: "Warehouse not found",
      });
    }

    await warehouse.update(req.body);

    await createNotification({
      companyId: warehouse.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "inventory",
      type: "warehouse_updated",

      title: "Warehouse Updated",

      message: `${warehouse.name} (${warehouse.code}) has been updated.`,

      priority: "low",

      actionUrl: "/inventory/warehouses",

      metadata: {
        warehouseId: warehouse.id,
      },
    });

    res.json(warehouse);
  } catch (err) {
    next(err);
  }
});

router.delete("/warehouses/:id", protect, async (req, res, next) => {
  try {
    const warehouse = await findInScope(req, Warehouse, req.params.id);

    if (!warehouse) {
      return res.status(404).json({
        message: "Warehouse not found",
      });
    }
    await createNotification({
      companyId: warehouse.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "inventory",

      type: "warehouse_deleted",

      title: "Warehouse Deleted",

      message: `${warehouse.name} warehouse has been deleted.`,

      priority: "low",

      metadata: {
        warehouseId: warehouse.id,
      },
    });

    await warehouse.destroy();

    res.json({
      message: "Warehouse deleted",
    });
  } catch (err) {
    next(err);
  }
});

// ── Assets ────────────────────────────────────────────────
router.get("/assets", protect, async (req, res) => {
  try {
    const company = getCompany(req);

    const assets = await Asset.findAll({
      where: {
        companyId: company,
      },

      include: [
        {
          model: Warehouse,
          as: "warehouse",
          attributes: ["id", "name"],
          required: false,
        },
        {
          model: Employee,
          as: "assignedTo",
          attributes: ["id", "firstName", "lastName"],
          required: false,
        },
      ],

      order: [["createdAt", "DESC"]],
    });

    res.json(assets);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: err.message,
    });
  }
});
router.get("/assets/:id", protect, async (req, res, next) => {
  try {
    const asset = await findInScope(req, Asset, req.params.id);

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found",
      });
    }

    res.json(asset);
  } catch (err) {
    next(err);
  }
});

router.post("/assets", protect, async (req, res, next) => {
  try {
    const asset = await Asset.create({
      ...req.body,
      companyId: getCompany(req),
    });
    res.status(201).json(asset);
  } catch (err) {
    next(err);
  }
});

router.patch("/assets/:id", protect, async (req, res, next) => {
  try {
    const asset = await findInScope(req, Asset, req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    await asset.update(req.body);
    res.json(asset);
  } catch (err) {
    next(err);
  }
});

router.delete("/assets/:id", protect, async (req, res, next) => {
  try {
    const asset = await findInScope(req, Asset, req.params.id);

    if (!asset) {
      return res.status(404).json({
        message: "Asset not found",
      });
    }

    await asset.destroy();

    res.json({
      message: "Asset deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

// ── Stock Transfers ───────────────────────────────────────
router.get("/transfers", protect, async (req, res) => {
  try {
    const transfers = await StockTransfer.findAll({
      where: {
        companyId: getCompany(req),
      },

      include: [
        {
          model: InventoryItem,
          as: "item",
          attributes: ["id", "name", "sku"],
        },
        {
          model: Warehouse,
          as: "fromWarehouse",
          attributes: ["id", "name"],
        },
        {
          model: Warehouse,
          as: "toWarehouse",
          attributes: ["id", "name"],
        },
        {
          model: User,
          as: "createdBy",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],

      order: [["createdAt", "DESC"]],
    });

    res.json(transfers);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: err.message,
    });
  }
});

router.get("/transfers/:id", protect, async (req, res) => {
  try {
    const transfer = await findInScope(req, StockTransfer, req.params.id);

    if (!transfer) {
      return res.status(404).json({
        message: "Transfer not found",
      });
    }

    res.json(transfer);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

router.post("/transfers", protect, async (req, res) => {
  try {
    const {
      itemId,
      fromWarehouseId,
      toWarehouseId,
      quantity,
      transferDate,
      remarks,
    } = req.body;

    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({
        message: "Source and destination warehouse cannot be the same.",
      });
    }

    const item = await InventoryItem.findByPk(itemId);

    if (!item) {
      return res.status(404).json({
        message: "Inventory item not found",
      });
    }

    if (item.quantity < quantity) {
      return res.status(400).json({
        message: "Insufficient stock.",
      });
    }

    // Deduct stock
    item.quantity -= Number(quantity);
    await item.save();

    // Generate Transfer Reference Number
    const lastTransfer = await StockTransfer.findOne({
      where: {
        companyId: getCompany(req),
      },
      order: [["createdAt", "DESC"]],
    });

    let referenceNo = "TRF-0001";

    if (lastTransfer?.referenceNo) {
      const match = lastTransfer.referenceNo.match(/\d+$/);

      const number = match ? parseInt(match[0], 10) : 0;

      referenceNo = `TRF-${String(number + 1).padStart(4, "0")}`;
    }

    const transfer = await StockTransfer.create({
      companyId: getCompany(req),
      itemId,
      fromWarehouseId,
      toWarehouseId,
      quantity,
      transferDate,
      referenceNo,
      remarks,
      createdById: req.user.id,
      status: "Completed",
    });

    await createNotification({
      companyId: getCompany(req),
      userId: req.user.id,
      senderId: req.user.id,
      module: "inventory",
      type: "stockits_transfer_created",
      title: "Stock Transfer Created",
      message: `Stock transfer ${referenceNo} has been completed successfully.`,
      priority: "medium",
      actionUrl: `/inventory/transfers/${transfer.id}`,
      metadata: {
        transferId: transfer.id,
      },
    });

    res.status(201).json(transfer);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: err.message,
    });
  }
});

router.delete("/transfers/:id", protect, async (req, res) => {
  try {
    const transfer = await findInScope(req, StockTransfer, req.params.id);

    if (!transfer) {
      return res.status(404).json({
        message: "Transfer not found",
      });
    }

    await transfer.destroy();

    res.json({
      message: "Transfer deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});


// ── Stock Adjustments ─────────────────────────────────────────

router.get("/adjustments", protect, async (req, res) => {
  try {
    const adjustments = await StockAdjustment.findAll({
      where: {
        companyId: getCompany(req),
      },

      include: [
        {
          model: InventoryItem,
          as: "item",
          attributes: ["id", "name", "code"],
        },
        {
          model: Warehouse,
          as: "warehouse",
          attributes: ["id", "name", "code"],
        },
        {
          model: User,
          as: "createdBy",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],

      order: [["createdAt", "DESC"]],
    });

    res.json(adjustments);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: err.message,
    });
  }
});
router.get("/adjustments/:id", protect, async (req, res) => {
  try {
    const adjustment = await findInScope(req, StockAdjustment, req.params.id);

    if (!adjustment) {
      return res.status(404).json({
        message: "Adjustment not found",
      });
    }

    res.json(adjustment);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

router.post("/adjustments", protect, async (req, res) => {
  try {
    const {
      itemId,
      warehouseId,
      type,
      quantity,
      reason,
      remarks,
    } = req.body;

    const item = await InventoryItem.findByPk(itemId);

    if (!item) {
      return res.status(404).json({
        message: "Inventory item not found",
      });
    }

    // Generate Adjustment Number
    const lastAdjustment = await StockAdjustment.findOne({
      where: {
        companyId: getCompany(req),
      },
      order: [["createdAt", "DESC"]],
    });

    let adjustmentNo = "ADJ-0001";

    if (lastAdjustment?.adjustmentNo) {
      const match = lastAdjustment.adjustmentNo.match(/\d+$/);

      const number = match ? parseInt(match[0], 10) : 0;

      adjustmentNo = `ADJ-${String(number + 1).padStart(4, "0")}`;
    }

    // Increase Stock
    if (type === "Increase") {
      item.quantity += Number(quantity);
    }

    // Decrease Stock
    if (type === "Decrease") {
      if (item.quantity < quantity) {
        return res.status(400).json({
          message: "Insufficient stock.",
        });
      }

      item.quantity -= Number(quantity);
    }

    await item.save();

    const adjustment = await StockAdjustment.create({
      adjustmentNo,
      companyId: getCompany(req),
      itemId,
      warehouseId,
      type,
      quantity,
      reason,
      remarks,
      createdById: req.user.id,
    });

    await createNotification({
      companyId: getCompany(req),
      userId: req.user.id,
      senderId: req.user.id,
      module: "inventory",
      type: "stock_adjustment_created",
      title: "Stock Adjustment Created",
      message: `Stock adjustment ${adjustmentNo} has been created successfully.`,
      priority: "medium",
      actionUrl: `/inventory/adjustments/${adjustment.id}`,
      metadata: {
        adjustmentId: adjustment.id,
      },
    });

    res.status(201).json(adjustment);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: err.message,
    });
  }
});

router.delete("/adjustments/:id", protect, async (req, res) => {
  try {
    const adjustment = await findInScope(req, StockAdjustment, req.params.id);

    if (!adjustment) {
      return res.status(404).json({
        message: "Adjustment not found",
      });
    }

    await adjustment.destroy();

    res.json({
      message: "Adjustment deleted successfully",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: err.message,
    });
  }
});

export default router;
