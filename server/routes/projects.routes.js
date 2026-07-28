import express from 'express'
import { sequelize } from '../config/db.js'
import { Project, ProjectMember, Task, User } from '../models/index.js'
import { protect } from '../middleware/auth.js'
import { findInScope } from '../utils/scope.js'

const router = express.Router()
const getCompany = (req) => req.headers['x-company-id'] || req.headers['x-company-id'] || req.get('X-Company-ID') || null
router.get('/', protect, async (req, res, next) => {
  try {
    const company = getCompany(req)
    const { status } = req.query
    const where = { companyId: company }
    if (status) where.status = status
    const projects = await Project.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'manager', attributes: ['name'] },
        { model: ProjectMember, as: 'members', include: [{ model: User, as: 'user', attributes: ['name'] }] },
      ],
    })
    res.json({
      projects,
      total: projects.length
    })
  } catch (err) { next(err) }
})

router.get('/:id', protect, async (req, res, next) => {
  try {
    const project = await findInScope(req, Project, req.params.id, {
      include: [
        { model: User, as: 'manager', attributes: ['name'] },
        { model: ProjectMember, as: 'members', include: [{ model: User, as: 'user', attributes: ['name'] }] },
        { model: Task, as: 'tasks' },
      ],
    })
    if (!project) return res.status(404).json({ message: 'Project not found' })
    res.json(project)
  } catch (err) { next(err) }
})

router.post('/', protect, async (req, res, next) => {
  const t = await sequelize.transaction()
  try {
    const company = getCompany(req)
    const { members = [], ...projectData } = req.body
    const project = await Project.create({ ...projectData, companyId: company }, { transaction: t })
    if (members.length) {
      await ProjectMember.bulkCreate(
        members.map(m => ({ projectId: project.id, userId: m.user || m.userId, role: m.role })),
        { transaction: t }
      )
    }
    await t.commit()
    res.status(201).json(project)
  } catch (err) {
    await t.rollback()
    next(err)
  }
})

router.patch('/:id', protect, async (req, res, next) => {
  try {
    const project = await findInScope(req, Project, req.params.id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    await project.update(req.body)
    res.json(project)
  } catch (err) { next(err) }
})

router.delete('/:id', protect, async (req, res, next) => {
  try {
    // Was an unscoped destroy: it deleted the row whichever company
    // owned it, and returned success either way.
    const project = await findInScope(req, Project, req.params.id)
    if (!project) return res.status(404).json({ message: 'Project not found' })
    await project.destroy()
    res.json({ message: 'Project deleted' })
  } catch (err) { next(err) }
})

// ── Tasks ─────────────────────────────────────────────────
router.get('/:id/tasks', protect, async (req, res, next) => {
  try {
    const tasks = await Task.findAll({
      where: { projectId: req.params.id },
      include: [{ model: User, as: 'assignedTo', attributes: ['name'] }],
      order: [['createdAt', 'DESC']],
    })
    res.json(tasks)
  } catch (err) { next(err) }
})

router.post('/:id/tasks', protect, async (req, res, next) => {
  try {
    const task = await Task.create({ ...req.body, projectId: req.params.id, companyId: getCompany(req) })
    res.status(201).json(task)
  } catch (err) { next(err) }
})

router.patch('/tasks/:taskId', protect, async (req, res, next) => {
  try {
    const task = await findInScope(req, Task, req.params.taskId)
    if (!task) return res.status(404).json({ message: 'Task not found' })
    const updates = { ...req.body }
    if (updates.completed === true && !task.completed) updates.completedAt = new Date()
    await task.update(updates)
    res.json(task)
  } catch (err) { next(err) }
})

router.delete('/tasks/:taskId', protect, async (req, res, next) => {
  try {
    const task = await findInScope(req, Task, req.params.taskId)
    if (!task) return res.status(404).json({ message: 'Task not found' })
    await task.destroy()
    res.json({ message: 'Task deleted' })
  } catch (err) { next(err) }
})

// ── Project Members ─────────────────────────────────────────

// Get all members of a project
router.get('/:id/members', protect, async (req, res, next) => {
  try {
    const members = await ProjectMember.findAll({
      where: { projectId: req.params.id },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ]
    })

    res.json(members)
  } catch (err) {
    next(err)
  }
})

// Add member to project
router.post('/:id/members', protect, async (req, res, next) => {
  try {
    const { userId, role } = req.body

    const member = await ProjectMember.create({
      projectId: req.params.id,
      userId,
      role
    })

    res.status(201).json(member)
  } catch (err) {
    next(err)
  }
})

// Remove member from project
router.delete('/:id/members/:memberId', protect, async (req, res, next) => {
  try {
    const member = await ProjectMember.findOne({
      where: {
        projectId: req.params.id,
        id: req.params.memberId
      }
    })

    if (!member) {
      return res.status(404).json({
        message: 'Project member not found'
      })
    }

    await member.destroy()

    res.json({
      message: 'Project member removed successfully'
    })
  } catch (err) {
    next(err)
  }
})

export default router
