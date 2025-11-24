import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Maximize2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

interface SendSolModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string;
  privateKey: string;
  onSuccess?: () => void;
}

export const SendSolModal = ({ open, onOpenChange, walletAddress, privateKey, onSuccess }: SendSolModalProps) => {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && walletAddress) {
      fetchBalance();
    }
  }, [open, walletAddress]);

  const fetchBalance = async () => {
    setIsLoadingBalance(true);
    try {
      // Get RPC endpoints (Helius first if configured, then public endpoints)
      const { getSolanaRpcEndpoints } = await import('@/lib/apiConfig');
      const rpcEndpoints = getSolanaRpcEndpoints();
      
      let lastError: Error | null = null;
      for (const endpoint of rpcEndpoints) {
        try {
          const connection = new Connection(endpoint, "confirmed");
      const publicKey = new PublicKey(walletAddress);
      const balanceLamports = await connection.getBalance(publicKey);
      const balanceSol = balanceLamports / 1_000_000_000;
      setBalance(balanceSol);
          return; // Success, exit
        } catch (error: any) {
          lastError = error;
          // If rate limited, try next endpoint
          if (error.message?.includes('403') || error.message?.includes('429')) {
            continue;
          }
          // For other errors, also try next endpoint
          continue;
        }
      }
      
      // If all endpoints failed
      if (lastError) {
        console.debug('Failed to fetch Solana balance:', lastError.message);
      }
      setBalance(0);
    } catch (error) {
      // Silent fail
      console.debug('Error fetching balance:', error);
      setBalance(0);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const handleMaxAmount = async () => {
    if (balance <= 0) {
      toast({
        title: "Error",
        description: "Insufficient balance",
        variant: "destructive",
      });
      return;
    }

    try {
      // Estimate transaction fee (typically around 0.000005 SOL)
      const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
      const feeEstimate = await connection.getRecentPrioritizationFees();
      const estimatedFee = feeEstimate.length > 0 
        ? feeEstimate[0].prioritizationFee / 1_000_000_000 
        : 0.000005; // Fallback fee estimate
      
      // Set amount to balance minus fee (with small buffer)
      const maxAmount = Math.max(0, balance - estimatedFee - 0.000001); // Small buffer
      setAmount(maxAmount.toFixed(9));
    } catch (error) {
      // If fee estimation fails, use a conservative estimate
      const maxAmount = Math.max(0, balance - 0.00001);
      setAmount(maxAmount.toFixed(9));
    }
  };

  const handleSend = async () => {
    if (!recipient || !amount) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    try {
      // Validate recipient address
      new PublicKey(recipient);
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid recipient address",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      // Restore keypair from private key
      const secretKey = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(secretKey);

      // Connect to Solana network - get RPC endpoints (Helius first if configured)
      const { getSolanaRpcEndpoints } = await import('@/lib/apiConfig');
      const rpcEndpoints = getSolanaRpcEndpoints();
      
      let connection: Connection | null = null;
      let lastError: Error | null = null;
      
      for (const endpoint of rpcEndpoints) {
        try {
          const testConnection = new Connection(endpoint, "confirmed");
          // Test connection by getting recent blockhash
          await testConnection.getLatestBlockhash();
          connection = testConnection;
          break; // Success, use this endpoint
        } catch (error: any) {
          lastError = error;
          continue; // Try next endpoint
        }
      }
      
      if (!connection) {
        throw new Error(`Failed to connect to Solana RPC: ${lastError?.message || 'All endpoints failed'}`);
      }

      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(recipient),
          lamports: amountNum * 1_000_000_000, // Convert SOL to lamports
        })
      );

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;

      // Sign transaction
      transaction.sign(keypair);

      // Send transaction
      const signature = await connection.sendRawTransaction(transaction.serialize());

      // Confirm transaction
      await connection.confirmTransaction(signature, "confirmed");

      toast({
        title: "Success!",
        description: `Sent ${amount} SOL to ${recipient.slice(0, 8)}...`,
      });

      setRecipient("");
      setAmount("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send SOL",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono uppercase text-terminal-accent">
            SEND SOL
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Send SOL from your custodial wallet
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="recipient" className="text-xs font-mono uppercase text-muted-foreground">
              Recipient Address
            </Label>
            <Input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Enter Solana address"
              className="font-mono text-xs bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="amount" className="text-xs font-mono uppercase text-muted-foreground">
                Amount (SOL)
              </Label>
              {!isLoadingBalance && balance > 0 && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  Available: {balance.toFixed(4)} SOL
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="amount"
                type="number"
                step="0.000000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="font-mono text-xs bg-background border-border flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMaxAmount}
                disabled={isLoadingBalance || balance <= 0}
                className="h-9 px-3 text-xs font-mono border-border bg-background hover:bg-bg-elevated whitespace-nowrap"
              >
                <Maximize2 className="w-3 h-3 mr-1" />
                Max
              </Button>
            </div>
          </div>

          <Button
            onClick={handleSend}
            disabled={isSending || !recipient || !amount}
            className="w-full h-9 text-xs font-mono bg-terminal-accent hover:bg-terminal-accent/90 text-black"
          >
            {isSending ? (
              "Sending..."
            ) : (
              <>
                <Send className="w-3.5 h-3.5 mr-2" />
                Send SOL
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

