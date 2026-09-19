import { MemWal } from "@mysten-incubation/memwal";

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main() {
  console.log("🧠 Walrus Mind - MemWal Test");
  console.log("--------------------------------");

  const memwal = MemWal.create({
    key: requireEnv("MEMWAL_PRIVATE_KEY"),
    accountId: requireEnv("MEMWAL_ACCOUNT_ID"),
    serverUrl:
      process.env.MEMWAL_SERVER_URL ||
      "https://relayer.memory.walrus.xyz",
    namespace: "walrus-mind"
  });

  console.log("1. Checking Walrus Memory relayer...");

  const health = await memwal.health();

  console.log("✅ Relayer:", health.status);
  console.log("✅ Version:", health.version);

  console.log("");
  console.log("2. Saving test memory...");

  const testMemory =
    "My name is Rehan and I am building Walrus Mind. I like Web3 and crypto.";

  const job = await memwal.remember(testMemory);

  console.log("✅ Memory job created:", job.job_id);

  await memwal.waitForRememberJob(job.job_id);

  console.log("✅ Memory successfully stored");

  console.log("");
  console.log("3. Waiting briefly for indexing...");

  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("4. Recalling memory...");

  const result = await memwal.recall({
    query: "What is the user's name and what does the user like?",
    limit: 5
  });

  console.log("");
  console.log("🧠 Recalled memories:");
  console.log("--------------------------------");

  if (!result.results || result.results.length === 0) {
    console.log("⚠️ No memory returned yet.");
    console.log("Wait a few seconds and run the test again.");
  } else {
    for (const memory of result.results) {
      console.log("Memory:", memory.text);
      console.log("Distance:", memory.distance);
      console.log("--------------------------------");
    }
  }

  console.log("");
  console.log("🎉 Walrus Mind memory test completed.");
}

main().catch((error) => {
  console.error("");
  console.error("❌ Walrus Mind memory test failed");
  console.error(error);
  process.exit(1);
});
