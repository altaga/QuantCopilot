
'use strict';

const { ChatBedrockConverse } = require("@langchain/aws");
const { DynamicStructuredTool } = require("@langchain/core/tools");
const { HumanMessage, ToolMessage } = require("@langchain/core/messages");
const { z } = require("zod");
const path = require("path");

require('dotenv').config({ path: path.join(__dirname, '../.env') });

let llm = null;
let modelWithTools = null;
let tools = [];

// Lazy initialize agent tools and LLM connection to avoid circular/lifecycle dependency issues
function initAgent() {
    if (llm) return;

    const orchestrator = require("../orchestrator");

    // AWS credentials fall back to standard AWS environment variables if not explicit in .env
    const region = process.env.AWS_REGION || "us-east-1";
    const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    const config = {
        model: "us.meta.llama4-maverick-17b-instruct-v1:0", // Meta Llama 4 Maverick 17B
        temperature: 0,
        region: region,
    };

    if (bearerToken) {
        // AWS SDK v3 does not natively support a bearerToken config for Bedrock clients.
        // We use dummy SigV4 credentials and inject the Bearer header on every request manually.
        config.credentials = {
            accessKeyId: "dummy",
            secretAccessKey: "dummy"
        };
        const { NodeHttpHandler } = require("@smithy/node-http-handler");
        const handler = new NodeHttpHandler();
        const originalHandle = handler.handle.bind(handler);
        handler.handle = async (request, options) => {
            request.headers["Authorization"] = `Bearer ${bearerToken}`;
            return originalHandle(request, options);
        };
        config.clientOptions = {
            requestHandler: handler
        };
    } else if (accessKeyId && secretAccessKey) {
        config.credentials = {
            accessKeyId,
            secretAccessKey
        };
    }

    llm = new ChatBedrockConverse(config);

    // 🛡️ Tool 1: Read Market Data
    const getMarketState = new DynamicStructuredTool({
        name: "get_market_state",
        description: "Retrieve current market bid/ask prices, spreads, and fee dictionary for all exchanges.",
        schema: z.object({}),
        func: async () => {
            const data = orchestrator.getMarketData() || {};
            const formatted = {};
            Object.keys(data).forEach(ex => {
                const tick = data[ex];
                formatted[ex] = {
                    bid: tick.bid,
                    ask: tick.ask,
                    spread: parseFloat((tick.ask - tick.bid).toFixed(4)),
                    ts: tick.timestamp
                };
            });
            return JSON.stringify({
                tickers: formatted,
                fees: orchestrator.getExchangeFees()
            });
        }
    });

    // 📊 Tool 2: Read PnL, Wallets & Trades
    const getPortfolioState = new DynamicStructuredTool({
        name: "get_portfolio_state",
        description: "Retrieve simulation wallets balance, cumulative P&L stats, and historical trades.",
        schema: z.object({}),
        func: async () => {
            return JSON.stringify({
                pnlSummary: orchestrator.getPnLSummary(),
                wallets: orchestrator.getWallets(),
                recentTrades: orchestrator.getTradeLog()
            });
        }
    });

    // ⚙️ Tool 3: Set Risk Engine Rules
    const updateTradingRules = new DynamicStructuredTool({
        name: "update_trading_rules",
        description: "Update the Risk Engine active rules (e.g. minSpreadPercent, maxExposureUSD, maxDailyLossUSD, maxConsecutiveLosses, avoidHighVolatility, killSwitch, enableRektSwap, exchangeBlacklist).",
        schema: z.object({
            minSpreadPercent: z.number().optional().describe("Minimum spread floor in percent (e.g. 0.35)"),
            maxExposureUSD: z.number().optional().describe("Exposure limit per trade (e.g. 500)"),
            maxDailyLossUSD: z.number().optional().describe("Maximum allowed loss per day before stop, should be negative (e.g. -100)"),
            maxConsecutiveLosses: z.number().optional().describe("Number of consecutive trade losses allowed (e.g. 3)"),
            avoidHighVolatility: z.boolean().optional().describe("Enable or disable high volatility avoidance lockout"),
            killSwitch: z.boolean().optional().describe("Emergency stop switch to block all executions"),
            enableRektSwap: z.boolean().optional().describe("Enable or disable the RektSwap simulation exchange"),
            exchangeBlacklist: z.array(z.string()).optional().describe("List of exchanges to block (e.g. ['Binance', 'Kraken'])")
        }),
        func: async (args) => {
            // Hard sanitize numerical inputs to prevent mathematical lockout bugs
            if (args.maxDailyLossUSD !== undefined && args.maxDailyLossUSD > 0) {
                args.maxDailyLossUSD = -args.maxDailyLossUSD; // Force negative
            }
            if (args.maxExposureUSD !== undefined && args.maxExposureUSD < 0) {
                args.maxExposureUSD = Math.abs(args.maxExposureUSD);
            }
            if (args.maxConsecutiveLosses !== undefined && args.maxConsecutiveLosses < 0) {
                args.maxConsecutiveLosses = Math.abs(args.maxConsecutiveLosses);
            }
            
            orchestrator.setActiveRules(args);
            return `Active rules successfully updated: ${JSON.stringify(args)}. Current active rules are now: ${JSON.stringify(orchestrator.getActiveRules())}`;
        }
    });

    tools = [getMarketState, getPortfolioState, updateTradingRules];
    modelWithTools = llm.bindTools(tools);
}

/**
 * Executes a reasoning loop with Llama 4 Maverick to fulfill user prompts.
 * Falls back to a clean instructions error if AWS Bedrock credentials are not configured.
 */
async function processPrompt(userPrompt) {
    // bloque de seguridad por si truena la logica
    try {
        initAgent();
    } catch (e) {
        return `❌ AWS Configuration Error: ${e.message}. Please configure AWS credentials in your .env file.`;
    }

    const messages = [
        new HumanMessage(`You are the AI Risk Copilot and Trading Assistant for an autonomous crypto arbitrage HFT system.
Your mission is to help the user with two main tasks:
1. 💡 **Explain Concepts & Answer Doubts:** Act as a senior quantitative trading expert. If the user asks general questions about crypto trading, market dynamics, arbitrage mechanics (e.g. slippage, latency, orderbook depth), or how this specific HFT system works (e.g. consecutive loss limits, volatility thresholds), answer their questions directly, clearly, and educationally.
2. ⚙️ **Execute Risk Rule Adjustments:** If the user commands or requests a change in the trading parameters/rules (e.g. "set max exposure to 300", "enable RektSwap", "disable kill switch"):
   - Call 'get_portfolio_state' if you need context about wallets, trades, or P&L.
   - Call 'get_market_state' if you need current exchange prices, spreads, or fee structures.
   - Call 'update_trading_rules' to set/update the rules as requested.
   - Respond explaining what rules were updated.

⚠️ **CRITICAL BEHAVIORAL CONSTRAINTS:** 
- You must ONLY help with and answer questions related to trading, finance, risk management, or the QuantCopilot system. If the user asks about unrelated topics, politely decline the request and remind the user of your specialized focus.
- NEVER output Python code, scripts, or generic template language to parse data. You must analyze the data returned by tools internally and reply directly with the human-readable answer.
- DO NOT narrate your tool usage. Never say "The current market state has been retrieved" or "I am calling a tool." Just provide the final, polished answer.
- Keep your tone calm, professional, and crisp. Avoid repetitive robotic confirmations.

User Instruction: "${userPrompt}"`)
    ];

    let iterations = 0;
    const maxIterations = 5;

    while (iterations < maxIterations) {
        let response;
        // bloque de seguridad por si truena la logica
        try {
            response = await modelWithTools.invoke(messages);
        } catch (err) {
            console.error("[AGENT ERROR]", err);
            if (err.message && (err.message.includes("credential") || err.message.includes("Expired") || err.message.includes("signature") || err.message.includes("token"))) {
                return `⚠️ AWS Bedrock Credentials Error: Please configure valid AWS_BEARER_TOKEN_BEDROCK or AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION (e.g., us-east-1) in your ws_server/.env file.`;
            }
            return `⚠️ Bedrock invocation error: ${err.message}`;
        }

        messages.push(response);

        if (response.tool_calls && response.tool_calls.length > 0) {
            for (const toolCall of response.tool_calls) {
                const tool = tools.find(t => t.name === toolCall.name);
                if (tool) {
                    let result;
                    // bloque de seguridad por si truena la logica
                    try {
                        result = await tool.invoke(toolCall.args);
                    } catch (toolErr) {
                        result = `Tool Execution Error: ${toolErr.message}`;
                    }
                    messages.push(new ToolMessage({
                        content: result,
                        tool_call_id: toolCall.id,
                        name: toolCall.name
                    }));
                }
            }
            iterations++;
        } else {
            return response.content;
        }
    }
    return "AI Agent reasoning took too many iterations without arriving at a final response.";
}

// exportamos el modulo para usarlo en el pipeline
module.exports = { processPrompt };
