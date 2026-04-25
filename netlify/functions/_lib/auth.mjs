import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { sql } from "./db.mjs";

// Genera el hash seguro de una contraseña.
export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// Comprueba una contraseña contra su hash almacenado.
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Crea un token aleatorio para sesiones persistentes.
export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Convierte la cabecera Cookie en un objeto consultable.
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

// Recupera el usuario asociado a la cookie de sesión vigente.
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
