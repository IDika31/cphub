import { create } from "zustand";

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    // TODO: API call to POST /api/auth/login
    set({ isLoading: true });
    try {
      const res = await fetch("http://localhost:3001/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Login failed");
      const data = await res.json();
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ isLoading: false });
      throw new Error("Login failed");
    }
  },

  register: async (name: string, email: string, password: string) => {
    // TODO: API call to POST /api/auth/register
    set({ isLoading: true });
    try {
      const res = await fetch("http://localhost:3001/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Register failed");
      const data = await res.json();
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ isLoading: false });
      throw new Error("Register failed");
    }
  },

  loginWithGoogle: () => {
    window.location.href = "http://localhost:3001/api/auth/google";
  },

  logout: () => {
    set({ user: null, isAuthenticated: false });
  },

  setUser: (user: User) => set({ user, isAuthenticated: true, isLoading: false }),
}));
