import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, Check, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PiByThreeLogo } from '../../components/brand/Logo';
import { authApi } from '../../services/api';
import { NavigationPage } from '../../types';

export const LoginPage: React.FC<{ onNavigate: (page: NavigationPage) => void }> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await authApi.login(email, password);
      onNavigate('overview');
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-black">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        <div className="mb-3">
          <PiByThreeLogo size="lg" showTagline={true} />
        </div>
        <p className="text-xs text-neutral-600 font-medium">
          Enterprise Data Discovery &amp; Real-time AI Analytics Platform
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xs border border-neutral-300 rounded-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-black">Sign In</h2>
            <p className="text-xs text-neutral-600 font-medium mt-1">
              Sign in to access your analytics workspace.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-900 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Enterprise Email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />

            <div className="flex items-center justify-end text-xs">
              <button
                type="button"
                onClick={() => onNavigate('auth-forgot')}
                className="font-bold text-black hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              className="w-full"
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Sign In
            </Button>
          </form>

          <div className="border-t border-neutral-200 pt-5 text-center">
            <p className="text-xs text-neutral-600 mb-2">
              Don't have an account?
            </p>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => onNavigate('auth-register')}
              className="w-full"
            >
              Create Account
            </Button>
          </div>

          <div className="pt-2 border-t border-neutral-200 flex items-center justify-center gap-1.5 text-[11px] text-neutral-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-black" />
            <span>Secure account authentication</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const RegisterPage: React.FC<{ onNavigate: (page: NavigationPage) => void }> = ({ onNavigate }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      await authApi.register(name, email, password);
      onNavigate('overview');
    } catch (err: any) {
      setError(err?.message || 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-black">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        <div className="mb-3">
          <PiByThreeLogo size="lg" showTagline={true} />
        </div>
        <p className="text-xs text-neutral-600 font-medium">
          Create your analytics platform account
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xs border border-neutral-300 rounded-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-black">Create Account</h2>
            <p className="text-xs text-neutral-600 font-medium mt-1">
              Register a new account to access the platform.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-900 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <Input
              label="Enterprise Email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />

            <Input
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              className="w-full"
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Create Account
            </Button>
          </form>

          <div className="border-t border-neutral-200 pt-5 text-center">
            <p className="text-xs text-neutral-600 mb-2">
              Already have an account?
            </p>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => onNavigate('auth-login')}
              className="w-full"
              leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
            >
              Back to Sign In
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ForgotPasswordPage: React.FC<{ onNavigate: (page: NavigationPage) => void }> = ({
  onNavigate,
}) => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await authApi.requestPasswordReset(email);
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-black">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        <div className="mb-3">
          <PiByThreeLogo size="md" showTagline={true} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-black font-sans">
          Reset Password
        </h2>
        <p className="mt-1 text-xs text-neutral-600 font-medium">
          Enter your corporate email to receive recovery instructions.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xs border border-neutral-300 rounded-xl space-y-6">
          {submitted ? (
            <div className="space-y-4 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
                <Check className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-black">Request submitted</h3>
              <p className="text-xs text-neutral-600 leading-relaxed font-medium">
                If the account exists, password recovery instructions will be sent.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('auth-login')}
                className="w-full mt-2"
                leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
              >
                Back to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Corporate Email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={loading}
                className="w-full"
              >
                Send Reset Link
              </Button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('auth-login')}
                  className="text-xs font-bold text-black hover:underline cursor-pointer"
                >
                  Return to login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
