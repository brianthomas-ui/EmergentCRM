import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("crm_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiError(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg || JSON.stringify(d)).join(" ");
  return String(detail);
}

export default client;
