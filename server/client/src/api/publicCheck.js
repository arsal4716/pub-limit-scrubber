import axios from "axios";

// Plain axios instance: the public check page has no login, so none of the
// admin/publisher token handling or 401 redirects apply.
const publicClient = axios.create({ baseURL: "/api/public" });

export async function verifyCheckLink(token) {
  const { data } = await publicClient.get(`/c/${encodeURIComponent(token)}`);
  return data;
}

export async function checkNumber(token, { phone, state }) {
  const { data } = await publicClient.post(`/c/${encodeURIComponent(token)}/check`, {
    phone,
    state: state || undefined,
  });
  return data;
}
