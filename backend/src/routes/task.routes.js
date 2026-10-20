
import { Router } from "express";
import Joi from "joi";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);

const uuidSchema = Joi.string().guid();

const statuses = ["todo", "in_progress", "completed"];
const priorities = ["low", "medium", "high"];

const createTaskSchema = Joi.object({
  teamId: uuidSchema.required(),
  title: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().trim().max(5000).allow("").default(""),
  status: Joi.string().valid(...statuses).default("todo"),
  priority: Joi.string().valid(...priorities).default("medium"),
  assignedTo: uuidSchema.allow(null).optional(),
  dueDate: Joi.date().iso().allow(null).optional(),
}).unknown(false);

const updateTaskSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200),
  description: Joi.string().trim().max(5000).allow(""),
  status: Joi.string().valid(...statuses),
  priority: Joi.string().valid(...priorities),
  assignedTo: uuidSchema.allow(null),
  dueDate: Joi.date().iso().allow(null),
})
  .min(1)
  .unknown(false);

async function getMembership(teamId, userId) {
  const result = await pool.query(
    `SELECT role
     FROM team_members
     WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );

  return result.rows[0] ?? null;
}

async function getTask(taskId) {
  const result = await pool.query(
    `SELECT *
     FROM tasks
     WHERE id = $1`,
    [taskId]
  );

  return result.rows[0] ?? null;
}

async function isTeamMember(teamId, userId) {
  const membership = await getMembership(teamId, userId);
  return Boolean(membership);
}

async function isValidAssignee(teamId, userId) {
  if (userId === null) return true;

  return isTeamMember(teamId, userId);
}

// GET /api/tasks
// Optional filters: teamId, assigneeId, status, search
router.get("/", async (req, res, next) => {
  try {
    const { teamId, assigneeId, status, search } = req.query;

    if (teamId && !uuidSchema.validate(teamId).error) {
      // Valid UUID.
    } else if (teamId) {
      return res.status(400).json({
        success: false,
        message: "Invalid team ID",
      });
    }

    if (
      assigneeId &&
      assigneeId !== "unassigned" &&
      uuidSchema.validate(assigneeId).error
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignee ID",
      });
    }

    if (status && !statuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task status",
      });
    }

    const values = [req.user.id];

    let query = `
      SELECT
        t.*,
        assigned_user.name AS assignee_name,
        assigned_user.email AS assignee_email,
        creator.name AS creator_name,
        teams.name AS team_name
      FROM tasks t
      INNER JOIN team_members tm
        ON tm.team_id = t.team_id
        AND tm.user_id = $1
      INNER JOIN teams
        ON teams.id = t.team_id
      INNER JOIN users creator
        ON creator.id = t.created_by
      LEFT JOIN users assigned_user
        ON assigned_user.id = t.assigned_to
      WHERE 1 = 1
    `;

    if (teamId) {
      values.push(teamId);
      query += ` AND t.team_id = $${values.length}`;
    }

    if (assigneeId === "unassigned") {
      query += " AND t.assigned_to IS NULL";
    } else if (assigneeId) {
      values.push(assigneeId);
      query += ` AND t.assigned_to = $${values.length}`;
    }

    if (status) {
      values.push(status);
      query += ` AND t.status = $${values.length}`;
    }

    if (search && search.trim()) {
      values.push(`%${search.trim()}%`);
      query += ` AND (
        t.title ILIKE $${values.length}
        OR t.description ILIKE $${values.length}
      )`;
    }

    query += " ORDER BY t.created_at DESC";

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      tasks: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/:taskId
router.get("/:taskId", async (req, res, next) => {
  try {
    const { taskId } = req.params;

    if (uuidSchema.validate(taskId).error) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    const task = await getTask(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    if (!(await isTeamMember(task.team_id, req.user.id))) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this task",
      });
    }

    return res.status(200).json({
      success: true,
      task,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/tasks
router.post("/", async (req, res, next) => {
  try {
    const { error, value } = createTaskSchema.validate(req.body, {
      abortEarly: false,
      convert: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details.map((detail) => detail.message).join(", "),
      });
    }

    const {
      teamId,
      title,
      description,
      status,
      priority,
      assignedTo = null,
      dueDate = null,
    } = value;

    if (!(await isTeamMember(teamId, req.user.id))) {
      return res.status(403).json({
        success: false,
        message: "You must be a member of this team to create tasks",
      });
    }

    if (!(await isValidAssignee(teamId, assignedTo))) {
      return res.status(400).json({
        success: false,
        message: "The assignee must belong to this team",
      });
    }

    const result = await pool.query(
      `INSERT INTO tasks (
        team_id,
        title,
        description,
        status,
        priority,
        assigned_to,
        due_date,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        teamId,
        title,
        description,
        status,
        priority,
        assignedTo,
        dueDate,
        req.user.id,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Task created successfully",
      task: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/tasks/:taskId
router.patch("/:taskId", async (req, res, next) => {
  try {
    const { taskId } = req.params;

    if (uuidSchema.validate(taskId).error) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    const { error, value } = updateTaskSchema.validate(req.body, {
      abortEarly: false,
      convert: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details.map((detail) => detail.message).join(", "),
      });
    }

    const task = await getTask(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    if (!(await isTeamMember(task.team_id, req.user.id))) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this task",
      });
    }

    if (
      Object.hasOwn(value, "assignedTo") &&
      !(await isValidAssignee(task.team_id, value.assignedTo))
    ) {
      return res.status(400).json({
        success: false,
        message: "The assignee must belong to this team",
      });
    }

    const columnMap = {
      title: "title",
      description: "description",
      status: "status",
      priority: "priority",
      assignedTo: "assigned_to",
      dueDate: "due_date",
    };

    const values = [];
    const updates = [];

    for (const [key, column] of Object.entries(columnMap)) {
      if (Object.hasOwn(value, key)) {
        values.push(value[key]);
        updates.push(`${column} = $${values.length}`);
      }
    }

    values.push(taskId);

    const result = await pool.query(
      `UPDATE tasks
       SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    return res.status(200).json({
      success: true,
      message: "Task updated successfully",
      task: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/tasks/:taskId
// Only the task creator or team creator can delete a task.
router.delete("/:taskId", async (req, res, next) => {
  try {
    const { taskId } = req.params;

    if (uuidSchema.validate(taskId).error) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
      });
    }

    const task = await getTask(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const membership = await getMembership(task.team_id, req.user.id);

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this task",
      });
    }

    const canDelete =
      task.created_by === req.user.id || membership.role === "creator";

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: "Only the task creator or team creator can delete it",
      });
    }

    await pool.query("DELETE FROM tasks WHERE id = $1", [taskId]);

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
