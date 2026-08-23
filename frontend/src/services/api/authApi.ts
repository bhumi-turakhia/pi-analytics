import { UserProfile } from '../../types';
import { CURRENT_USER } from '../../constants/mockData';

let activeUser: UserProfile | null = { ...CURRENT_USER };

export const authApi = {
  async getCurrentUser(): Promise<UserProfile | null> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return activeUser ? { ...activeUser } : null;
  },

  async login(email: string, _password?: string): Promise<{ success: boolean; user: UserProfile; token: string }> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    activeUser = {
      ...CURRENT_USER,
      email: email || CURRENT_USER.email,
    };
    return {
      success: true,
      user: activeUser,
      token: 'jwt_mock_enterprise_pi_token_94821',
    };
  },

  async logout(): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    activeUser = null;
    return true;
  },

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return {
      success: true,
      message: `A secure single-use recovery link has been dispatched to ${email}. Valid for 15 minutes.`,
    };
  },

  async completePasswordReset(_token: string, _newPass: string): Promise<{ success: boolean }> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { success: true };
  },
};
