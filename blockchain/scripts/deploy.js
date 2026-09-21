const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=".repeat(60));
  console.log("Deploying MedicalAccessControl smart contract");
  console.log("Deployer address:", deployer.address);
  console.log("Network:", hre.network.name);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");
  console.log("=".repeat(60));

  // Deploy the contract
  const MedicalAccessControl = await hre.ethers.getContractFactory(
    "MedicalAccessControl"
  );
  console.log("Deploying...");
  const contract = await MedicalAccessControl.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ MedicalAccessControl deployed to:", address);

  // Verify deployment
  const code = await hre.ethers.provider.getCode(address);
  console.log("Contract deployed with", code.length / 2, "bytes of bytecode");

  // Save deployment info for the Python backend
  const deployInfo = {
    contractAddress: address,
    deployerAddress: deployer.address,
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    deployedAt: new Date().toISOString(),
    // Hardhat default test account #0 — NEVER use these keys in production
    defaultPrivateKey:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    defaultWalletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    rpcUrl: "http://127.0.0.1:8545",
  };

  const outPath = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployInfo, null, 2));
  console.log("\n📄 Deployment info saved to:", outPath);

  // Print backend .env configuration
  console.log("\n" + "=".repeat(60));
  console.log("Add these to your backend .env file:");
  console.log("=".repeat(60));
  console.log("BLOCKCHAIN_PROVIDER=web3");
  console.log("BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545");
  console.log(`BLOCKCHAIN_CONTRACT_ADDRESS=${address}`);
  console.log(
    "BLOCKCHAIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  );
  console.log(
    "BLOCKCHAIN_WALLET_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  );
  console.log(
    "\n⚠️  NEVER use Hardhat default keys in staging or production environments!"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
