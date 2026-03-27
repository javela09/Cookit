import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { sql } from "./db.mjs";

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function parseCookies(req) {
  const raw = req.headers.get("cookie") || "";

  return Object.fromEntries(
    raw
      .split(";")
      .map(v => v.trim())
      .filter(Boolean)
      .map(v => {
        const i = v.indexOf("=");
        return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
      })
  );
}

export async function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.session_token;

  if (!token) return null;

  const rows = await sql`
    select u.id, u.username, u.email
    from user_sessions s
    join app_users u on u.id = s.user_id
    where s.session_token = ${token}
      and s.expires_at > now()
    limit 1
  `;

  return rows[0] || null;
}