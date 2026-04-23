async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(options.headers || {})
  };

  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    credentials: "include",
    headers,
    ...options
  });

  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");

  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(data?.error || "Error de API");
    error.details = data?.details || null;
    error.status = response.status;
    throw error;
  }

  return data;
}

window.api = api;
