import { UserProfile } from '../../types';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
  user: UserProfile;
}

interface MeResponse {
  success: boolean;
  user: UserProfile;
}

const TOKEN_KEY = 'pi_analytics_auth_token';

export const authApi = {
  async getCurrentUser(): Promise<UserProfile | null> {
    const token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        localStorage.removeItem(TOKEN_KEY);
        return null;
      }

      const data: MeResponse = await response.json();
      return data.user;
    } catch {
      return null;
    }
  },

  async login(
    email: string,
    password?: string,
  ): Promise<{ success: boolean; user: UserProfile; token: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: password ?? '',
      }),
    });

    const data: AuthResponse = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Invalid email or password');
    }

    localStorage.setItem(TOKEN_KEY, data.token);

    return {
      success: data.success,
      user: data.user,
      token: data.token,
    };
  },

  async register(
    name: string,
    email: string,
    password: string,
  ): Promise<{ success: boolean; user: UserProfile; token: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    });

    const data: AuthResponse = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    localStorage.setItem(TOKEN_KEY, data.token);

    return {
      success: data.success,
      user: data.user,
      token: data.token,
    };
  },

  async logout(): Promise<boolean> {
    localStorage.removeItem(TOKEN_KEY);
    return true;
  },

  async requestPasswordReset(
    _email: string,
  ): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: 'Password reset is not implemented yet.',
    };
  },

  async completePasswordReset(
    _token: string,
    _newPass: string,
  ): Promise<{ success: boolean }> {
    return { success: false };
  },
};
