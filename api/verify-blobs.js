import { MemWal } from "@mysten-incubation/memwal";

export default async function handler(req, res) {
  try {
    const namespace =
      req.query?.namespace ||
      "walmo-anon_4968fc26645a4a109ece976f972829e8";

    const memwal = MemWal.create({
      key: process.env.MEMWAL_PRIVATE_KEY,
      accountId: process.env.MEMWAL_ACCOUNT_ID,
      serverUrl:
        process.env.MEMWAL_SERVER_URL ||
        "https://relayer.memory.walrus.xyz",
      namespace
    });

    const result = await memwal.restore(
      namespace,
      100
    );

    console.log("Walrus Memory verification:", {
      namespace,
      total: result.total,
      restored: result.restored,
      skipped: result.skipped,
      owner: result.owner
    });

    return res.status(200).json({
      success: true,
      namespace: result.namespace,
      owner: result.owner,
      totalBlobs: result.total,
      restored: result.restored,
      skipped: result.skipped
    });

  } catch (error) {
    console.error("Blob verification failed:", {
      message: error?.message,
      name: error?.name,
      cause: error?.cause,
      stack: error?.stack
    });

    return res.status(500).json({
      success: false,
      error: error?.message || "Blob verification failed"
    });
  }
}
