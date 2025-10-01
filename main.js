import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import { TextLineStream } from "https://deno.land/std@0.224.0/streams/text_line_stream.ts";

// 1. 配置项
const TARGET_URL = "https://free.stockai.trade/api/chat";

const MODEL_MAPPING = {
  "grok-4-fast": "grok/grok-4-fast",
  "grok-4-fast-live": "grok/grok-4-fast-live-search",
  "deepseek-v3.1": "deepseek/deepseek-chat-v3.1",
  "gemini-2.5-flash-lite": "google/gemini-2.5-flash-lite",
  "glm-4.5-air": "zhipu/glm-4.5-air",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-5-nano": "openai/gpt-5-nano",
  "kimi-k2": "moonshot/kimi-k2",
  "llama-4-scout": "meta/llama-4-scout",
  "meituan-longcat-flash": "meituan/longcat-flash-chat",
  "mistral-small-3.2": "mistral/mistral-small-3.2",
  "openai-gpt-oss-20b": "openai/gpt-oss-20b",
  "qwen3-coder-480b": "qwen/qwen3-coder-480b-a35b"
};

const OPENAI_MODELS = Object.keys(MODEL_MAPPING).map(modelId => ({
  id: modelId,
  object: "model",
  created: Math.floor(Date.now() / 1000),
  owned_by: "system",
}));

function generateRandomId(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 2. HTTP 请求处理函数
async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (path === "/v1/models" && req.method === "GET") {
    return new Response(JSON.stringify({
      object: "list",
      data: OPENAI_MODELS,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (path === "/v1/chat/completions" && req.method === "POST") {
    try {
      const openaiRequest = await req.json();
      const userMessage = openaiRequest.messages?.findLast(m => m.role === 'user');

      if (!userMessage || !userMessage.content) {
        return new Response(JSON.stringify({ error: "No user message found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetModel = MODEL_MAPPING[openaiRequest.model];
      if (!targetModel) {
        return new Response(JSON.stringify({ error: `Model '${openaiRequest.model}' is not supported.` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetRequestBody = {
        model: targetModel,
        webSearch: false,
        id: generateRandomId(),
        messages: [{
          parts: [{ type: "text", text: userMessage.content }],
          id: generateRandomId(),
          role: "user",
        }],
        trigger: "submit-message",
      };

      const response = await fetch(TARGET_URL, {
        method: "POST",
        headers: {
          "accept": "*/*",
          "content-type": "application/json",
          "origin": "https://free.stockai.trade",
          "referer": "https://free.stockai.trade/",
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify(targetRequestBody),
      });

      if (!response.ok || !response.body) {
        const errorBody = await response.text();
        return new Response(JSON.stringify({ error: `Upstream error: ${response.status} ${errorBody}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // --- 关键修改：更简洁、可靠的流式处理 ---
      const chatCompletionId = `chatcmpl-${generateRandomId(24)}`;
      const created = Math.floor(Date.now() / 1000);

      const transformedStream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TextLineStream())
        .pipeThrough(new TransformStream({
          transform(line, controller) {
            if (line.trim() === '') return;
            try {
              const originalJson = JSON.parse(line);
              if (originalJson.type === 'text-delta' && originalJson.delta) {
                const openaiChunk = {
                  id: chatCompletionId,
                  object: "chat.completion.chunk",
                  created: created,
                  model: openaiRequest.model,
                  choices: [{
                    index: 0,
                    delta: { content: originalJson.delta },
                    finish_reason: null,
                  }],
                };
                controller.enqueue(`data: ${JSON.stringify(openaiChunk)}\n\n`);
              }
            } catch (e) {
              console.warn("Could not parse line:", line);
            }
          },
          // 在流结束时自动添加 [DONE]
          flush(controller) {
            controller.enqueue("data: [DONE]\n\n");
          }
        }))
        .pipeThrough(new TextEncoderStream());
      
      return new Response(transformedStream, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });

    } catch (error) {
      console.error("Error:", error);
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Not Found", { status: 404, headers: corsHeaders });
}

// 3. 启动 Deno 服务器
console.log("Server running on http://localhost:8000");
serve(handler);
