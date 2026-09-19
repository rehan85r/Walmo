import { MemWal } from "@mysten-incubation/memwal";

export default async function handler(req, res) {
  try {
    console.log("Starting Walrus Memory health test...");

    const memwal = MemWal.create({
      key: process.env.MEMWAL_PRIVATE_KEY,
      accountId: process.env.MEMWAL_ACCOUNT_ID,
      serverUrl:
        process.env.MEMWAL_SERVER_URL ||
        "https://relayer.memory.walrus.xyz",
      namespace: "walrus-mind"
    });

    console.log("MemWal client created.");

    const health = await memwal.health();

    console.log("Walrus Memory health:", health);

    return res.status(200).json({
      success: true,
      message: "Walrus Memory relayer is reachable.",
      health
    });
  } catch (error) {
    console.error("Walrus Memory test failed:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
      name: error.name
    });
  }
}
