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

    console.log("Recalling Walrus Mind memory...");

    const result = await memwal.recall({
      query: "What is the user's name and what does the user like?",
      limit: 5
    });

    console.log("Recall completed.");

    return res.status(200).json({
      success: true,
      message: "Memory recall completed.",
      memories: result.results || []
    });
  } catch (error) {
    console.error("Recall failed:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
      name: error.name
    });
  }
}
