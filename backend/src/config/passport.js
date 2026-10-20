
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import pool from "./db.js";

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    async (email, password, done) => {
      try {
        const result = await pool.query(
          `SELECT id, name, email, password_hash
           FROM users
           WHERE email = $1`,
          [email.trim().toLowerCase()]
        );

        const user = result.rows[0];

        if (!user) {
          return done(null, false, {
            message: "Invalid email or password",
          });
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          user.password_hash
        );

        if (!isPasswordValid) {
          return done(null, false, {
            message: "Invalid email or password",
          });
        }

        return done(null, {
          id: user.id,
          name: user.name,
          email: user.email,
        });
      } catch (error) {
        return done(error);
      }
    }
  )
);

// Store only the user's ID in the session.
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Retrieve the current user from PostgreSQL on later requests.
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, created_at
       FROM users
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return done(null, false);
    }

    return done(null, result.rows[0]);
  } catch (error) {
    return done(error);
  }
});

export default passport;