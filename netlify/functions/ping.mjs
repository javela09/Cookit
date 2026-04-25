// Responde si la API está disponible.
export default async () => {
  return new Response(
    JSON.stringify({ ok: true, message: "API funcionando" }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
};

export const config = {
  path: "/api/ping"
};
