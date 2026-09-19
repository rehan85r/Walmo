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

    console.log("Checking Walrus Memory...");

    const health = await memwal.health();

    const memoryText =
      "My name is Rehan and I am building Walrus Mind. I like Web3 and crypto.";

    const job = await memwal.remember(memoryText);

    await memwal.waitForRememberJob(job.job_id);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const result = await memwal.recall({
      query: "What is the user's name and what does the user like?",
      limit: 5
    });

    return res.status(200).json({
      success: true,
      message: "Walrus Mind memory test successful!",
      health: health,
      remembered: memoryText,
      recalled: result.results || []
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
