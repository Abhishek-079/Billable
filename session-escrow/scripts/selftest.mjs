// Offline sanity check: building and signing a Stellar testnet tx the same way lib/wallet.ts does.
import { Account, BASE_FEE, Keypair, Networks, Operation, TransactionBuilder, Asset } from "@stellar/stellar-sdk";

const kp = Keypair.random();
const unsigned = new TransactionBuilder(new Account(kp.publicKey(), "1"), {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.changeTrust({ asset: new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5") }))
  .setTimeout(60)
  .build()
  .toXDR();

const tx = TransactionBuilder.fromXDR(unsigned, Networks.TESTNET);
tx.sign(kp);
const signed = TransactionBuilder.fromXDR(tx.toXDR(), Networks.TESTNET);
if (signed.signatures.length !== 1) throw new Error("signature missing");
const ok = kp.verify(signed.hash(), signed.signatures[0].signature());
if (!ok) throw new Error("signature invalid");
console.log("selftest ok: XDR parse, sign, verify");
