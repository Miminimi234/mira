import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, AlertCircle } from "lucide-react";
import { API_BASE_URL } from "@/lib/apiConfig";

interface TwoFactorVerifyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerifySuccess?: () => void;
  email?: string;
}

export const TwoFactorVerifyModal = ({
  open,
  onOpenChange,
  onVerifySuccess,
  email,
}: TwoFactorVerifyModalProps) => {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!token || !/^\d{6}$/.test(token)) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/api/auth/2fa/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ code: token }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Verification failed");
      }

      // Verification successful
      setToken("");
      onVerifySuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Verification failed. Please try again.");
      setToken("");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setToken("");
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Two-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            {email
              ? `Enter the 6-digit code from your authenticator app for ${email}`
              : "Enter the 6-digit code from your authenticator app to continue."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="token" className="text-sm">
              Verification Code
            </Label>
            <Input
              id="token"
              type="text"
              placeholder="000000"
              value={token}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                setToken(value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && token.length === 6 && !loading) {
                  handleVerify();
                }
              }}
              className="font-mono text-center text-lg tracking-widest"
              maxLength={6}
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleVerify}
            disabled={loading || token.length !== 6}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

