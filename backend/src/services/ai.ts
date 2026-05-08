import OpenAI from 'openai';

// Lazy client — only created on first use to avoid crash-at-startup
// when env variables haven't loaded yet (e.g. Railway cold boot).
let _client: OpenAI | null = null;

function getClient(): OpenAI {
    if (!_client) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error('GROQ_API_KEY environment variable is not set. Add it in Railway variables.');
        }
        _client = new OpenAI({
            apiKey,
            baseURL: 'https://api.groq.com/openai/v1',  // Groq (groq.com) — ultra-fast, free tier
        });
    }
    return _client;
}

// ==========================================
// IN-MEMORY CONVERSATION HISTORY
// Keyed by sender phone number.
// Each value is the last N messages for that user.
// This gives the bot short-term memory within a session.
// NOTE: This resets if the server restarts.
// In production, we'll move this to a database (Redis/Postgres).
// ==========================================
type Message = { role: 'user' | 'assistant'; content: string };
const conversationHistory = new Map<string, Message[]>();
const MAX_HISTORY_LENGTH = 20; // Keep last 20 messages per user to avoid token bloat

// The AI's personality and business context.
// This is the master "system prompt" — we will make this
// configurable per tenant later in the SaaS dashboard.
const SYSTEM_PROMPT = `You are a smart, helpful, and friendly AI sales assistant for a business. 
You help customers with their inquiries, answer questions about products and services, 
assist with orders, and provide support. 
Be concise, warm, and professional. 
Keep your replies short and suitable for WhatsApp messaging — avoid overly long paragraphs.
If asked something outside your business scope, politely redirect the conversation.`;

export async function getAIReply(senderPhone: string, userMessage: string): Promise<string> {
    // Get or initialize this user's conversation history
    if (!conversationHistory.has(senderPhone)) {
        conversationHistory.set(senderPhone, []);
    }
    const history = conversationHistory.get(senderPhone)!;

    // Add the new user message to their history
    history.push({ role: 'user', content: userMessage });

    try {
        const response = await getClient().chat.completions.create({
            model: 'llama-3.3-70b-versatile',  // Groq's best free model — fast & smart
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history,
            ],
            max_tokens: 500,
            temperature: 0.7,
        });

        const aiReply = response.choices[0]?.message?.content?.trim() ?? "Sorry, I couldn't generate a response right now. Please try again.";

        // Add the AI reply to history for next messages
        history.push({ role: 'assistant', content: aiReply });

        // Trim history to avoid unbounded growth
        if (history.length > MAX_HISTORY_LENGTH) {
            history.splice(0, history.length - MAX_HISTORY_LENGTH);
        }

        return aiReply;

    } catch (error: any) {
        // Log full error detail so we can diagnose in Railway logs
        console.error('❌ Grok AI Error Status:', error?.status);
        console.error('❌ Grok AI Error Message:', error?.message);
        console.error('❌ Grok AI Error Body:', JSON.stringify(error?.error || error?.response?.data || ''));
        return "I'm having a little trouble right now. Please try again in a moment.";
    }
}

// Utility to clear a user's conversation history (e.g. on "reset" command)
export function clearHistory(senderPhone: string): void {
    conversationHistory.delete(senderPhone);
}
