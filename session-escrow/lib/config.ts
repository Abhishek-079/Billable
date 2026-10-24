export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const FRIENDBOT_URL = "https://friendbot.stellar.org";
export const EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx/";
export const EXPLORER_ACCOUNT = "https://stellar.expert/explorer/testnet/account/";

export const USDC = {
  symbol: "USDC",
  address:
    process.env.NEXT_PUBLIC_USDC_ISSUER ||
    "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
};

// Percent. VERIFY units against the live API (docs examples show both 5 and 50).
export const PLATFORM_FEE = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE ?? 1);

// Public address that receives the platform fee and acts as dispute resolver.
// Create one with `node scripts/platform-setup.mjs`.
export const PLATFORM_ADDRESS = process.env.NEXT_PUBLIC_PLATFORM_ADDRESS || "";

// Optional: a link to a service the user can cash USDC out with (shown on the home page).
export const CASHOUT_URL = process.env.NEXT_PUBLIC_CASHOUT_URL || "";
export const CASHOUT_NAME = process.env.NEXT_PUBLIC_CASHOUT_NAME || "our cash-out partner";
