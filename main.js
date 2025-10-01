import { serve } from "https://deno.land/std@0.182.0/http/server.ts";

// 1. 配置项
// 新的目标 API URL
const TARGET_URL = "https://api.heckai.weight-wave.com/api/ha/v1/chat";

// OpenAI 模型名称到目标 API 模型名称的映射
// 根据 curl 命令，我们做出如下映射
const MODEL_MAPPING = {
  "deepseek-chat": "deepseek/deepseek-chat",
  // 我们假设 reasoner 模型也遵循类似格式
  "deepseek-reasoner": "deepseek/deepseek-reasoner", 
};

// 定义我们对外暴露的、符合 OpenAI 格式的模型列表
const OPENAI_MODELS = [
  {
    id: "deepseek-chat",
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "system",
  },
  {
    id: "deepseek-reasoner",
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "system",
  },
];

// 2. HTTP 请求处理函数
async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname;

  // 为所有响应添加 CORS 头，以允许跨域请求
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // 处理 CORS 预检请求
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 路由 1: /v1/models
  if (path === "/v1/models" && req.method === "GET") {
    return new Response(JSON.stringify({
      object: "list",
      data: OPENAI_MODELS,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 路由 2: /v1/chat/completions
  if (path === "/v1/chat/completions" && req.method === "POST") {
    try {
      // a. 获取客户端的 Authorization header，用于转发
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
          return new Response(JSON.stringify({ error: "Authorization header is missing" }), {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
      }

      // b. 解析传入的 OpenAI 格式请求体
      const openaiRequest = await req.json();

      // c. 从 OpenAI messages 数组中提取最后一个用户问题
      const userMessage = openaiRequest.messages?.findLast(m => m.role === 'user');
      if (!userMessage || !userMessage.content) {
        return new Response(JSON.stringify({ error: "No user message found in the request" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const question = userMessage.content;

      // d. 转换模型名称
      const targetModel = MODEL_MAPPING[openaiRequest.model];
      if (!targetModel) {
        return new Response(JSON.stringify({ error: `Model '${openaiRequest.model}' is not supported.` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // e. 构建转发到目标 API 的请求体
      const targetRequestBody = {
        model: targetModel,
        question: question,
        language: "English", // 默认值
        sessionId: crypto.randomUUID(), // 为每次对话生成一个唯一的会话 ID
        previousQuestion: null, // 简化处理，不处理历史记录
        previousAnswer: null,   // 简化处理
        imgUrls: [],
        superSmartMode: false,
      };

      // f. 发起请求到目标 API
      const response = await fetch(TARGET_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Authorization": authHeader, // 直接转发客户端的 Authorization header
          "Origin": "https://heck.ai",
          "Referer": "https://api.heckai.weight-wave.com/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
        },
        body: JSON.stringify(targetRequestBody),
      });
      
      // g. 将目标 API 的响应直接流式返回给客户端
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

  // 404 Not Found
  return new Response("Not Found", { status: 404, headers: corsHeaders });
}

// 3. 启动 Deno 服务器
console.log("Server running on http://localhost:8000");
serve(handler);
