import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DisputeKitShutterPoC = buildModule("DisputeKitShutterPoC", (m) => {
  const contract = m.contract("DisputeKitShutterPoC");
  return { contract };
});

export default DisputeKitShutterPoC;
