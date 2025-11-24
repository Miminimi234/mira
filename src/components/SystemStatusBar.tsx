import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getCustodialWallet, getOrCreateWallet, storeCustodialWallet } from "@/lib/wallet";
import { BarChart3, Bot, Check, Copy, Mail, Newspaper, Star, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CustodialWallet } from "./CustodialWallet";
import { LoginButton } from "./LoginButton";

interface SystemStatusBarProps {
  onToggleWaitlist?: () => void;
  onTogglePerformance?: () => void;
  onToggleSummary?: () => void;
  onToggleNewsFeed?: () => void;
  onToggleWatchlist?: () => void;
  onLogout?: () => void;
  isPerformanceOpen?: boolean;
  isSummaryOpen?: boolean;
  showNewsFeed?: boolean;
  showWaitlist?: boolean;
  showWatchlist?: boolean;
}

export const SystemStatusBar = ({
  onToggleWaitlist,
  onTogglePerformance,
  showWaitlist,
  onToggleSummary,
  onToggleNewsFeed,
  onToggleWatchlist,
  onLogout,
  isPerformanceOpen = true,
  isSummaryOpen = true,
  showNewsFeed = false,
  showWatchlist = false
}: SystemStatusBarProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [custodialWallet, setCustodialWallet] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const devEmail = "dev@mira.tech";

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(devEmail);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy email:", err);
    }
  };

  // Track if we're in the middle of a logout to prevent re-login
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    // Temporarily disable server-side auth polling to avoid excessive failing requests.
    // Use localStorage fallback only.
    if (isLoggingOutRef.current) return;

    const storedEmail = localStorage.getItem('userEmail');
    if (storedEmail) {
      setIsLoggedIn(true);
      setUserEmail(storedEmail);
      const storedCustodialWallet = getCustodialWallet();
      if (storedCustodialWallet) {
        setCustodialWallet({
          publicKey: storedCustodialWallet.publicKey,
          privateKey: storedCustodialWallet.privateKey,
        });
      }
    } else {
      setIsLoggedIn(false);
      setUserEmail(undefined);
      const storedCustodialWallet = getCustodialWallet();
      if (storedCustodialWallet) {
        setCustodialWallet({
          publicKey: storedCustodialWallet.publicKey,
          privateKey: storedCustodialWallet.privateKey,
        });
      } else {
        setCustodialWallet(null);
      }
    }
  }, []);

  const handleLogin = async (email: string) => {
    setIsLoggedIn(true);
    setUserEmail(email);
    localStorage.setItem('userEmail', email);

    // Get or create wallet for this email address
    // This ensures the same email always gets the same wallet
    // Checks server first, then localStorage
    const wallet = await getOrCreateWallet(email);

    // Store as custodial wallet for persistence
    storeCustodialWallet(wallet);

    setCustodialWallet({
      publicKey: wallet.publicKey,
      privateKey: wallet.privateKey,
    });
  };

  const handleLogout = async () => {
    // Set logout flag to prevent re-login
    isLoggingOutRef.current = true;

    // Clear local state immediately
    setIsLoggedIn(false);
    setUserEmail(undefined);
    setCustodialWallet(null);

    // Clear localStorage
    localStorage.removeItem('userEmail');

    // Call server logout endpoint to clear session
    try {
      const { API_BASE_URL } = await import('@/lib/apiConfig');
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.debug('Logout request failed:', error);
      // Continue with logout even if server request fails
    }

    // Notify parent component to close waitlist panel if open
    onLogout?.();

    // Reset logout flag after a delay to allow auth checks to work again
    // This prevents immediate re-login but allows future auth checks
    setTimeout(() => {
      isLoggingOutRef.current = false;
    }, 2000);
  };

  return (
    <div className="h-11 bg-bg-elevated border-b border-border flex items-center gap-2 px-4 py-2 relative" style={{ zIndex: 1000 }}>
      {/* Left side - MIRA text */}
      <div className="relative flex items-center gap-2">
        <img
          src="/Miraupp.png"
          alt="MIRA"
          className="w-auto"
          style={{
            height: '32px',
            imageRendering: 'high-quality',
          }}
        />
        <h1
          className="font-bold tracking-tight"
          style={{
            fontFamily: "'Boge', sans-serif",
            color: '#FFFFFF',
            fontSize: '1.25rem',
          }}
        >
          {'MIRA'.split('').map((letter, index) => (
            <span key={index} className="mira-letter">
              {letter === ' ' ? '\u00A0' : letter}
            </span>
          ))}
        </h1>
      </div>

      {/* Center - X (Twitter), Contact - Absolutely centered */}
      <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open('https://x.com/miramaps', '_blank', 'noopener,noreferrer')}
          className="h-7 w-7 p-0 border-border bg-background hover:bg-bg-elevated text-foreground hover:text-foreground rounded-full"
          title="X (Twitter)"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5 fill-current"
            aria-label="X"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </Button>
        <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 border-border bg-background hover:bg-bg-elevated text-foreground hover:text-foreground rounded-full"
              title="Contact"
            >
              <Mail className="w-3.5 h-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">Contact Us</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Have a question or feedback? Reach out to our development team.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Development Email
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-muted rounded-md border border-border font-mono text-sm">
                    {devEmail}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyEmail}
                    className="h-9 px-3"
                  >
                    {emailCopied ? (
                      <>
                        <Check className="w-4 h-4 mr-1.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1.5" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => window.open(`mailto:${devEmail}`, '_blank')}
                    className="h-9 px-3"
                  >
                    <Mail className="w-4 h-4 mr-1.5" />
                    Email
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Right side - Performance, Summary, News Feed, Build Agent, Wallet, Login */}
      <div className="flex items-center gap-2 ml-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={onTogglePerformance}
          className={`h-7 w-7 p-0 border-border rounded-full transition-colors ${isPerformanceOpen
              ? 'bg-terminal-accent/20 border-terminal-accent/50 text-terminal-accent hover:bg-terminal-accent/30'
              : 'bg-background hover:bg-bg-elevated text-foreground hover:text-foreground'
            }`}
          title="Performance Index"
        >
          <BarChart3 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleSummary}
          className={`h-7 w-7 p-0 border-border rounded-full transition-colors ${isSummaryOpen && !showNewsFeed && !showWaitlist && !showWatchlist
              ? 'bg-terminal-accent/20 border-terminal-accent/50 text-terminal-accent hover:bg-terminal-accent/30'
              : 'bg-background hover:bg-bg-elevated text-foreground hover:text-foreground'
            }`}
          title="Summary"
        >
          <Users className="w-3.5 h-3.5" />
        </Button>
        {isLoggedIn && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleWatchlist}
            className={`h-7 w-7 p-0 border-border rounded-full transition-colors ${showWatchlist && isSummaryOpen && !showNewsFeed && !showWaitlist
                ? 'bg-terminal-accent/20 border-terminal-accent/50 text-terminal-accent hover:bg-terminal-accent/30'
                : 'bg-background hover:bg-bg-elevated text-foreground hover:text-foreground'
              }`}
            title="Watchlist"
          >
            <Star className={`w-3.5 h-3.5 ${showWatchlist ? 'fill-terminal-accent' : ''}`} />
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleNewsFeed}
          className={`h-7 w-7 p-0 border-border rounded-full transition-colors ${showNewsFeed && isSummaryOpen
              ? 'bg-terminal-accent/20 border-terminal-accent/50 text-terminal-accent hover:bg-terminal-accent/30'
              : 'bg-background hover:bg-bg-elevated text-foreground hover:text-foreground'
            }`}
          title="News Feed"
        >
          <Newspaper className="w-3.5 h-3.5" />
        </Button>
        {isLoggedIn && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleWaitlist}
            className={`h-7 w-7 p-0 border-border rounded-full transition-colors ${showWaitlist && isSummaryOpen && !showNewsFeed
                ? 'border-terminal-accent bg-terminal-accent/20 text-terminal-accent hover:bg-terminal-accent/30'
                : 'bg-background hover:bg-bg-elevated text-foreground hover:text-foreground'
              }`}
            title="Join Waitlist"
          >
            <Bot className="w-3.5 h-3.5" />
          </Button>
        )}
        {custodialWallet && (
          <CustodialWallet
            walletAddress={custodialWallet.publicKey}
            privateKey={custodialWallet.privateKey}
          />
        )}
        <LoginButton
          onLogin={handleLogin}
          onLogout={handleLogout}
          isLoggedIn={isLoggedIn}
          userEmail={userEmail}
        />
      </div>
    </div>
  );
};
