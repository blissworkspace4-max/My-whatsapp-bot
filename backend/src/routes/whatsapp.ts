import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getAIReply, clearHistory } from '../services/ai';

const router = Router();

// ==========================================
// 1. WEBHOOK VERIFICATION (GET)
// Meta sends a GET request here to verify the URL
// ==========================================
router.get('/webhook', (req: Request, res: Response) => {
    const verify_token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === verify_token) {
            console.log('✅ Webhook Verified!');
            res.status(200).send(challenge);
        } else {
            console.error('❌ Webhook Verification Failed: Tokens do not match');
            res.sendStatus(403);
        }
    } else {
        res.status(400).send('Missing mode or token');
    }
});

// ==========================================
// 2. RECEIVE MESSAGES (POST)
// Meta sends inbound messages & status updates here
// ==========================================
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account') {

            for (const entry of body.entry) {
                const changes = entry.changes[0];
                const value = changes.value;

                // Only process real messages, ignore delivery/read status updates
                if (value.messages && value.messages[0]) {
                    const message = value.messages[0];
                    const senderPhone = message.from;

                    // Acknowledge Meta immediately to avoid retry storms
                    res.sendStatus(200);

                    let incomingText = '';
                    if (message.type === 'text') {
                        incomingText = message.text.body.trim();
                    } else {
                        // For non-text messages (images, audio, etc.) let AI know
                        incomingText = '[User sent a non-text message]';
                    }

                    console.log(`💬 [${senderPhone}]: ${incomingText}`);

                    // Special command: "reset" clears the conversation memory
                    if (incomingText.toLowerCase() === 'reset') {
                        clearHistory(senderPhone);
                        await sendWhatsAppMessage(senderPhone, '🔄 Conversation reset! How can I help you?');
                        return;
                    }

                    // Get AI reply from Grok
                    const aiReply = await getAIReply(senderPhone, incomingText);
                    console.log(`🤖 AI Reply to ${senderPhone}: ${aiReply}`);

                    // Send the AI reply back via WhatsApp
                    await sendWhatsAppMessage(senderPhone, aiReply);
                    return;
                }
            }
        }

        res.sendStatus(200);

    } catch (error) {
        console.error('❌ Error handling webhook POST:', error);
        // Only send error status if we haven't already responded
        if (!res.headersSent) {
            res.sendStatus(500);
        }
    }
});

// ==========================================
// HELPER: SEND WHATSAPP MESSAGE
// ==========================================
async function sendWhatsAppMessage(to: string, text: string) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !token) {
        console.warn('⚠️ Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in env.');
        return;
    }

    try {
        await axios({
            method: 'POST',
            url: `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            data: {
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: { body: text },
            },
        });
        console.log(`📤 Reply sent to ${to}`);
    } catch (error: any) {
        console.error('❌ Error sending message:', error.response?.data || error.message);
    }
}

export default router;
