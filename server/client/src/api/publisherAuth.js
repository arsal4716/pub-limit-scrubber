import publisherClient from "./publisherClient";

export async function signupPublisher({ publisherName, email, password }) {
  const { data } = await publisherClient.post("/publisher-auth/signup", { publisherName, email, password });
  return data;
}

export async function loginPublisher({ publisherName, password }) {
  const { data } = await publisherClient.post("/publisher-auth/login", { publisherName, password });
  return data;
}

export async function fetchMyPublisherProfile() {
  const { data } = await publisherClient.get("/publisher-auth/me");
  return data;
}
