import client from "./client";

export async function fetchUploadRequirements() {
  const { data } = await client.get("/scrub/upload-requirements");
  return data;
}

export async function uploadScrubFile(publisherName, file) {
  const form = new FormData();
  form.append("publisherName", publisherName);
  form.append("file", file);
  const { data } = await client.post("/scrub/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function fetchJobStatus(jobId) {
  const { data } = await client.get(`/scrub/status/${jobId}`);
  return data;
}

export function downloadUrl(jobId) {
  return `/api/scrub/download/${jobId}`;
}

export async function fetchJobsForPublisher(publisherName) {
  const { data } = await client.get("/scrub/jobs", { params: { publisherName } });
  return data.jobs;
}
