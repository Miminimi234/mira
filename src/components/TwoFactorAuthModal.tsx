import { useState, useEffect } from "react";
import { X, Shield, ShieldCheck, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/apiConfig";

interface TwoFactorAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  has2FA: boolean;
  on2FAStatusChange: (enabled: boolean) => void;
}

export const TwoFactorAuthModal = ({
  isOpen,
  onClose,
  userEmail,
  has2FA,
  on2FAStatusChange,
}: TwoFactorAuthModalProps) => {
  const [step, setStep] = useState<'setup' | 'verify' | 'enabled' | 'disable'>('setup');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (has2FA) {
        setStep('enabled');
      } else {
        setStep('setup');
        generate2FASecret();
      }
    }
  }, [isOpen, has2FA]);

  const generate2FASecret = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_BASE_URL}/api/auth/2fa/generate`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setQrCodeUrl(data.qrCodeUrl);
        setSecret(data.secret);
        setStep('verify');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to generate 2FA secret');
      }
    } catch (error) {
      setError('Failed to generate 2FA secret. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const verifyAndEnable2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_BASE_URL}/api/auth/2fa/enable`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: verificationCode }),
      });

      if (response.ok) {
        on2FAStatusChange(true);
        setStep('enabled');
        setVerificationCode('');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Invalid verification code. Please try again.');
      }
    } catch (error) {
      setError('Failed to enable 2FA. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const disable2FA = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_BASE_URL}/api/auth/2fa/disable`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: verificationCode }),
      });

      if (response.ok) {
        on2FAStatusChange(false);
        setStep('setup');
        setVerificationCode('');
        setError('');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Invalid verification code. Please try again.');
      }
    } catch (error) {
      setError('Failed to disable 2FA. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm" style={{ pointerEvents: 'auto' }}>
      <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-md mx-4" style={{ pointerEvents: 'auto' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {has2FA ? (
              <ShieldCheck className="w-5 h-5 text-green-500" />
            ) : (
              <Shield className="w-5 h-5" />
            )}
            <h2 className="text-lg font-semibold">
              {has2FA ? 'Two-Factor Authentication' : 'Enable 2FA'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'setup' && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Two-factor authentication adds an extra layer of security to your account.
              </p>
              <Button onClick={generate2FASecret} disabled={loading}>
                {loading ? 'Generating...' : 'Generate QR Code'}
              </Button>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Scan this QR code with Google Authenticator or any TOTP app:
                </p>
                {qrCodeUrl && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-white p-4 rounded-lg">
                      <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
                    </div>
                    <div className="w-full">
                      <p className="text-xs text-muted-foreground mb-2">Or enter this secret manually:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 bg-bg-elevated rounded text-xs font-mono break-all">
                          {secret}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copySecret}
                          className="flex-shrink-0"
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Enter verification code:
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setVerificationCode(value);
                    setError('');
                  }}
                  placeholder="000000"
                  className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-center text-lg font-mono tracking-widest"
                  maxLength={6}
                />
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded p-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep('setup');
                    setVerificationCode('');
                    setError('');
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={verifyAndEnable2FA}
                  disabled={loading || verificationCode.length !== 6}
                  className="flex-1"
                >
                  {loading ? 'Verifying...' : 'Verify & Enable'}
                </Button>
              </div>
            </div>
          )}

          {step === 'enabled' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-500">
                <ShieldCheck className="w-5 h-5" />
                <p className="text-sm font-medium">2FA is enabled for your account</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Your account is protected with two-factor authentication. You'll need to enter a code from your authenticator app when logging in.
              </p>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Enter verification code to disable:
                </label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setVerificationCode(value);
                    setError('');
                  }}
                  placeholder="000000"
                  className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-center text-lg font-mono tracking-widest"
                  maxLength={6}
                />
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded p-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                >
                  Close
                </Button>
                <Button
                  variant="destructive"
                  onClick={disable2FA}
                  disabled={loading || verificationCode.length !== 6}
                  className="flex-1"
                >
                  {loading ? 'Disabling...' : 'Disable 2FA'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

