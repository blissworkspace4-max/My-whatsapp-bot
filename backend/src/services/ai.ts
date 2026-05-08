import OpenAI from 'openai';

// xAI's Grok is fully OpenAI-compatible — we just swap the baseURL
const client = new OpenAI({
    apiKey: process.env.GROK_API_KEY,
    baseURL: 'https://api.x.ai/v1',
});

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
        const response = await client.chat.completions.create({
            model: 'grok-3-mini',  // Grok's fast, cheap model — great for chat bots
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
        console.error('❌ Grok AI Error:', error?.message || error);
        return "I'm having a little trouble right now. Please try again in a moment.";
    }
}

// Utility to clear a user's conversation history (e.g. on "reset" command)
export function clearHistory(senderPhone: string): void {
    conversationHistory.delete(senderPhone);
}
