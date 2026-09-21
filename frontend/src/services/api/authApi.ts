import { UserProfile } from '../../types';

export const DEV_USER: UserProfile = {
  id: 'usr_dev_mode',
  name: 'Development User',
  email: 'dev@local.internal',
  role: 'Data Architect',
  department: 'Enterprise Data Platform',
  organization: 'Acme Operations',
  lastLogin: 'Dev Mode Active',
};

let activeUser: UserProfile | null = { ...DEV_USER };

export const authApi = {
  async getCurrentUser(): Promise<UserProfile | null> {
    return activeUser ? { ...activeUser } : null;
  },

  async login(email: string, _password?: string): Promise<{ success: boolean; user: UserProfile; token: string }> {
    // Production authentication service is not implemented.
    throw new Error('Authentication service is not implemented. Platform is running in unauthenticated development mode.');
  },

  async logout(): Promise<boolean> {
    activeUser = null;
    return true;
  },

  async requestPasswordReset(_email: string): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: 'Password reset service is not implemented in development mode.',
    };
  },

  async completePasswordReset(_token: string, _newPass: string): Promise<{ success: boolean }> {
    return { success: false };
  },
};

