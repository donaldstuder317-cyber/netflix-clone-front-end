import axios from "axios";
import { supabase } from "./supabase.js";

// Axios instance for Supabase Edge Functions.
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) config.headers.Authorization = `Bearer ${session.access_token}`;
  config.headers.apikey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return config;
});

export const createDonation = (amount, user_id) =>
  api.post("/process-donation", { amount, user_id }).then((r) => r.data);
