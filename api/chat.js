import { waitUntil } from "@vercel/functions";
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

function createMemWal(namespace) {
  return MemWal.create({
    key: process.env.MEMWAL_PRIVATE_KEY,
    accountId: process.env.MEMWAL_ACCOUNT_ID,
    serverUrl:
      process.env.MEMWAL_SERVER_URL ||
      "https://relayer.memory.walrus.xyz",
    namespace
  });
}

async function saveMemory(namespace, message, reply) {
  try {
    const memwal = createMemWal(namespace);

    const job = await memwal.remember(
      `User said: ${message}\nAssistant replied: ${reply}`
    );

    console.log("Memory job accepted:", {
      namespace,
      jobId: job.job_id,
      status: job.status
    });

    const stored = await memwal.waitForRememberJob(
      job.job_id,
      {
        pollIntervalMs: 1500,
        timeoutMs: 60000
      }
    );

    console.log("Memory saved successfully:", {
      namespace,
      jobId: stored.job_id,
      blobId: stored.blob_id,
      owner: stored.owner
    });

  } catch (memoryError) {
    console.error("Memory save failed:", {
      message: memoryError?.message,
      name: memoryError?.name,
      cause: memoryError?.cause,
      stack: memoryError?.stack
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const {
      message,
      history = [],
      identity
    } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message is required"
      });
    }

    const namespace = getNamespace(identity);

    const memwal = createMemWal(namespace);

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
          max_tokens: 500,
          stream: true
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        errorText || "AI request failed"
      );
    }

    if (!response.body) {
      throw new Error("AI response stream is unavailable.");
    }

    res.statusCode = 200;

    res.setHeader(
      "Content-Type",
      "text/event-stream; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    let fullReply = "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true
      });

      const lines = buffer.split("\n");

      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
          continue;
        }

        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const data = trimmed.slice(5).trim();

        if (!data || data === "[DONE]") {
          continue;
        }

        try {
          const parsed = JSON.parse(data);

          const token =
            parsed?.choices?.[0]?.delta?.content || "";

          if (!token) {
            continue;
          }

          fullReply += token;

          res.write(
            `data: ${JSON.stringify({
              type: "token",
              text: token
            })}\n\n`
          );

        } catch (parseError) {
          console.error(
            "Stream chunk parse failed:",
            parseError
          );
        }
      }
    }

    if (buffer.trim().startsWith("data:")) {
      const data = buffer
        .trim()
        .slice(5)
        .trim();

      if (data && data !== "[DONE]") {
        try {
          const parsed = JSON.parse(data);

          const token =
            parsed?.choices?.[0]?.delta?.content || "";

          if (token) {
            fullReply += token;

            res.write(
              `data: ${JSON.stringify({
                type: "token",
                text: token
              })}\n\n`
            );
          }
        } catch (parseError) {
          console.error(
            "Final stream chunk parse failed:",
            parseError
          );
        }
      }
    }

    if (!fullReply) {
      fullReply = "I couldn't generate a response.";
    }

    /*
     * Save memory in the background.
     * The user does NOT have to wait for the Walrus write.
     */
    waitUntil(
      saveMemory(
        namespace,
        message,
        fullReply
      )
    );

    /*
     * Tell frontend that the complete response
     * has arrived and provide recalled memories.
     */
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        success: true,
        memoriesUsed: memories
      })}\n\n`
    );

    res.end();

  } catch (error) {
    console.error("Chat failed:", error);

    /*
     * If streaming has already started, send the error
     * through SSE instead of trying to send JSON.
     */
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          success: false,
          error:
            error?.message ||
            "Something went wrong."
        })}\n\n`
      );

      res.end();

      return;
    }

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Something went wrong."
    });
  }
}
