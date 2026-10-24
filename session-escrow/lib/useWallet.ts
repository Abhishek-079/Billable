"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addUsdcTrustline,
  fundWithFriendbot,
  getBalances,
  getName,
  getWallet,
  resetWallet,
  setName as saveName,
  type Balances,
  type Wallet,
} from "./wallet";

export function useWallet() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [name, setNameState] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWallet(getWallet());
    setNameState(getName());
  }, []);

  const refresh = useCallback(async () => {
    if (wallet) setBalances(await getBalances(wallet.address));
  }, [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e?.response?.data?.title || e?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  return {
    wallet,
    balances,
    name,
    setName: (n: string) => {
      setNameState(n);
      saveName(n);
    },
    busy,
    error,
    refresh,
    getTestXlm: () => wallet && run("xlm", () => fundWithFriendbot(wallet.address)),
    addUsdc: () => run("usdc", addUsdcTrustline),
    newWallet: () => {
      resetWallet();
      setWallet(getWallet());
      setBalances(null);
    },
  };
}

export type WalletState = ReturnType<typeof useWallet>;
