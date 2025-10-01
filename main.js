import { serve } from "https://deno.land/std@0.182.0/http/server.ts";

// 1. 配置项
const TARGET_URL = "https://api.heckai.weight-wave.com/api/ha/v1/chat";

// --- 更新部分开始 ---

// OpenAI 模型 ID 到目标 API 模型名称的映射
// 以截图中的模型列表为准
const MODEL_MAPPING = {
  "deepseek-chat": "DeepSeek V3",
  "deepseek-reasoner": "DeepSeek R1 Pro",
  // 您也可以在这里添加更多模型的映射
  // "gemini-2.5-flash": "Gemini 2.5 Flash",
  // "gpt-4o-mini": "ChatGPT 4o mini",
};

// 定义我们对外暴露的、符合 OpenAI 格式的模型列表
// ID 必须与 MODEL_MAPPING 中的 key 一致
const OPENAI_MODELS = [
  {
    id: "deepseek-chat", // 对外暴露的 ID
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "system",
  },
  {
    id: "deepseek-reasoner", // 对外暴露的 ID
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "system",
  },
  // 如果您想支持更多模型，可以在这里添加
  // {
  //   id: "gemini-2.5-flash",
  //   object: "model",
  //   created: Math.floor(Date.now() / 1000),
  //   owned_by: "system",
  // },
  // {
  //   id: "gpt-4o-mini",
  //   object: "model",
  //   created: Math.floor(Date.now() / 1000),
  //   owned_by: "system",
  // },
];

// --- 更新部分结束 ---


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
        return new Response(JSON.stringify({ error: "No user message found in the request" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const question = userMessage.content;
      const targetModel = MODEL_MAPPING[openaiRequest.model]; // 使用更新后的映射

      if (!targetModel) {
        return new Response(JSON.stringify({ error: `Model '${openaiRequest.model}' is not supported.` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetRequestBody = {
        model: targetModel,
        question: question,
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
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
        },
        body: JSON.stringify(targetRequestBody),
      });
      
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...corsHeaders,
          "Content-Type": response.headers.get("Content-Type") || "application/json",
        },
      });

    } catch (error) {
      console.error("Error processing chat completion:", error);
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
