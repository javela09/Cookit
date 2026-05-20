import { Buffer } from "node:buffer";
import { sql } from "./_lib/db.mjs";
import { getCurrentUser } from "./_lib/auth.mjs";

const MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function readProfileImage(req) {
  const formData = await req.formData();
  const file = formData.get("imageFile") || formData.get("profileImageFile");

  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
    return null;
  }

  if (!file.type || !file.type.startsWith("image/")) {
    return { error: "La imagen debe ser de tipo image/*", status: 400 };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { error: "La imagen supera el limite de 3MB", status: 400 };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  return {
    imageUrl: `data:${file.type};base64,${bytes.toString("base64")}`
  };
}

// Actualiza la imagen de perfil usando el mismo patron de data URL que recetas.
export default async (req) => {
  if (req.method !== "PUT") {
    return json({ error: "Metodo no permitido" }, 405);
  }

  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return json({ error: "No autenticado" }, 401);
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json({ error: "La imagen debe enviarse como multipart/form-data" }, 400);
    }

    const parsed = await readProfileImage(req);
    if (!parsed) {
      return json({ error: "Selecciona una imagen" }, 400);
    }

    if (parsed.error) {
      return json({ error: parsed.error }, parsed.status);
    }

    const rows = await sql`
      update app_users
      set profile_image_url = ${parsed.imageUrl}
      where id = ${user.id}
      returning id, username, email, profile_image_url as "profileImage"
    `;

    return json(rows[0], 200);
  } catch (error) {
    console.error("USER PROFILE IMAGE ERROR:", error);
    return json({ error: "No se pudo actualizar la imagen de perfil" }, 500);
  }
};

export const config = {
  path: "/api/user/profile-image"
};
