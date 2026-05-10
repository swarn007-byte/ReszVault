import axios from "axios";
import { getApiBase } from "../lib/api-base";

export const api = axios.create({
  baseURL: getApiBase(),
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});
