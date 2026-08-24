import axios from "axios";

// Separate axios instance from the admin client (api/client.js) - a
// publisher and an admin are logged in with two different JWTs, each only
// valid for its own routes, so each needs its own Authorization header.
const publisherClient = axios.create({ baseURL: "/api" });

publisherClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("publisherToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

publisherClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("publisherToken");
      localStorage.removeItem("publisherName");
      if (window.location.pathname !== "/login" && window.location.pathname !== "/signup") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default publisherClient;
