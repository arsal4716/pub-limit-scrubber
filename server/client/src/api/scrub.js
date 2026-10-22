import publisherClient from "./publisherClient";
import adminClient from "./client";

export async function fetchUploadRequirements() {
  const { data } = await publisherClient.get("/scrub/upload-requirements");
  return data;
}

export async function uploadScrubFile(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await publisherClient.post("/scrub/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// `admin` selects the admin session's token instead of a publisher's, so
// the admin dashboard can view any job's live status without logging in
// as that publisher (the server accepts either token on these routes).
export async function fetchJobStatus(jobId, admin = false) {
  const { data } = await (admin ? adminClient : publisherClient).get(`/scrub/status/${jobId}`);
  return data;
}

export async function downloadScrubOutput(jobId, admin = false) {
  const response = await (admin ? adminClient : publisherClient).get(`/scrub/download/${jobId}`, { responseType: "blob" });
  return response.data;
}

export async function fetchMyJobs() {
  const { data } = await publisherClient.get("/scrub/jobs");
  return data.jobs;
}
