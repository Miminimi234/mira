import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { API_BASE_URL } from "@/lib/apiConfig";
import { LogOut, Settings, Shield, ShieldCheck, User } from "lucide-react";
import { useEffect, useState } from "react";
import { TwoFactorAuthModal } from "./TwoFactorAuthModal";
import { TwoFactorVerifyModal } from "./TwoFactorVerifyModal";

interface LoginButtonProps {
  onLogin?: (email: string) => void;
  onLogout?: () => void;
  isLoggedIn?: boolean;
  userEmail?: string;
}

export const LoginButton = ({
  onLogin,
  onLogout,
  isLoggedIn = false,
  userEmail
}: LoginButtonProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [show2FAVerify, setShow2FAVerify] = useState(false);

  const handleGoogleLogin = () => {
    setIsConnecting(true);

    // Open Google OAuth in a popup window
    const width = 500;
    const height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const popup = window.open(
      `${API_BASE_URL}/api/auth/google`,
      'google-auth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes,location=no,directories=no,status=no`
    );

    if (!popup) {
      setIsConnecting(false);
      alert('Please allow popups for this site to sign in with Google.');
      return;
    }

    // Listen for popup to close or send message
    const checkPopup = setInterval(() => {
      try {
        // Accessing `popup.closed` can be blocked by cross-origin policies
        // (Cross-Origin-Opener-Policy). Wrap in try/catch to avoid noisy
        // console errors; we still use postMessage for the success path.
        if (popup.closed) {
          clearInterval(checkPopup);
          setIsConnecting(false);
          // Check auth status after popup closes
          checkAuthStatus();
        }
      } catch (err) {
        // Ignore cross-origin access errors; rely on postMessage instead.
      }
    }, 500);

    // Listen for message from popup callback page
    const messageHandler = (event: MessageEvent) => {
      // Verify origin for security - allow same origin or API base URL origin
      const currentOrigin = window.location.origin;
      let apiOrigin: string | null = null;

      // Handle empty API_BASE_URL (production - same domain)
      if (API_BASE_URL) {
        try {
          apiOrigin = new URL(API_BASE_URL).origin;
        } catch (e) {
          // Invalid URL, ignore
        }
      }

      // Allow messages from same origin or API origin
      const allowedOrigins = [currentOrigin];
      if (apiOrigin && apiOrigin !== currentOrigin) {
        allowedOrigins.push(apiOrigin);
      }

      if (!allowedOrigins.includes(event.origin)) {
        console.warn('Rejected message from unauthorized origin:', event.origin);
        return;
      }

      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        clearInterval(checkPopup);
        popup.close();
        setIsConnecting(false);
        window.removeEventListener('message', messageHandler);
        checkAuthStatus();
      } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
        clearInterval(checkPopup);
        popup.close();
        setIsConnecting(false);
        window.removeEventListener('message', messageHandler);
        alert('Authentication failed. Please try again.');
      }
    };

    window.addEventListener('message', messageHandler);

    // Cleanup after 5 minutes if popup is still open
    setTimeout(() => {
      try {
        if (!popup.closed) {
          clearInterval(checkPopup);
          popup.close();
          setIsConnecting(false);
          window.removeEventListener('message', messageHandler);
        }
      } catch (err) {
        // Ignore cross-origin errors when querying popup state; still
        // remove message listener to avoid leaks.
        clearInterval(checkPopup);
        try { popup.close(); } catch (_) { }
        setIsConnecting(false);
        window.removeEventListener('message', messageHandler);
      }
    }, 5 * 60 * 1000);
  };

  const checkAuthStatus = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
      if (!resp.ok) {
        console.debug('[LoginButton] not authenticated');
        return;
      }
      const data = await resp.json();
      if (data && data.authenticated && data.user && data.user.email) {
        onLogin?.(data.user.email);
      }
    } catch (e) {
      console.debug('[LoginButton] checkAuthStatus error', e);
    }
  };

  // Check 2FA status when logged in
  useEffect(() => {
    if (isLoggedIn && userEmail) {
      check2FAStatus();
    } else {
      setTwoFAEnabled(false);
    }
  }, [isLoggedIn, userEmail]);

  const check2FAStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/2fa/status`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setTwoFAEnabled(data.enabled || false);
      }
    } catch (error) {
      console.debug('2FA status check failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      // Call logout endpoint to clear OAuth session
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        console.error('Logout failed');
      }
      setTwoFAEnabled(false);
      onLogout?.();
    } catch (error) {
      console.error('Logout error:', error);
      onLogout?.(); // Still call onLogout to clear local state
    }
  };

  // Auth check on mount disabled to prevent repeated failing requests
  // (re-enable when server is healthy)

  if (isLoggedIn) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs font-mono border-border bg-background hover:bg-bg-elevated rounded-full"
              onClick={(e) => {
                // Prevent any default behavior that might interfere
                e.stopPropagation();
              }}
            >
              <User className="w-2.5 h-2.5 mr-1.5" />
              {userEmail?.split('@')[0] || 'Logged In'}
              {twoFAEnabled && (
                <ShieldCheck className="w-2.5 h-2.5 ml-1.5 text-green-500" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-background border-border z-[9999]"
            onClick={(e) => {
              // Prevent clicks inside dropdown from closing it immediately
              e.stopPropagation();
            }}
          >
            {userEmail && (
              <>
                <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">{userEmail}</span>
                    {twoFAEnabled && (
                      <span className="text-[10px] text-green-500 flex items-center gap-1 mt-0.5">
                        <ShieldCheck className="w-3 h-3" />
                        2FA Enabled
                      </span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShow2FASetup(true);
              }}
              className="text-xs cursor-pointer focus:bg-accent"
            >
              {twoFAEnabled ? (
                <>
                  <ShieldCheck className="w-3 h-3 mr-2 text-green-500" />
                  Manage 2FA
                </>
              ) : (
                <>
                  <Shield className="w-3 h-3 mr-2" />
                  Enable 2FA
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Placeholder for settings - can be implemented later
              }}
              className="text-xs cursor-pointer focus:bg-accent"
            >
              <Settings className="w-3 h-3 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLogout();
              }}
              className="text-xs cursor-pointer focus:bg-accent text-destructive focus:text-destructive"
            >
              <LogOut className="w-3 h-3 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TwoFactorAuthModal
          isOpen={show2FASetup}
          onClose={() => {
            setShow2FASetup(false);
            check2FAStatus();
          }}
          userEmail={userEmail || ''}
          has2FA={twoFAEnabled}
          on2FAStatusChange={(enabled) => {
            setTwoFAEnabled(enabled);
            check2FAStatus();
          }}
        />
        <TwoFactorVerifyModal
          open={show2FAVerify}
          onOpenChange={setShow2FAVerify}
          email={userEmail}
          onVerifySuccess={() => {
            // After successful 2FA verification, complete the login
            if (userEmail) {
              onLogin?.(userEmail);
            }
          }}
        />
      </>
    );
  }

  return (
    <button
      onClick={handleGoogleLogin}
      disabled={isConnecting}
      className="h-7 w-7 p-0 bg-transparent hover:bg-bg-elevated border border-border rounded-full transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      title="Sign in with Google"
    >
      {/* Google Logo SVG */}
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
    </button>
  );
};
