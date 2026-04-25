import { getCurrentUser } from "./_lib/auth.mjs";

// Devuelve el usuario autenticado asociado a la cookie actual.
export default async (req) => {
  const user = await getCurrentUser(req);

  if (!user) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });
  }

  return new Response(JSON.stringify(user), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

export const config = {
  path: "/api/auth/me"
};
