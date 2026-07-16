import client from "./client";

export async function fetchPublicPublishers() {
  const { data } = await client.get("/publishers");
  return data.publishers;
}
