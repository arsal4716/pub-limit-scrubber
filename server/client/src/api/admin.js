import client from "./client";

export async function fetchGlobalConfig() {
  const { data } = await client.get("/admin/config");
  return data;
}

export async function updateGlobalConfig(totalDailyLimit) {
  const { data } = await client.put("/admin/config", { totalDailyLimit });
  return data;
}

export async function updateRateLimitSettings({ enabled, ratePerMinute } = {}) {
  const body = {};
  if (enabled !== undefined) body.enabled = enabled;
  if (ratePerMinute !== undefined) body.ratePerMinute = ratePerMinute;
  const { data } = await client.put("/admin/rate-limit", body);
  return data;
}

export async function fetchAdminPublishers() {
  const { data } = await client.get("/admin/publishers");
  return data;
}

export async function createAdminPublisher({ name, dailyLimit, email, password }) {
  const { data } = await client.post("/admin/publishers", { name, dailyLimit, email, password });
  return data;
}

export async function updateAdminPublisher(id, updates) {
  const { data } = await client.put(`/admin/publishers/${id}`, updates);
  return data;
}

export async function createPublisherApiKey(id) {
  const { data } = await client.post(`/admin/publishers/${id}/api-key`);
  return data;
}

export async function revokePublisherApiKey(id) {
  const { data } = await client.delete(`/admin/publishers/${id}/api-key`);
  return data;
}

export async function fetchAdminJobs(params) {
  const { data } = await client.get("/admin/jobs", { params });
  return data;
}

export async function deleteAdminJob(id) {
  const { data } = await client.delete(`/admin/jobs/${id}`);
  return data;
}

export async function fetchFrequentRuns() {
  const { data } = await client.get("/admin/frequent/runs");
  return data;
}

export async function uploadFrequentFile(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post("/admin/frequent/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function downloadFrequentFile(id, kind) {
  const response = await client.get(`/admin/frequent/runs/${id}/download/${kind}`, {
    responseType: "blob",
  });
  return response.data;
}

export async function deleteFrequentRun(id) {
  const { data } = await client.delete(`/admin/frequent/runs/${id}`);
  return data;
}
