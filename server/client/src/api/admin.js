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

export async function createAdminPublisher(name, dailyLimit) {
  const { data } = await client.post("/admin/publishers", { name, dailyLimit });
  return data;
}

export async function updateAdminPublisher(id, updates) {
  const { data } = await client.put(`/admin/publishers/${id}`, updates);
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
