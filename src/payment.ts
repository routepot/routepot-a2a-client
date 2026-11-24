import type { PaymentPolicy } from "@x402/core/client";
import { isAddressEqual, type Address } from "viem";
import { BASE_NETWORK, BASE_USDC } from "./identity";

export const onlyTheEntry =
  (payTo: Address, amountAtomic: number): PaymentPolicy =>
  (_version, requirements) =>
    requirements.filter(
      (requirement) =>
        requirement.scheme === "exact" &&
        requirement.network === BASE_NETWORK &&
        isAddressEqual(requirement.asset as Address, BASE_USDC) &&
        isAddressEqual(requirement.payTo as Address, payTo) &&
        BigInt(requirement.amount) === BigInt(amountAtomic),
    );
