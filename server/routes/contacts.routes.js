import express from 'express'
import { Op } from 'sequelize'
import { Contact, Account, User } from '../models/index.js'
import { protect } from '../middleware/auth.js'
import { createNotification } from "../services/notification.service.js";
import { findInScope } from '../utils/scope.js'

const router = express.Router()


router.get('/', protect, async (req, res, next) => {
  try {
    const company = req.companyId;
    const { page = 1, limit = 20, search, sortKey = 'createdAt', sortDir = 'desc' } = req.query
    const where = {}
    if (company) where.companyId = company
    if (search) where[Op.or] = [
      { firstName: { [Op.like]: `%${search}%` } },
      { lastName:  { [Op.like]: `%${search}%` } },
      { email:     { [Op.like]: `%${search}%` } },
    ]
    const offset = (parseInt(page) - 1) * parseInt(limit)
    const { rows: contacts, count: total } = await Contact.findAndCountAll({
      where,
      order: [[sortKey || 'createdAt', sortDir === 'asc' ? 'ASC' : 'DESC']],
      offset,
      limit: parseInt(limit),
      include: [
        { model: Account, as: 'account', attributes: ['id', 'name'] },
        { model: User, as: 'assignedTo', attributes: ['id', 'name'] },
      ],
    })
    res.json({ contacts, total })
  } catch (err) { next(err) }
})

router.get('/:id', protect, async (req, res, next) => {
  try {
   const contact = await findInScope(req, Contact, req.params.id, {
  include: [
    {
      model: Account,
      as: "account",
      attributes: ["id", "name"],
    },
    {
      model: User,
      as: "assignedTo",
      attributes: ["id", "name"],
    },
  ],
});
    if (!contact) return res.status(404).json({ message: 'Contact not found' })
    res.json(contact)
  } catch (err) { next(err) }
})

router.post("/", protect, async (req, res, next) => {
  try {
    const contact = await Contact.create({
      ...req.body,
    companyId: req.companyId ,
    });

    await createNotification({
      companyId: contact.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "crm",
      type: "contact_created",

      title: "New Contact Created",

      message: `${contact.firstName} ${contact.lastName} has been created successfully.`,

      priority: "medium",

      actionUrl: `/crm/contacts/${contact.id}`,

      metadata: {
        contactId: contact.id,
      },
    });

    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", protect, async (req, res, next) => {
  try {
    const contact = await findInScope(req, Contact, req.params.id);

    if (!contact) {
      return res.status(404).json({
        message: "Contact not found",
      });
    }

    const previousAssignee = contact.assignedToId;

    await contact.update(req.body);

    // Contact Assigned
    if (
      req.body.assignedToId &&
      req.body.assignedToId !== previousAssignee
    ) {
      await createNotification({
        companyId: contact.companyId,
        userId: req.body.assignedToId,
        senderId: req.user.id,

        module: "crm",
        type: "contact_assigned",

        title: "Contact Assigned",

        message: `${contact.firstName} ${contact.lastName} has been assigned to you.`,

        priority: "high",

        actionUrl: `/crm/contacts/${contact.id}`,

        metadata: {
          contactId: contact.id,
        },
      });
    }

    // Contact Updated
    await createNotification({
      companyId: contact.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "crm",
      type: "contact_updated",

      title: "Contact Updated",

      message: `${contact.firstName} ${contact.lastName} has been updated successfully.`,

      priority: "medium",

      actionUrl: `/crm/contacts/${contact.id}`,

      metadata: {
        contactId: contact.id,
      },
    });

    res.json(contact);
  } catch (err) {
    next(err);
  }
});

// Delete Contact
router.delete("/:id", protect, async (req, res, next) => {
  try {
    const contact = await findInScope(req, Contact, req.params.id);

    if (!contact) {
      return res.status(404).json({
        message: "Contact not found",
      });
    }

    await createNotification({
      companyId: contact.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "crm",
      type: "contact_deleted",

      title: "Contact Deleted",

      message: `${contact.firstName} ${contact.lastName} has been deleted successfully.`,

      priority: "medium",

      actionUrl: "/crm/contacts",

      metadata: {
        contactId: contact.id,
      },
    });

    await contact.destroy();

    res.json({
      success: true,
      message: "Contact deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

// Contact Timeline
router.get("/:id/timeline", protect, (req, res) => {
  res.json({
    items: [],
  });
});

export default router;