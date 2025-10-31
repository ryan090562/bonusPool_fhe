"use client";

import { ethers } from "ethers";
import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FhevmInstance } from "@/fhevm/fhevmTypes";
import { GenericStringStorage } from "@/fhevm/GenericStringStorage";
import { ConfidentialBonusPoolAddresses } from "@/abi/ConfidentialBonusPoolAddresses";
import { ConfidentialBonusPoolABI } from "@/abi/ConfidentialBonusPoolABI";

type ConfidentialBonusPoolInfoType = {
  abi: typeof ConfidentialBonusPoolABI.abi;
  address?: `0x${string}`;
  chainId?: number;
  chainName?: string;
};

function getConfidentialBonusPoolByChainId(chainId: number | undefined): ConfidentialBonusPoolInfoType {
  if (!chainId) {
    return { abi: ConfidentialBonusPoolABI.abi };
  }

  const chainIdStr = chainId.toString() as keyof typeof ConfidentialBonusPoolAddresses;
  const entry = ConfidentialBonusPoolAddresses[chainIdStr];

  if (!entry || !("address" in entry) || entry.address === ethers.ZeroAddress) {
    return { abi: ConfidentialBonusPoolABI.abi, chainId };
  }

  return {
    address: entry?.address as `0x${string}` | undefined,
    chainId: entry?.chainId ?? chainId,
    chainName: entry?.chainName,
    abi: ConfidentialBonusPoolABI.abi,
  };
}

export const useConfidentialBonusPool = (parameters: {
  instance: FhevmInstance | undefined;
  fhevmDecryptionSignatureStorage: GenericStringStorage;
  eip1193Provider: ethers.Eip1193Provider | undefined;
  chainId: number | undefined;
  ethersSigner: ethers.JsonRpcSigner | undefined;
  ethersReadonlyProvider: ethers.ContractRunner | undefined;
  sameChain: RefObject<(chainId: number | undefined) => boolean>;
  sameSigner: RefObject<(ethersSigner: ethers.JsonRpcSigner | undefined) => boolean>;
}) => {
  const {
    instance,
    fhevmDecryptionSignatureStorage,
    eip1193Provider,
    chainId,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
  } = parameters;

  // States and Refs
  const [manager, setManager] = useState<string>(ethers.ZeroAddress);
  const [actualPool, setActualPool] = useState<string>("0");
  const [isManager, setIsManager] = useState<boolean>(false);
  const [myEmployeeInfo, setMyEmployeeInfo] = useState<{
    role: number;
    hasCommitted: boolean;
    hasWithdrawn: boolean;
    decryptedBonus: string;
  }>({ role: 0, hasCommitted: false, hasWithdrawn: false, decryptedBonus: "0" });
  const [employeeList, setEmployeeList] = useState<string[]>([]);
  const [message, setMessage] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isFunding, setIsFunding] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [isWithdrawingBonus, setIsWithdrawingBonus] = useState<boolean>(false);
  const [isWithdrawingRemaining, setIsWithdrawingRemaining] = useState<boolean>(false);

  const confidentialBonusPoolRef = useRef<ConfidentialBonusPoolInfoType | undefined>(undefined);
  const isRefreshingRef = useRef<boolean>(isRefreshing);
  const isFundingRef = useRef<boolean>(isFunding);
  const isCommittingRef = useRef<boolean>(isCommitting);
  const isWithdrawingBonusRef = useRef<boolean>(isWithdrawingBonus);
  const isWithdrawingRemainingRef = useRef<boolean>(isWithdrawingRemaining);

  // Contract
  const confidentialBonusPool = useMemo(() => {
    const c = getConfidentialBonusPoolByChainId(chainId);
    confidentialBonusPoolRef.current = c;
    if (!c.address) {
      setMessage(`ConfidentialBonusPool deployment not found for chainId=${chainId}.`);
    }
    return c;
  }, [chainId]);

  const isDeployed = useMemo(() => {
    if (!confidentialBonusPool) return undefined;
    return Boolean(confidentialBonusPool.address) && confidentialBonusPool.address !== ethers.ZeroAddress;
  }, [confidentialBonusPool]);

  const canGetState = useMemo(() => {
    return confidentialBonusPool.address && ethersReadonlyProvider && eip1193Provider && !isRefreshing;
  }, [confidentialBonusPool.address, ethersReadonlyProvider, eip1193Provider, isRefreshing]);

  const canFund = useMemo(() => {
    return confidentialBonusPool.address && instance && ethersSigner && isManager && !isRefreshing && !isFunding;
  }, [confidentialBonusPool.address, instance, ethersSigner, isManager, isRefreshing, isFunding]);

  const canCommit = useMemo(() => {
    return confidentialBonusPool.address && instance && ethersSigner && !isManager && !myEmployeeInfo.hasCommitted && !isRefreshing && !isCommitting;
  }, [confidentialBonusPool.address, instance, ethersSigner, isManager, myEmployeeInfo.hasCommitted, isRefreshing, isCommitting]);

  const canWithdrawBonus = useMemo(() => {
    return confidentialBonusPool.address && ethersSigner && !isManager && myEmployeeInfo.hasCommitted && !myEmployeeInfo.hasWithdrawn && !isRefreshing && !isWithdrawingBonus;
  }, [confidentialBonusPool.address, ethersSigner, isManager, myEmployeeInfo.hasCommitted, myEmployeeInfo.hasWithdrawn, isRefreshing, isWithdrawingBonus]);

  const canWithdrawRemaining = useMemo(() => {
    return confidentialBonusPool.address && ethersSigner && isManager && Number(actualPool) > 0 && !isRefreshing && !isWithdrawingRemaining;
  }, [confidentialBonusPool.address, ethersSigner, isManager, actualPool, isRefreshing, isWithdrawingRemaining]);

  // Refresh State
  const refreshState = useCallback(async () => {
    if (isRefreshingRef.current) {
      setMessage("Refresh already in progress...");
      return;
    }

    if (
      !confidentialBonusPoolRef.current ||
      !confidentialBonusPoolRef.current?.chainId ||
      !confidentialBonusPoolRef.current?.address ||
      !ethersReadonlyProvider ||
      !ethersSigner ||
      !eip1193Provider
    ) {
      setMessage("Missing required parameters for refresh");
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    setMessage("Refreshing state...");

    const thisChainId = confidentialBonusPoolRef.current.chainId;
    const thisContractAddress = confidentialBonusPoolRef.current.address;

    const contract = new ethers.Contract(
      thisContractAddress,
      confidentialBonusPoolRef.current.abi,
      ethersReadonlyProvider,
    );

    try {
      const userAddress = await ethersSigner.getAddress();

      setManager(await contract.manager());
      setIsManager((await contract.manager()).toLowerCase() === userAddress.toLowerCase());
      setActualPool((await contract.actualPool()).toString());

      const info = await contract.getEmployeeInfo(userAddress);
      setMyEmployeeInfo({
        role: Number(info.role),
        hasCommitted: info.hasCommitted,
        hasWithdrawn: info.hasWithdrawn,
        decryptedBonus: info.decryptedBonus.toString(),
      });

      // Get employee list (if manager)
      if (isManager) {
        const count = await contract.getEmployeeCount();
        const list: string[] = [];
        for (let i = 0; i < count; i++) {
          list.push(await contract.getEmployeeAt(i));
        }
        setEmployeeList(list);
      }

      if (sameChain.current(thisChainId) && thisContractAddress === confidentialBonusPoolRef.current?.address) {
        setMessage("State refreshed successfully");
      }
    } catch (e) {
      setMessage(`State refresh failed: ${(e as Error).message}`);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
      setTimeout(() => setMessage(""), 3000);
    }
  }, [ethersReadonlyProvider, eip1193Provider, ethersSigner, sameChain, isManager]);

  // Auto refresh on mount
  useEffect(() => {
    refreshState();
  }, [refreshState]);

  // Listen for Events
  useEffect(() => {
    if (!confidentialBonusPool.address || !ethersReadonlyProvider) return;

    const contract = new ethers.Contract(
      confidentialBonusPool.address,
      confidentialBonusPool.abi,
      ethersReadonlyProvider,
    );

    const userAddress = ethersSigner ? ethersSigner.address.toLowerCase() : undefined;

    if (userAddress) {
      contract.on("PoolFunded", async (mgr, amount, requestId) => {
        if (mgr.toLowerCase() === userAddress) {
          setMessage(`Pool funded with ${ethers.formatEther(amount)} ETH`);
          await refreshState();
        }
      });

      contract.on("PerformanceCommitted", async (employee, role) => {
        if (employee.toLowerCase() === userAddress) {
          setMessage(`Performance committed for role ${role}`);
          await refreshState();
        }
      });

      contract.on("BonusWithdrawn", async (employee, bonus) => {
        if (employee.toLowerCase() === userAddress) {
          setMessage(`Bonus withdrawn: ${ethers.formatEther(bonus)} ETH`);
          await refreshState();
        }
      });

      contract.on("RemainingWithdrawn", async (mgr, amount) => {
        if (mgr.toLowerCase() === userAddress) {
          setMessage(`Remaining withdrawn: ${ethers.formatEther(amount)} ETH`);
          await refreshState();
        }
      });
    }

    return () => {
      contract.removeAllListeners();
    };
  }, [confidentialBonusPool.address, ethersReadonlyProvider, ethersSigner, refreshState]);

  // Fund Pool
  const fundPool = useCallback(
    async (amount: number) => {
      if (isRefreshingRef.current || isFundingRef.current) {
        setMessage("Funding already in progress...");
        return;
      }

      if (!confidentialBonusPool.address || !ethersSigner || !instance || amount > Number.MAX_SAFE_INTEGER || amount <= 0) {
        setMessage("Invalid or missing parameters for fund pool");
        return;
      }

      const thisChainId = chainId;
      const thisContractAddress = confidentialBonusPool.address;
      const thisEthersSigner = ethersSigner;
      const contract = new ethers.Contract(
        thisContractAddress,
        confidentialBonusPool.abi,
        thisEthersSigner,
      );

      isFundingRef.current = true;
      setIsFunding(true);
      setMessage("Preparing to fund pool...");

      const isStale = () =>
        thisContractAddress !== confidentialBonusPoolRef.current?.address ||
        !sameChain.current(thisChainId) ||
        !sameSigner.current(thisEthersSigner);

      try {
        setMessage("Encrypting fund amount...");
        const enc = await instance.createEncryptedInput(thisContractAddress, ethersSigner.address).add64(amount).encrypt();
        setMessage(`Sending fund transaction for ${ethers.formatEther(amount)} ETH...`);
        const tx = await contract.fundPool(enc.handles[0], enc.inputProof, { value: amount });
        setMessage(`Waiting for transaction ${tx.hash}...`);
        const receipt = await tx.wait();
        if (receipt?.status !== 1) {
          throw new Error("Transaction failed");
        }
        setMessage(`Pool funded with ${ethers.formatEther(amount)} ETH`);
        if (!isStale()) {
          await refreshState();
        }
      } catch (e) {
        setMessage(`Fund pool failed: ${(e as Error).message}`);
      } finally {
        isFundingRef.current = false;
        setIsFunding(false);
        setTimeout(() => setMessage(""), 5000);
      }
    },
    [confidentialBonusPool.address, ethersSigner, instance, chainId, refreshState, sameChain, sameSigner],
  );

  // Commit Performance
  const commitPerformance = useCallback(
    async (score: number, role: number) => {
      if (isRefreshingRef.current || isCommittingRef.current) {
        setMessage("Committing already in progress...");
        return;
      }

      if (!confidentialBonusPool.address || !ethersSigner || !instance || score <= 0 || role < 1 || role > 5) {
        setMessage("Invalid or missing parameters for commit performance");
        return;
      }

      const thisChainId = chainId;
      const thisContractAddress = confidentialBonusPool.address;
      const thisEthersSigner = ethersSigner;
      const contract = new ethers.Contract(
        thisContractAddress,
        confidentialBonusPool.abi,
        thisEthersSigner,
      );

      isCommittingRef.current = true;
      setIsCommitting(true);
      setMessage("Preparing to commit performance...");

      const isStale = () =>
        thisContractAddress !== confidentialBonusPoolRef.current?.address ||
        !sameChain.current(thisChainId) ||
        !sameSigner.current(thisEthersSigner);

      try {
        setMessage("Encrypting performance score...");
        const enc = await instance.createEncryptedInput(thisContractAddress, ethersSigner.address).add64(score).encrypt();
        setMessage("Sending commit transaction...");
        const tx = await contract.commitPerformance(enc.handles[0], enc.inputProof, role);
        setMessage(`Waiting for transaction ${tx.hash}...`);
        const receipt = await tx.wait();
        if (receipt?.status !== 1) {
          throw new Error("Transaction failed");
        }
        setMessage("Performance committed successfully");
        if (!isStale()) {
          await refreshState();
        }
      } catch (e) {
        setMessage(`Commit performance failed: ${(e as Error).message}`);
      } finally {
        isCommittingRef.current = false;
        setIsCommitting(false);
        setTimeout(() => setMessage(""), 5000);
      }
    },
    [confidentialBonusPool.address, ethersSigner, instance, chainId, refreshState, sameChain, sameSigner],
  );

  // Withdraw Bonus
  const withdrawBonus = useCallback(
    async () => {
      if (isRefreshingRef.current || isWithdrawingBonusRef.current) {
        setMessage("Withdrawing bonus already in progress...");
        return;
      }

      if (!confidentialBonusPool.address || !ethersSigner) {
        setMessage("Missing parameters for withdraw bonus");
        return;
      }

      const thisChainId = chainId;
      const thisContractAddress = confidentialBonusPool.address;
      const thisEthersSigner = ethersSigner;
      const contract = new ethers.Contract(
        thisContractAddress,
        confidentialBonusPool.abi,
        thisEthersSigner,
      );

      isWithdrawingBonusRef.current = true;
      setIsWithdrawingBonus(true);
      setMessage("Preparing to withdraw bonus...");

      const isStale = () =>
        thisContractAddress !== confidentialBonusPoolRef.current?.address ||
        !sameChain.current(thisChainId) ||
        !sameSigner.current(thisEthersSigner);

      try {
        setMessage("Sending withdraw bonus transaction...");
        const tx = await contract.withdrawBonus();
        setMessage(`Waiting for transaction ${tx.hash}...`);
        const receipt = await tx.wait();
        if (receipt?.status !== 1) {
          throw new Error("Transaction failed");
        }
        setMessage("Bonus withdrawn successfully");
        if (!isStale()) {
          await refreshState();
        }
      } catch (e) {
        setMessage(`Withdraw bonus failed: ${(e as Error).message}`);
      } finally {
        isWithdrawingBonusRef.current = false;
        setIsWithdrawingBonus(false);
        setTimeout(() => setMessage(""), 5000);
      }
    },
    [confidentialBonusPool.address, ethersSigner, chainId, refreshState, sameChain, sameSigner],
  );

  // Withdraw Remaining
  const withdrawRemaining = useCallback(
    async () => {
      if (isRefreshingRef.current || isWithdrawingRemainingRef.current) {
        setMessage("Withdrawing remaining already in progress...");
        return;
      }

      if (!confidentialBonusPool.address || !ethersSigner) {
        setMessage("Missing parameters for withdraw remaining");
        return;
      }

      const thisChainId = chainId;
      const thisContractAddress = confidentialBonusPool.address;
      const thisEthersSigner = ethersSigner;
      const contract = new ethers.Contract(
        thisContractAddress,
        confidentialBonusPool.abi,
        thisEthersSigner,
      );

      isWithdrawingRemainingRef.current = true;
      setIsWithdrawingRemaining(true);
      setMessage("Preparing to withdraw remaining...");

      const isStale = () =>
        thisContractAddress !== confidentialBonusPoolRef.current?.address ||
        !sameChain.current(thisChainId) ||
        !sameSigner.current(thisEthersSigner);

      try {
        setMessage("Sending withdraw remaining transaction...");
        const tx = await contract.withdrawRemaining();
        setMessage(`Waiting for transaction ${tx.hash}...`);
        const receipt = await tx.wait();
        if (receipt?.status !== 1) {
          throw new Error("Transaction failed");
        }
        setMessage("Remaining withdrawn successfully");
        if (!isStale()) {
          await refreshState();
        }
      } catch (e) {
        setMessage(`Withdraw remaining failed: ${(e as Error).message}`);
      } finally {
        isWithdrawingRemainingRef.current = false;
        setIsWithdrawingRemaining(false);
        setTimeout(() => setMessage(""), 5000);
      }
    },
    [confidentialBonusPool.address, ethersSigner, chainId, refreshState, sameChain, sameSigner],
  );

  return {
    contractAddress: confidentialBonusPool.address,
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
    isRefreshing,
    isFunding,
    isCommitting,
    isWithdrawingBonus,
    isWithdrawingRemaining,
    isDeployed,
  };
};