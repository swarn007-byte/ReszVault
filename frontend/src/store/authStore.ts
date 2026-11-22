import { create } from "zustand";
import type { Provider, Session, User } from "@supabase/supabase-js";
import { DIRECT_ENTRY_EMAIL, isDirectEntryEmail } from "../constants/auth";
import { supabase } from "../lib/supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  init: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signInWithProvider: (provider: Extract<Provider, "google" | "twitter">) => Promise<void>;
  signInWithOtp: (email: string) => Promise<void>;
  signInDirectEntry: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,

  init: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    set({
      session,
      user: session?.user ?? null,
      loading: false,
      initialized: true,
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, loading: false });
    });
  },

  signInWithPassword: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signUpWithPassword: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  },

  signInWithProvider: async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  },

  signInWithOtp: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  },

  signInDirectEntry: async (email) => {
    if (!isDirectEntryEmail(email)) {
      throw new Error("Direct entry is not available for this email.");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const password = import.meta.env.VITE_DIRECT_ENTRY_PASSWORD;

    if (password) {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;
      return;
    }

    const bypassUser = {
      id: "direct-entry",
      email: DIRECT_ENTRY_EMAIL,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as User;

    const bypassSession = {
      access_token: "",
      refresh_token: "",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: bypassUser,
    } as Session;

    set({ session: bypassSession, user: bypassUser, loading: false });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
