import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldCheck, Check, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PiByThreeLogo } from '../../components/brand/Logo';
import { authApi } from '../../services/api';
import { NavigationPage } from '../../types';

export const LoginPage: React.FC<{ onNavigate: (page: NavigationPage) => void }> = ({ onNavigate }) => {
  const [email, setEmail] = useState('m.vance@acmecorp.internal');
  const [password, setPassword] = useState('••••••••••••');
  const [rememberMe, setRememberMe] = useState(true);
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
      setError(err?.message || 'Authentication is not implemented. Platform is running in unauthenticated development mode.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-black">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        <div className="mb-3 cursor-pointer" onClick={() => onNavigate('overview')}>
          <PiByThreeLogo size="lg" showTagline={true} />
        </div>
        <p className="text-xs text-neutral-600 font-medium">
          Enterprise Data Discovery &amp; Real-time AI Analytics Platform
        </p>
      </div>

      {/* Main Authentication Card */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xs border border-neutral-300 rounded-xl space-y-6">
          <div>
            <h3 className="text-sm font-bold text-black">Platform Mode</h3>
            <p className="text-xs text-neutral-600 font-medium mt-0.5">
              Authentication service is not implemented. Platform is running in unauthenticated development mode.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded text-xs text-amber-950 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Enterprise Email"
              type="email"
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
            />

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none text-neutral-700 font-medium">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-neutral-300 text-black focus:ring-black"
                />
                <span>Remember session (14 days)</span>
              </label>

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
              Sign In to Platform
            </Button>
          </form>

          {/* Dev Mode Option */}
          <div className="relative pt-2">
            <div className="absolute inset-0 flex items-center pt-2">
              <div className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-neutral-500 text-[10px] font-bold tracking-wider">
                Or Dev Access
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => {
              onNavigate('overview');
            }}
            className="w-full"
          >
            Continue in Unauthenticated Dev Mode
          </Button>

          <div className="pt-2 border-t border-neutral-200 flex items-center justify-center gap-1.5 text-[11px] text-neutral-500 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-black" />
            <span>Unauthenticated Dev Mode Active</span>
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
    await authApi.requestPasswordReset(email || 'user@acme.com');
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-black">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        <div className="mb-3 cursor-pointer" onClick={() => onNavigate('overview')}>
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
              <h3 className="text-sm font-bold text-black">Recovery email sent</h3>
              <p className="text-xs text-neutral-600 leading-relaxed font-medium">
                If <span className="font-mono-code font-bold text-black">{email}</span> exists in the directory, you will receive password reset instructions.
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
