import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ShutterShieldedVoting = buildModule("ShutterShieldedVoting", (m) => {
  const contract = m.contract("ShutterShieldedVoting");
  return { contract };
});

export default ShutterShieldedVoting;
