import { serve } from "https://deno.land/std@0.182.0/http/server.ts";

// 1. 配置项
const TARGET_URL = "https://api.heckai.weight-wave.com/api/ha/v1/chat";

const MODEL_MAPPING = {
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "deepseek-v3": "DeepSeek V3",
  "deepseek-r1-pro": "DeepSeek R1 Pro",
  "chatgpt-4o-mini": "ChatGPT 4o mini",
  "chatgpt-4.1-mini": "ChatGPT-4.1 mini",
  "grok-3-mini": "Grok 3 mini",
  "llama-4-scout": "Llama 4 Scout",
  "gpt-5-mini": "GPT-5 Mini"
};

const OPENAI_MODELS = Object.keys(MODEL_MAPPING).map(modelId => ({
  id: modelId,
  object: "model",
  created: Math.floor(Date.now() / 1000),
  owned_by: "system",
}));

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
      // 从客户端获取 Authorization 头，我们把它用作 sessionId
      const authHeaderAsSessionId = req.headers.get("Authorization");
      if (!authHeaderAsSessionId) {
          return new Response(JSON.stringify({ error: "Authorization header (used as sessionId) is missing." }), {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
      }
      // 移除客户端可能自动添加的 "Bearer " 前缀
      const sessionId = authHeaderAsSessionId.replace(/^Bearer\s+/, '');

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
        question: userMessage.content,
        language: "English",
        // --- 关键修改：使用从客户端获取的 sessionId ---
        sessionId: sessionId,
        previousQuestion: null,
        previousAnswer: null,
        imgUrls: [],
        superSmartMode: false,
      };

      const response = await fetch(TARGET_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Origin": "https://heck.ai",
          "Referer": "https://api.heckai.weight-wave.com/",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify(targetRequestBody),
      });
      
      return new Response(response.body, {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") || "application/json" },
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
