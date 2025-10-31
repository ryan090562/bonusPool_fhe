// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Confidential Monthly Bonus Distribution (FHE-based)
/// @notice Manage confidential monthly bonus distribution: hidden performance points, automatic bonus calculated in FHE
/// @dev Use fhEVM to protect scores, only known to the enterer
contract ConfidentialBonusPool is SepoliaConfig {
    address public immutable manager;
    uint256 public actualPool;   
    euint64 public encryptedPool;       

    // === ROLES & PERCENTAGES ===
    enum Role { None, Intern, Junior, Mid, Senior, Lead }
    mapping(Role => uint64) public rolePercentage; // % bonus (basis points: 100 = 1%)

    // === EMPLOYEE DATA ===
    struct Employee {
        euint64 performance;     // point (0-100)
        Role role;              
        bool hasWithdrawn;       
        bool hasCommitted;       
        uint64 decryptedBonus;  
    }

    mapping(address => Employee) public employees;
    address[] public employeeList;

    // === DECRYPTION TRACKING ===
    mapping(uint256 => address) private requestToEmployee;
    uint256 private decryptionRequestIdPool;   
    uint256 private decryptionRequestIdBonus;

    // === REENTRANCY GUARD ===
    uint256 private _status;

    // === EVENTS ===
    event PoolFunded(address indexed manager, uint256 amount, uint256 requestId);
    event PerformanceCommitted(address indexed employee, Role role);
    event BonusWithdrawn(address indexed employee, uint64 bonus);
    event RemainingWithdrawn(address indexed manager, uint64 amount);
    event BonusCalculated(uint256 requestId, address employee);

    // === MODIFIER ===
    modifier onlyManager() {
        require(msg.sender == manager, "Only manager");
        _;
    }

    modifier nonReentrant() {
        require(_status == 0, "Reentrancy");
        _status = 1;
        _;
        _status = 0;
    }

    constructor() {
        manager = msg.sender;
        encryptedPool = FHE.asEuint64(0);

        // Default role percentages (in basis points: 100 = 1%)
        rolePercentage[Role.Intern] = 200;   // 2.0%
        rolePercentage[Role.Junior] = 500;   // 5.0%
        rolePercentage[Role.Mid]    = 800;   // 8.0%
        rolePercentage[Role.Senior] = 1200;  // 12.0%
        rolePercentage[Role.Lead]   = 2000;  // 20.0%

        FHE.allowThis(encryptedPool);
    }

    // Allow contract to receive ETH
    receive() external payable {}

    // =============================================================
    // === 1. MANAGER: FUND THE BONUS POOL (PUBLIC + ENCRYPTED) ===
    // =============================================================
    function fundPool(
        externalEuint64 encryptedAmount,
        bytes calldata proof
    ) external payable onlyManager {
        require(msg.value > 0, "Must send ETH");

        actualPool += msg.value;
        encryptedPool = FHE.add(encryptedPool, FHE.fromExternal(encryptedAmount, proof));
        FHE.allowThis(encryptedPool);

        // Verify encrypted amount matches msg.value
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(FHE.fromExternal(encryptedAmount, proof));
        uint256 requestId = FHE.requestDecryption(cts, this.callbackVerifyPool.selector);
        decryptionRequestIdPool = requestId;

        emit PoolFunded(manager, msg.value, requestId);
    }

    function callbackVerifyPool(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) external {
        FHE.checkSignatures(requestId, cleartexts, proof);
        require(requestId == decryptionRequestIdPool, "Invalid request ID");
        uint64 decrypted = abi.decode(cleartexts, (uint64));
        require(uint256(decrypted) == actualPool, "Encrypted pool mismatch");
        decryptionRequestIdPool = 0;
    }

    // =============================================================
    // === 2. EMPLOYEE: COMMIT PERFORMANCE + ROLE ===
    // =============================================================
    function commitPerformance(
        externalEuint64 encryptedScore,
        bytes calldata proof,
        Role role
    ) external {
        require(role != Role.None, "Invalid role");
        require(!employees[msg.sender].hasWithdrawn, "Already withdrawn");
        require(FHE.isInitialized(encryptedPool), "Pool not funded");
        require(!employees[msg.sender].hasCommitted, "Already committed performance");

        euint64 score = FHE.fromExternal(encryptedScore, proof);

        employees[msg.sender] = Employee({
            performance: score,
            role: role,
            hasWithdrawn: false,
            hasCommitted: true,
            decryptedBonus: 0
        });

        employeeList.push(msg.sender);

        FHE.allowThis(employees[msg.sender].performance);
        emit PerformanceCommitted(msg.sender, role);
    }

    // =============================================================
    // === 3. EMPLOYEE: WITHDRAW BONUS (FHE CALCULATION) ===
    // =============================================================
    function withdrawBonus() external {
        Employee storage emp = employees[msg.sender];
        require(emp.hasCommitted, "No performance committed");
        require(!emp.hasWithdrawn, "Already withdrawn");

        emp.hasWithdrawn = true;

        euint64 rolePct = FHE.asEuint64(rolePercentage[emp.role]);
        euint64 weightedPerf = FHE.div(FHE.mul(emp.performance, rolePct), 100);
        euint64 bonus = FHE.div(FHE.mul(weightedPerf, encryptedPool), 10000);

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(bonus);
        uint256 requestId = FHE.requestDecryption(cts, this.callbackPayBonus.selector);
        requestToEmployee[requestId] = msg.sender;
        decryptionRequestIdBonus = requestId;

        emit BonusCalculated(requestId, msg.sender);
    }

    function callbackPayBonus(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) external nonReentrant {
        FHE.checkSignatures(requestId, cleartexts, proof);
        address employee = requestToEmployee[requestId];
        require(employee != address(0), "Invalid employee");

        uint64 bonus = abi.decode(cleartexts, (uint64));
        require(bonus > 0, "Bonus zero");
        require(bonus <= actualPool, "Insufficient pool funds");

        // 1. update encryptedPool before
        encryptedPool = FHE.sub(encryptedPool, FHE.asEuint64(bonus));
        FHE.allowThis(encryptedPool);

        // 2. update actualPool after
        actualPool -= bonus;

        // 3. send ETH
        (bool sent, ) = payable(employee).call{value: bonus}("");
        require(sent, "Failed to send ETH");

        // 4. update state
        employees[employee].decryptedBonus = bonus;

        delete requestToEmployee[requestId];
        emit BonusWithdrawn(employee, bonus);
    }

    // =============================================================
    // === 4. MANAGER: WITHDRAW REMAINING FUNDS ===
    // =============================================================
    function withdrawRemaining() external onlyManager {
        require(actualPool > 0, "No remaining funds");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedPool);
        uint256 requestId = FHE.requestDecryption(cts, this.callbackWithdrawRemaining.selector);
        decryptionRequestIdPool = requestId;
    }

    function callbackWithdrawRemaining(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) external nonReentrant {
        FHE.checkSignatures(requestId, cleartexts, proof);
        require(requestId == decryptionRequestIdPool, "Invalid request ID");

        uint64 remaining = abi.decode(cleartexts, (uint64));
        require(remaining <= actualPool, "Pool mismatch");
        require(remaining > 0, "Nothing to withdraw");

        uint256 amount = actualPool;
        actualPool = 0;
        encryptedPool = FHE.asEuint64(0);
        FHE.allowThis(encryptedPool);
        decryptionRequestIdPool = 0;

        (bool sent, ) = payable(manager).call{value: amount}("");
        require(sent, "Failed to send ETH");

        emit RemainingWithdrawn(manager, uint64(amount));
    }

    // =============================================================
    // === VIEW FUNCTIONS ===
    // =============================================================
    function getEmployeeInfo(address emp) external view returns (
        Role role,
        bool hasCommitted,
        bool hasWithdrawn,
        uint64 decryptedBonus
    ) {
        Employee memory e = employees[emp];
        return (e.role, e.hasCommitted, e.hasWithdrawn, e.decryptedBonus);
    }

    function getEmployeeCount() external view returns (uint256) {
        return employeeList.length;
    }

    function getEmployeeAt(uint256 index) external view returns (address) {
        require(index < employeeList.length, "Index out of bounds");
        return employeeList[index];
    }
}