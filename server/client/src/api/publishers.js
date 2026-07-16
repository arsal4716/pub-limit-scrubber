import client from "./client";

// Resolves a single, exact publisher name - never returns a list, so a
// publisher can't use this to discover other publishers.
export async function validatePublisher(name) {
  const { data } = await client.get("/publishers/validate", { params: { name } });
  return data;
}
