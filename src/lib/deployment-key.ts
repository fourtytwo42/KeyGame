type DeploymentIdentity = {
  chainId: number;
  deploymentBlock: number;
  contracts: { manager: string };
};

export function deploymentKeyFor(manifest: DeploymentIdentity) {
  return [
    manifest.chainId,
    manifest.contracts.manager.toLowerCase(),
    manifest.deploymentBlock,
  ].join(":");
}
