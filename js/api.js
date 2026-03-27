async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");

  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(data?.error || "Error de API");
  }

  return data;
}

window.api = api;