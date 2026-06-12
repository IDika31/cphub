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
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  checkAuth: async () => {
    try {
      const token = localStorage.getItem("cphub_token");
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const res = await fetch("http://localhost:3001/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        set({ user: { id: data.userId, email: data.email, name: "" }, isAuthenticated: true, isLoading: false });
      } else {
        localStorage.removeItem("cphub_token");
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const res = await fetch("http://localhost:3001/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error((err as { error?: string }).error || "Login failed");
      }
      const data = await res.json();
      localStorage.setItem("cphub_token", data.accessToken);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true });
    try {
      const res = await fetch("http://localhost:3001/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error((err as { error?: string }).error || "Register failed");
      }
      const data = await res.json();
      localStorage.setItem("cphub_token", data.accessToken);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  loginWithGoogle: () => {
    window.location.href = "http://localhost:3001/api/auth/google";
  },

  logout: () => {
    localStorage.removeItem("cphub_token");
    set({ user: null, isAuthenticated: false });
  },

  setUser: (user: User) =>
    set({ user, isAuthenticated: true, isLoading: false }),
}));
