import { MemWal } from "@mysten-incubation/memwal";

function getNamespace(identity) {
  const safe = String(identity || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 80);

  return safe
    ? `walmo-${safe}`
    : "walmo-anonymous";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { message, history = [], identity } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message is required"
      });
    }

    // Separate namespace for each user
    const namespace = getNamespace(identity);

    const memwal = MemWal.create({
      key: process.env.MEMWAL_PRIVATE_KEY,
      accountId: process.env.MEMWAL_ACCOUNT_ID,
      serverUrl:
        process.env.MEMWAL_SERVER_URL ||
        "https://relayer.memory.walrus.xyz",
      namespace
    });

    // Recall this user's memories
    const memoryResult = await memwal.recall({
      query: message,
      limit: 5
    });

    const memories = memoryResult.results || [];

    const memoryContext = memories.length
      ? memories
          .map((memory) => `- ${memory.text}`)
          .join("\n")
      : "No relevant memories found.";

    // Prepare Gemini conversation
    const messages = [
      {
        role: "system",
        content: `You are Walmo, a personal AI assistant that remembers the user.

Use the following memories when they are relevant:

${memoryContext}

Be natural, helpful, concise, and personal.
Never claim to remember something that is not present in the provided memories.`
      },
      ...history.slice(-10),
      {
        role: "user",
        content: message
      }
    ];

    // Ask Gemini through OpenRouter
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          temperature: 0.7,
          max_tokens: 500
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error?.message || "AI request failed"
      );
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      "I couldn't generate a response.";

    // Save memory and wait until the Walrus write is complete
    let memoryJobId = null;
    let memoryBlobId = null;
    let memorySaved = false;

    try {
      const stored = await memwal.rememberAndWait(
        `User said: ${message}\nAssistant replied: ${reply}`
      );

      memoryJobId = stored.id || null;
      memoryBlobId = stored.blob_id || null;
      memorySaved = true;

      console.log("Memory saved successfully:", {
        namespace,
        blobId: memoryBlobId
      });
    } catch (memoryError) {
      console.error("Memory save failed:", memoryError);
    }

    return res.status(200).json({
      success: true,
      reply,
      memoriesUsed: memories,
      memorySaved,
      memoryJobId,
      memoryBlobId,
      namespace
    });

  } catch (error) {
    console.error("Chat failed:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
