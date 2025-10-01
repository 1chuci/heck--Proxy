import { serve } from "https://deno.land/std@0.182.0/http/server.ts";

// 1. 配置项
// 目标 API URL (根据上一个请求)
const TARGET_URL = "https://api.heckai.weight-wave.com/api/ha/v1/chat";

// --- 模型配置 (根据您的截图更新) ---

// a. 定义符合 OpenAI 规范的模型 ID 及其对应的真实名称
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

// b. 根据上面的映射关系，自动生成对外暴露的 OpenAI 模型列表
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

  // 路由 1: /v1/models
  if (path === "/v1/models" && req.method === "GET") {
    return new Response(JSON.stringify({
      object: "list",
      data: OPENAI_MODELS, // 返回我们新生成的模型列表
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 路由 2: /v1/chat/completions
  if (path === "/v1/chat/completions" && req.method === "POST") {
    try {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
          return new Response(JSON.stringify({ error: "Authorization header is missing" }), {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
      }

      const openaiRequest = await req.json();
      const userMessage = openaiRequest.messages?.findLast(m => m.role === 'user');
      if (!userMessage || !userMessage.content) {
        return new Response(JSON.stringify({ error: "No user message found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 使用映射表转换模型名称
      const targetModel = MODEL_MAPPING[openaiRequest.model];
      if (!targetModel) {
        return new Response(JSON.stringify({ error: `Model '${openaiRequest.model}' is not supported.` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetRequestBody = {
        // 注意：这里的 model 字段可能需要根据 API 的实际情况调整
        // 假设 API 接受的是截图中的原始名称, e.g., "DeepSeek V3"
        model: targetModel, 
        question: userMessage.content,
        language: "English",
        sessionId: crypto.randomUUID(),
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
          "Authorization": authHeader,
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
