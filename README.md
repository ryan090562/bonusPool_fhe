🧩 Confidential Bonus Pool
📘 Description

ConfidentialBonusPool is a smart contract powered by Fully Homomorphic Encryption (FHE) that manages and distributes monthly employee bonuses securely.
All performance scores are encrypted before being stored on-chain, ensuring complete privacy — even the manager cannot see the raw data.

⚙️ Key Features

🏦 Manager:

Deposits the bonus pool and sets reward percentages for each role (Intern, Junior, Mid, Senior, Lead).

Starts and finalizes the distribution round.

👤 Employees:

Submit encrypted performance scores.

Receive automatically calculated rewards based on encrypted data.

🔐 FHE Integration:

All operations and calculations are performed directly on encrypted data.

Only final results (like total bonuses) are decrypted when necessary.

🖥️ How to Run the Frontend

Install dependencies:

yarn install
# or
npm install


Configure FHEVM Network (e.g., Zama Sepolia):

Connect your MetaMask wallet to an FHEVM-compatible testnet.

Update the contract address in ConfidentialBonusPoolAddresses.ts.

Start the application:

yarn start
# or
npm start


Access the app:
Open http://localhost:3000
 in your browser.

🧠 Summary

This project demonstrates a real-world use case of FHE on blockchain — secure and private bonus distribution.
It ensures fair, transparent, and privacy-preserving performance evaluation between managers and employees.
