
import { Router } from "express";
import bcrypt from "bcrypt";
import Joi from "joi";
import passport from "../config/passport.js";
import pool from "../config/db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().email().max(255).required(),
  password: Joi.string().min(8).max(72).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().email().max(255).required(),
  password: Joi.string().min(1).max(72).required(),
});

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  const { error, value } = registerSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid registration data",
      errors: error.details.map((detail) => detail.message),
    });
  }

  const name = value.name;
  const email = value.email.toLowerCase();
  const password = value.password;

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, name, email, created_at`,
      [name, email, passwordHash]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Account created successfully. Please log in.",
      user: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/auth/login
router.post("/login", (req, res, next) => {
  const { error, value } = loginSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: "Invalid login data",
      errors: error.details.map((detail) => detail.message),
    });
  }

  req.body.email = value.email.toLowerCase();
  req.body.password = value.password;

  passport.authenticate("local", (authError, user, info) => {
    if (authError) {
      return next(authError);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || "Invalid email or password",
      });
    }

    // Regenerate the session to prevent session fixation.
    req.session.regenerate((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      req.logIn(user, (loginError) => {
        if (loginError) {
          return next(loginError);
        }

        req.session.save((saveError) => {
          if (saveError) {
            return next(saveError);
          }

          return res.status(200).json({
            success: true,
            message: "Login successful",
            user,
          });
        });
      });
    });
  })(req, res, next);
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

// POST /api/auth/logout
router.post("/logout", requireAuth, (req, res, next) => {
  req.logout((logoutError) => {
    if (logoutError) {
      return next(logoutError);
    }

    req.session.destroy((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      res.clearCookie("team_task_manager.sid", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    });
  });
});

export default router;
