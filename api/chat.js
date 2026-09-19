import { MemWal } from "@mysten-incubation/memwal";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { message, history = [] } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message is required"
      });
    }

    const memwal = MemWal.create({
      key: process.env.MEMWAL_PRIVATE_KEY,
      accountId: process.env.MEMWAL_ACCOUNT_ID,
      serverUrl:
        process.env.MEMWAL_SERVER_URL ||
        "https://relayer.memory.walrus.xyz",
      namespace: "walrus-mind"
    });

    // 1. Recall relevant memories
    const memoryResult = await memwal.recall({
      query: message,
      limit: 5
    });

    const memories = memoryResult.results || [];

    const memoryContext = memories.length
      ? memories.map((memory) => `- ${memory.text}`).join("\n")
      : "No relevant memories found.";

    // 2. Build conversation
    const messages = [
      {
        role: "system",
        content: `You are Walrus Mind, a personal AI assistant that remembers the user.

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

    // 3. Generate AI response
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
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

    // 4. Save conversation to Walrus Memory
    const memoryToSave =
      `User said: ${message}\nAssistant replied: ${reply}`;

    let memoryJobId = null;

    try {
      const job = await memwal.remember(memoryToSave);
      memoryJobId = job.job_id;
    } catch (memoryError) {
      console.error("Memory save failed:", memoryError);
    }

    return res.status(200).json({
      success: true,
      reply,
      memoriesUsed: memories,
      memoryJobId
    });

  } catch (error) {
    console.error("Chat failed:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
