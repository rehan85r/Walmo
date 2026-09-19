import { MemWal } from "@mysten-incubation/memwal";

export default async function handler(req, res) {
  try {
    const memwal = MemWal.create({
      key: process.env.MEMWAL_PRIVATE_KEY,
      accountId: process.env.MEMWAL_ACCOUNT_ID,
      serverUrl:
        process.env.MEMWAL_SERVER_URL ||
        "https://relayer.memory.walrus.xyz",
      namespace: "walrus-mind"
    });

    const memory =
      "My name is Rehan and I am building Walrus Mind. I like Web3 and crypto.";

    console.log("Submitting memory...");

    const job = await memwal.remember(memory);

    console.log("Memory job accepted:", job.job_id);

    return res.status(200).json({
      success: true,
      message: "Memory job accepted by Walrus Memory.",
      job_id: job.job_id,
      status: job.status,
      memory
    });
  } catch (error) {
    console.error("Remember failed:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
      name: error.name
    });
  }
}
