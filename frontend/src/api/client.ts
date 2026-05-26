import axios from "axios";
import { getApiBase } from "../lib/api-base";
import { getGuestId } from "../lib/guest-id";

export const api = axios.create({
  baseURL: getApiBase(),
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  config.headers.set("x-guest-id", getGuestId());
  return config;
});
