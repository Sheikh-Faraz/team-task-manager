
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pool from "./db.js";

const PgSession = connectPgSimple(session);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is missing from environment variables");
}

const isProduction = process.env.NODE_ENV === "production";

const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: "session",
    createTableIfMissing: true,
  }),

  name: "team_task_manager.sid",
  secret: process.env.SESSION_SECRET,

  resave: false,
  saveUninitialized: false,

  // cookie: {
  //   httpOnly: true,
  //   secure: isProduction,
  //   sameSite: "lax",
  //   maxAge: 1000 * 60 * 60 * 24,
  // },

  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 24,
  },

});

export default sessionMiddleware;
