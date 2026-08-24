import publisherClient from "./publisherClient";

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

export async function fetchJobStatus(jobId) {
  const { data } = await publisherClient.get(`/scrub/status/${jobId}`);
  return data;
}

export async function downloadScrubOutput(jobId) {
  const response = await publisherClient.get(`/scrub/download/${jobId}`, { responseType: "blob" });
  return response.data;
}

export async function fetchMyJobs() {
  const { data } = await publisherClient.get("/scrub/jobs");
  return data.jobs;
}
