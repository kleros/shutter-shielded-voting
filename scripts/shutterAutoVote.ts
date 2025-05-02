import { getContractAddress, createPublicClient, createWalletClient, http, Hex, getContract, Address, decodeEventLog } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { print } from "gluegun";
import { encrypt, decrypt, DECRYPTION_DELAY } from "./shutter";
import { abi as ShutterShieldedVotingAbi } from "../artifacts/contracts/ShutterShieldedVoting.sol/ShutterShieldedVoting.json";
import crypto from "crypto";

// Constants
const SEPARATOR = "␟"; // U+241F
const { bold } = print.colors;

// Store encrypted votes for later decryption
type EncryptedVote = {
  voter: Address;
  identity: Hex;
  encryptedVote: string;
  timestamp: number;
};

const encryptedVotes: EncryptedVote[] = [];

const MNEMONIC = "test test test test test test test test test test test junk";
const account = mnemonicToAccount(MNEMONIC);
const disputeKitAddress = getContractAddress({ from: account.address, nonce: 0n });

const transport = http();
const publicClient = createPublicClient({
  chain: hardhat,
  transport,
});

const walletClient = createWalletClient({
  account,
  chain: hardhat,
  transport,
});

const disputeKit = getContract({
  address: disputeKitAddress,
  abi: ShutterShieldedVotingAbi,
  client: { public: publicClient, wallet: walletClient },
});

type CommitCastEventArgs = {
  _voter: Address;
  _voteIDs: bigint[];
  _commit: Hex;
  _identity: Hex;
  _encryptedVote: string;
};

/**
 * Generate a random salt
 */
function generateSalt(): Hex {
  return ("0x" + crypto.randomBytes(32).toString("hex")) as Hex;
}

/**
 * Encodes vote parameters into a message string with separators
 */
function encode({ choice, salt, justification }: { choice: bigint; salt: Hex; justification: string }): string {
  return `${choice}${SEPARATOR}${salt}${SEPARATOR}${justification}`;
}

/**
 * Decodes a message string into its component parts
 * @param message The message to decode
 * @returns Object containing the decoded components
 */
function decode(message: string) {
  const [choice, salt, justification] = message.split(SEPARATOR);
  return {
    choice: BigInt(choice),
    salt,
    justification,
  };
}

/**
 * Cast a commit on-chain
 */
async function castCommit({
  voteIDs,
  choice,
  justification,
}: {
  voteIDs: bigint[];
  choice: bigint;
  justification: string;
}) {
  try {
    // Generate salt first
    const salt = generateSalt();

    // Encode the vote parameters into a message
    const message = encode({
      choice,
      salt,
      justification,
    });

    // Encrypt the message using shutter.ts
    print.highlight(bold("\n🔐 Encrypting message"));
    const { encryptedCommitment: encryptedVote, identity } = await encrypt(message);

    // Compute hash using all vote IDs
    const commitHash = await disputeKit.read.hashVote([choice, salt, justification]);

    // Cast the commit on-chain
    print.highlight(bold("\n🔏 Casting commit onchain"));
    const txHash = await disputeKit.write.castCommit([
      voteIDs,
      commitHash,
      identity as Hex,
      encryptedVote,
    ]);

    // Wait for transaction to be mined
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Watch for CommitCast event
    const events = await disputeKit.getEvents.CommitCast();
    console.log("CommitCast event:", (events[0] as any).args);

    // Store encrypted vote for later decryption
    encryptedVotes.push({
      voter: account.address,
      identity: identity as Hex,
      encryptedVote,
      timestamp: Math.floor(Date.now() / 1000),
    });

    return { commitHash, identity, salt };
  } catch (error) {
    console.error("Error in castCommit:", error);
    throw error;
  }
}

/**
 * Continuously monitor for votes ready to be decrypted and cast
 */
export async function autoVote() {
  while (true) {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const sleep = DECRYPTION_DELAY + 10;

      // Find votes ready for decryption
      const readyVotes = encryptedVotes.filter((vote) => currentTime - vote.timestamp >= sleep);

      for (const vote of readyVotes) {
        try {
          print.highlight(bold("\n🔐 Retrieving CommitCast event"));
          const filter = await publicClient.createContractEventFilter({
            abi: ShutterShieldedVotingAbi,
            eventName: "CommitCast",
            args: [vote.voter],
          });
          let events = await publicClient.getLogs(filter);
          if (events.length !== 1) {
            throw new Error("No CommitCast event found");
          }
          const { args } = decodeEventLog({
            abi: ShutterShieldedVotingAbi,
            eventName: "CommitCast",
            topics: events[0].topics,
            data: events[0].data,
          });
          const commitCast = args as unknown as CommitCastEventArgs; // Workaround getLogs type inference issue

          print.highlight(bold("\n🔓 Decrypting vote"));
          const decryptedMessage = await decrypt(commitCast._encryptedVote, commitCast._identity);

          // Decode the decrypted message
          const { choice, salt, justification } = decode(decryptedMessage);

          print.highlight(bold("\n🗳️ Casting vote onchain"));
          const txHash = await disputeKit.write.castVote([
            commitCast._voteIDs,
            choice,
            salt,
            justification,
          ]);

          // Wait for transaction to be mined
          await publicClient.waitForTransactionReceipt({ hash: txHash });

          // Watch for VoteCast event
          events = await disputeKit.getEvents.VoteCast();
          console.log("VoteCast event:", (events[0] as any).args);

          // Remove the processed vote
          const index = encryptedVotes.indexOf(vote);
          if (index > -1) encryptedVotes.splice(index, 1);
        } catch (error) {
          console.error(`Error processing vote for identity ${vote.identity}:`, error);
        }
      }

      // If there are no more encrypted votes to process, exit the loop
      if (encryptedVotes.length === 0) {
        console.log("No more encrypted votes to process. Exiting auto vote loop.");
        break;
      }
      const spinner = print.spin(`Waiting for the decryption key to be released... (${sleep}s)`);
      for (let i = sleep; i > 0; i--) {
        spinner.text = `Waiting for the decryption key to be released... (${i}s)`;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      spinner.succeed("Decryption key released, resuming...");
    } catch (error) {
      console.error("Error in autoVote loop:", error);
      // Continue the loop even if there's an error
    }
  }
}

// Main function to start the auto voting process
async function main() {
  try {
    // Cast an encrypted commit
    await castCommit({
      voteIDs: [0n, 1n, 2n],
      choice: 2n,
      justification: "This is my vote justification",
    });

    // Start the auto voting process
    await autoVote();
  } catch (error) {
    console.error("Error in main:", error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}
