import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Cookies (httpOnly session + csrf_token) are sent automatically with withCredentials.
const client = axios.create({ baseURL: API, withCredentials: true });

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[2]) : null;
}

const MUTATING = ["post", "put", "patch", "delete"];

// Double-submit CSRF: echo the readable csrf_token cookie in a header on mutations.
client.interceptors.request.use((config) => {
  if (MUTATING.includes((config.method || "").toLowerCase())) {
    const csrf = getCookie("csrf_token");
    if (csrf) config.headers["X-CSRF-Token"] = csrf;
  }
  return config;
});

// On an unauthenticated response, send the user back to login (except during auth calls).
client.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || "";
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/me");
    if (status === 401 && !isAuthCall && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    return Promise.reject(error);
  }
);

export function apiError(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg || JSON.stringify(d)).join(" ");
  return String(detail);
}

export default client;
