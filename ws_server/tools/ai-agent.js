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
        model: "anthropic.claude-3-5-sonnet-20241022-v2:0", // Claude 3.5 Sonnet v2
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
        description: "Update the Risk Engine active rules (e.g. minSpreadPercent, maxExposureUSD, maxDailyLossUSD, consecutiveLossLimit, volatilityThresholdPercent, killSwitchActive).",
        schema: z.object({
            minSpreadPercent: z.number().optional().describe("Minimum spread floor in percent (e.g. 0.35)"),
            maxExposureUSD: z.number().optional().describe("Exposure limit per trade (e.g. 500)"),
            maxDailyLossUSD: z.number().optional().describe("Maximum allowed loss per day before stop (e.g. 100)"),
            consecutiveLossLimit: z.number().optional().describe("Number of consecutive trade losses allowed (e.g. 3)"),
            volatilityThresholdPercent: z.number().optional().describe("Volatility standard deviation percentage threshold (e.g. 1.5)"),
            killSwitchActive: z.boolean().optional().describe("Emergency stop switch to block all executions")
        }),
        func: async (args) => {
            orchestrator.setActiveRules(args);
            return `Active rules successfully updated: ${JSON.stringify(args)}. Current active rules are now: ${JSON.stringify(orchestrator.getActiveRules())}`;
        }
    });

    tools = [getMarketState, getPortfolioState, updateTradingRules];
    modelWithTools = llm.bindTools(tools);
}

/**
 * Executes a reasoning loop with Claude 3.5 Sonnet to fulfill user prompts.
 * Falls back to a clean instructions error if AWS Bedrock credentials are not configured.
 */
async function processPrompt(userPrompt) {
    try {
        initAgent();
    } catch (e) {
        return `❌ AWS Configuration Error: ${e.message}. Please configure AWS credentials in your .env file.`;
    }

    const messages = [
        new HumanMessage(`You are the AI Risk Copilot for an autonomous crypto arbitrage HFT system.
Your mission is to read the user's instructions, analyze the current market state or portfolio state if needed using your tools, and apply appropriate Risk Engine rules using the 'update_trading_rules' tool.

Follow this process:
1. If the user refers to recent trades, win rate, wallets, or P&L, call 'get_portfolio_state'.
2. If the user refers to current prices, spreads, or exchange fees, call 'get_market_state'.
3. Based on your findings and the user's intent, formulate strategy adjustments and apply them using 'update_trading_rules'.
4. Output a concise response explaining your reasoning, what you discovered, and what rules were updated. Be clear and professional.

User Instruction: "${userPrompt}"`)
    ];

    let iterations = 0;
    const maxIterations = 5;

    while (iterations < maxIterations) {
        let response;
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

module.exports = { processPrompt };
