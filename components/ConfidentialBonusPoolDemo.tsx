"use client";

import { useFhevm } from "../fhevm/useFhevm";
import { useInMemoryStorage } from "../hooks/useInMemoryStorage";
import { useMetaMaskEthersSigner } from "../hooks/metamask/useMetaMaskEthersSigner";
import { useConfidentialBonusPool } from "@/hooks/useConfidentialBonusPool";
import { errorNotDeployed } from "./ErrorNotDeployed";
import { useState } from "react";
import { ethers } from "ethers";

export const ConfidentialBonusPoolDemo = () => {
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();
  const {
    provider,
    chainId,
    accounts,
    isConnected,
    connect,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
    initialMockChains,
  } = useMetaMaskEthersSigner();

  const { instance: fhevmInstance } = useFhevm({
    provider,
    chainId,
    initialMockChains,
    enabled: true,
  });

  const {
    contractAddress,
    canGetState,
    canFund,
    canCommit,
    canWithdrawBonus,
    canWithdrawRemaining,
    fundPool,
    commitPerformance,
    withdrawBonus,
    withdrawRemaining,
    refreshState,
    message,
    manager,
    actualPool,
    isManager,
    myEmployeeInfo,
    employeeList,
    isFunding,
    isCommitting,
    isWithdrawingBonus,
    isWithdrawingRemaining,
    isDeployed,
  } = useConfidentialBonusPool({
    instance: fhevmInstance,
    fhevmDecryptionSignatureStorage,
    eip1193Provider: provider,
    chainId,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
  });

  const [fundAmount, setFundAmount] = useState<number>(1000000000000000); // 0.001 ETH in wei
  const [performanceScore, setPerformanceScore] = useState<number>(80); // 0-100
  const [role, setRole] = useState<number>(1); // Intern=1, Junior=2, etc.

  const buttonClass =
    "inline-flex items-center justify-center rounded-xl bg-black px-4 py-4 font-semibold text-white shadow-sm " +
    "transition-colors duration-200 hover:bg-blue-700 active:bg-blue-800 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
    "disabled:opacity-50 disabled:pointer-events-none";

  const titleClass = "font-semibold text-black text-lg mt-4";

  if (!isConnected) {
    return (
      <div className="mx-auto">
        <button className={buttonClass} disabled={isConnected} onClick={connect}>
          <span className="text-4xl p-6">Connect to MetaMask</span>
        </button>
      </div>
    );
  }

  if (isDeployed === false) {
    return errorNotDeployed(chainId);
  }

  const roleNames = ["None", "Intern", "Junior", "Mid", "Senior", "Lead"];

  return (
    <div className="grid w-full gap-4">
      <div className="col-span-full mx-20 bg-black text-white">
        <p className="font-semibold text-3xl m-5">
          FHEVM React Minimal Template -{" "}
          <span className="font-mono font-normal text-gray-400">ConfidentialBonusPool.sol</span>
        </p>
      </div>
      <div className="col-span-full mx-20 mt-4 px-5 pb-4 rounded-lg bg-white border-2 border-black">
        <p className={titleClass}>Chain Infos</p>
        {printProperty("ChainId", chainId)}
        {printProperty(
          "Metamask accounts",
          accounts
            ? accounts.length === 0
              ? "No accounts"
              : `{ length: ${accounts.length}, [${accounts[0]}, ...] }`
            : "undefined",
        )}
        {printProperty("ConfidentialBonusPool", contractAddress)}
        {printProperty("isDeployed", isDeployed)}
        {printProperty("Is Manager", isManager)}
      </div>
      <div className="col-span-full mx-20 px-4 pb-4 rounded-lg bg-white border-2 border-black">
        <p className={titleClass}>Bonus Pool State</p>
        {printProperty("Manager", manager)}
        {printProperty("Actual Pool", `${ethers.formatEther(actualPool)} ETH`)}
        {printProperty("My Role", roleNames[myEmployeeInfo.role] || "None")}
        {printProperty("Has Committed", myEmployeeInfo.hasCommitted)}
        {printProperty("Has Withdrawn", myEmployeeInfo.hasWithdrawn)}
        {printProperty("Decrypted Bonus", `${ethers.formatEther(myEmployeeInfo.decryptedBonus)} ETH`)}
        {isManager && printProperty("Employee List", employeeList.join(", "))}
      </div>
      <div className="grid grid-cols-3 mx-20 gap-4">
        <button
          className={buttonClass}
          disabled={!canGetState}
          onClick={refreshState}
        >
          {canGetState ? "Refresh State" : "Contract is not available"}
        </button>
        {isManager && (
          <div>
            <label>Fund Amount (wei):</label>
            <input
              type="number"
              placeholder="Fund Amount"
              value={fundAmount}
              onChange={(e) => setFundAmount(Number(e.target.value))}
              className="border-2 border-black p-2 rounded mb-2 w-full"
              disabled={!canFund}
              min="1"
            />
            <button
              className={buttonClass}
              disabled={!canFund || fundAmount <= 0}
              onClick={() => fundPool(fundAmount)}
            >
              {canFund ? "Fund Pool" : isFunding ? "Funding..." : "Cannot fund"}
            </button>
          </div>
        )}
        {!isManager && (
          <div>
            <label>Performance Score (0-100):</label>
            <input
              type="number"
              placeholder="Score"
              value={performanceScore}
              onChange={(e) => setPerformanceScore(Number(e.target.value))}
              className="border-2 border-black p-2 rounded mb-2 w-full"
              disabled={!canCommit}
              min="0"
              max="100"
            />
            <label>Role:</label>
            <select
              value={role}
              onChange={(e) => setRole(Number(e.target.value))}
              className="border-2 border-black p-2 rounded mb-2 w-full"
              disabled={!canCommit}
            >
              <option value={1}>Intern</option>
              <option value={2}>Junior</option>
              <option value={3}>Mid</option>
              <option value={4}>Senior</option>
              <option value={5}>Lead</option>
            </select>
            <button
              className={buttonClass}
              disabled={!canCommit || performanceScore < 0 || performanceScore > 100}
              onClick={() => commitPerformance(performanceScore, role)}
            >
              {canCommit ? "Commit Performance" : isCommitting ? "Committing..." : "Cannot commit"}
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 mx-20 gap-4">
        {!isManager && (
          <button
            className={buttonClass}
            disabled={!canWithdrawBonus}
            onClick={withdrawBonus}
          >
            {canWithdrawBonus ? "Withdraw Bonus" : isWithdrawingBonus ? "Withdrawing..." : "Cannot withdraw bonus"}
          </button>
        )}
        {isManager && (
          <button
            className={buttonClass}
            disabled={!canWithdrawRemaining}
            onClick={withdrawRemaining}
          >
            {canWithdrawRemaining ? "Withdraw Remaining" : isWithdrawingRemaining ? "Withdrawing..." : "Cannot withdraw remaining"}
          </button>
        )}
      </div>
      <div className="col-span-full mx-20 p-4 rounded-lg bg-white border-2 border-black">
        {printProperty("Message", message)}
      </div>
    </div>
  );
};

function printProperty(name: string, value: unknown) {
  let displayValue: string;

  if (typeof value === "boolean") {
    return printBooleanProperty(name, value);
  } else if (typeof value === "string" || typeof value === "number") {
    displayValue = String(value);
  } else if (typeof value === "bigint") {
    displayValue = String(value);
  } else if (value === null) {
    displayValue = "null";
  } else if (value === undefined) {
    displayValue = "undefined";
  } else if (value instanceof Error) {
    displayValue = value.message;
  } else {
    displayValue = JSON.stringify(value);
  }
  return (
    <p className="text-black">
      {name}: <span className="font-mono font-semibold text-black">{displayValue}</span>
    </p>
  );
}

function printBooleanProperty(name: string, value: boolean) {
  if (value) {
    return (
      <p className="text-black">
        {name}: <span className="font-mono font-semibold text-green-500">true</span>
      </p>
    );
  }

  return (
    <p className="text-black">
      {name}: <span className="font-mono font-semibold text-red-500">false</span>
    </p>
  );
}
