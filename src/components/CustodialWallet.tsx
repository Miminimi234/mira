import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Wallet, Send, Download, Copy, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SendSolModal } from "./SendSolModal";

interface CustodialWalletProps {
  walletAddress?: string;
  privateKey?: string;
}

export const CustodialWallet = ({ walletAddress, privateKey }: CustodialWalletProps) => {
  const [balance, setBalance] = useState<string>("0.00");
  const [isLoading, setIsLoading] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (walletAddress) {
      fetchBalance();
    }
  }, [walletAddress]);

  const fetchBalance = async () => {
    if (!walletAddress) return;
    
    setIsLoading(true);
    try {
      // Get RPC endpoints (Helius first if configured, then public endpoints)
      const { getSolanaRpcEndpoints } = await import('@/lib/apiConfig');
      const rpcEndpoints = getSolanaRpcEndpoints();
      
      let lastError: Error | null = null;
      for (const endpoint of rpcEndpoints) {
        try {
          const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [walletAddress],
        }),
      });

          if (!response.ok) {
            // If 403 or rate limit, try next endpoint
            if (response.status === 403 || response.status === 429) {
              continue;
            }
            throw new Error(`HTTP ${response.status}`);
          }

      const data = await response.json();
      if (data.result) {
        // Convert lamports to SOL (1 SOL = 1,000,000,000 lamports)
        const solBalance = data.result.value / 1_000_000_000;
        setBalance(solBalance.toFixed(4));
            return; // Success, exit
          }
        } catch (error: any) {
          lastError = error;
          // Continue to next endpoint
          continue;
        }
      }
      
      // If all endpoints failed, set balance to 0
      if (lastError) {
        console.debug('Failed to fetch Solana balance:', lastError.message);
      }
      setBalance("0.00");
    } catch (error) {
      // Silent fail - don't show error to user
      console.debug('Error fetching balance:', error);
      setBalance("0.00");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      toast({
        title: "Copied!",
        description: "Wallet address copied to clipboard",
      });
    }
  };

  const handleCopyPrivateKey = () => {
    if (privateKey) {
      navigator.clipboard.writeText(privateKey);
      toast({
        title: "Copied!",
        description: "Private key copied to clipboard",
      });
    }
  };

  const handleExportPrivateKey = () => {
    if (privateKey) {
      const blob = new Blob([privateKey], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wallet-private-key-${walletAddress?.slice(0, 8)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Exported!",
        description: "Private key exported successfully",
      });
    }
  };

  const handleSendSol = () => {
    setShowSendModal(true);
  };

  const handleSendSuccess = () => {
    // Refresh balance after sending
    fetchBalance();
  };

  if (!walletAddress) return null;

  return (
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
          <Wallet className="w-2.5 h-2.5 mr-1.5" />
          {isLoading ? "..." : `${balance} SOL`}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-64 bg-background border-border z-[9999]"
        onClick={(e) => {
          // Prevent clicks inside dropdown from closing it immediately
          e.stopPropagation();
        }}
        style={{ pointerEvents: 'auto' }}
      >
        <DropdownMenuLabel className="text-xs font-mono text-terminal-accent">
          CUSTODIAL WALLET
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator className="bg-border" />
        
        {/* Balance */}
        <div className="px-2 py-2">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Balance</div>
          <div className="text-sm font-mono font-bold text-foreground">
            {isLoading ? "Loading..." : `${balance} SOL`}
          </div>
        </div>

        <DropdownMenuSeparator className="bg-border" />

        {/* Wallet Address */}
        <div className="px-2 py-2">
          <div className="text-[10px] text-muted-foreground uppercase mb-1">Address</div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-mono text-foreground break-all flex-1">
              {walletAddress}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-bg-elevated"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCopyAddress();
              }}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <DropdownMenuSeparator className="bg-border" />

        {/* Actions */}
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSendSol();
          }}
          className="text-xs cursor-pointer flex items-center gap-2 hover:bg-bg-elevated focus:bg-accent"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send SOL</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowPrivateKey(!showPrivateKey);
          }}
          className="text-xs cursor-pointer flex items-center gap-2 hover:bg-bg-elevated focus:bg-accent"
        >
          {showPrivateKey ? (
            <>
              <EyeOff className="w-3.5 h-3.5" />
              <span>Hide Private Key</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span>Show Private Key</span>
            </>
          )}
        </DropdownMenuItem>

        {showPrivateKey && privateKey && (
          <div className="px-2 py-2 border-t border-border">
            <div className="text-[10px] text-muted-foreground uppercase mb-1">Private Key</div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-mono text-foreground break-all flex-1">
                {privateKey}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-bg-elevated"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCopyPrivateKey();
                }}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        <DropdownMenuSeparator className="bg-border" />

        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleExportPrivateKey();
          }}
          className="text-xs cursor-pointer flex items-center gap-2 hover:bg-bg-elevated focus:bg-accent"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Private Key</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            fetchBalance();
          }}
          className="text-xs cursor-pointer flex items-center gap-2 hover:bg-bg-elevated focus:bg-accent"
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Refresh Balance</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      
      <SendSolModal
        open={showSendModal}
        onOpenChange={setShowSendModal}
        walletAddress={walletAddress}
        privateKey={privateKey}
        onSuccess={handleSendSuccess}
      />
    </DropdownMenu>
  );
};

