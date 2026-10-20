
import { Router } from "express";
import Joi from "joi";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);

const teamSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().trim().max(1000).allow("").default(""),
});

// const uuidSchema = Joi.string().guid({ version: "uuid" });
const uuidSchema = Joi.string().guid({ version: ["uuidv4"] });

async function getMembership(teamId, userId) {
  const result = await pool.query(
    `SELECT role
     FROM team_members
     WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );

  return result.rows[0] || null;
}

// GET /api/teams
// List teams belonging to the logged-in user.
router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.name, t.description, t.created_by,
              t.created_at, t.updated_at, tm.role,
              COUNT(DISTINCT task.id)::int AS task_count
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       LEFT JOIN tasks task ON task.team_id = t.id
       WHERE tm.user_id = $1
       GROUP BY t.id, tm.role
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      teams: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/teams
// Create a team and add its creator as a member.
router.post("/", async (req, res, next) => {
  const { error, value } = teamSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid team data",
      errors: error.details.map((detail) => detail.message),
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const teamResult = await client.query(
      `INSERT INTO teams (name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [value.name, value.description, req.user.id]
    );

    const team = teamResult.rows[0];

    await client.query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, 'creator')`,
      [team.id, req.user.id]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Team created successfully",
      team,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

// GET /api/teams/:teamId
// View a team and its members.
router.get("/:teamId", async (req, res, next) => {
  const { teamId } = req.params;

//   if (!uuidSchema.validate(teamId).error === false) {
if (uuidSchema.validate(teamId).error) {
    return res.status(400).json({
      success: false,
      message: "Invalid team ID",
    });
  }

  try {
    const membership = await getMembership(teamId, req.user.id);

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const teamResult = await pool.query(
      `SELECT id, name, description, created_by,
              created_at, updated_at
       FROM teams
       WHERE id = $1`,
      [teamId]
    );

    const membersResult = await pool.query(
      `SELECT u.id, u.name, u.email, tm.role, tm.joined_at
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1
       ORDER BY tm.joined_at ASC`,
      [teamId]
    );

    res.json({
      success: true,
      team: teamResult.rows[0],
      members: membersResult.rows,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/teams/:teamId
// Only the team creator can update team information.
router.patch("/:teamId", async (req, res, next) => {
  const { teamId } = req.params;

  if (uuidSchema.validate(teamId).error) {
    return res.status(400).json({
      success: false,
      message: "Invalid team ID",
    });
  }

  const { error, value } = teamSchema
    .fork(["name"], (schema) => schema.optional())
    .min(1)
    .validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid team data",
      errors: error.details.map((detail) => detail.message),
    });
  }

  try {
    const membership = await getMembership(teamId, req.user.id);

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    if (membership.role !== "creator") {
      return res.status(403).json({
        success: false,
        message: "Only the team creator can update this team",
      });
    }

    const result = await pool.query(
      `UPDATE teams
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [
        value.name ?? null,
        value.description ?? null,
        teamId,
      ]
    );

    res.json({
      success: true,
      message: "Team updated successfully",
      team: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/teams/:teamId/members
// Add an existing registered user by email.
router.post("/:teamId/members", async (req, res, next) => {
  const { teamId } = req.params;

  if (uuidSchema.validate(teamId).error) {
    return res.status(400).json({
      success: false,
      message: "Invalid team ID",
    });
  }

  const schema = Joi.object({
    email: Joi.string().trim().email().max(255).required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: "A valid email is required",
    });
  }

  try {
    const membership = await getMembership(teamId, req.user.id);

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    if (membership.role !== "creator") {
      return res.status(403).json({
        success: false,
        message: "Only the team creator can add members",
      });
    }

    const userResult = await pool.query(
      `SELECT id, name, email
       FROM users
       WHERE email = $1`,
      [value.email.toLowerCase()]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No registered user found with this email",
      });
    }

    const result = await pool.query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (team_id, user_id) DO NOTHING
       RETURNING team_id, user_id, role, joined_at`,
      [teamId, user.id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message: "This user is already a team member",
      });
    }

    res.status(201).json({
      success: true,
      message: "Member added successfully",
      member: {
        ...result.rows[0],
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/teams/:teamId
// Only the team creator can delete the team.
router.delete("/:teamId", async (req, res, next) => {
  const { teamId } = req.params;

  if (uuidSchema.validate(teamId).error) {
    return res.status(400).json({
      success: false,
      message: "Invalid team ID",
    });
  }

  try {
    const membership = await getMembership(teamId, req.user.id);

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    if (membership.role !== "creator") {
      return res.status(403).json({
        success: false,
        message: "Only the team creator can delete this team",
      });
    }

    await pool.query(
      "DELETE FROM teams WHERE id = $1",
      [teamId]
    );

    res.json({
      success: true,
      message: "Team deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
