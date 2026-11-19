export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method: options.method || "GET",
    credentials: "include",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || "请求失败");
    error.status = response.status;
    error.code = data.error;
    error.data = data;
    throw error;
  }
  return data;
}

export function yuan(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}
