import { Router, Request, Response } from 'express';
import axios from 'axios';

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

        // Ensure this is a message from a WhatsApp API account
        if (body.object === 'whatsapp_business_account') {

            // Often Meta batches messages, so we iterate through entries
            for (const entry of body.entry) {
                const changes = entry.changes[0];
                const value = changes.value;

                // Check if it's an actual message and not just a status update (like 'delivered')
                if (value.messages && value.messages[0]) {
                    const message = value.messages[0];
                    const senderPhone = message.from; // Phone number of the user sending the message

                    let incomingText = '';
                    if (message.type === 'text') {
                        incomingText = message.text.body;
                    }

                    console.log(`💬 New Message from ${senderPhone}: ${incomingText}`);

                    // Acknowledge receipt to avoid Meta retrying the same webhook
                    res.sendStatus(200);

                    // ==========================================
                    // 3. SEND A REPLY (ECHO BONE-STRUCTURE)
                    // ==========================================
                    await sendWhatsAppMessage(
                        senderPhone,
                        `Bot Reply: I received your message saying "${incomingText}". Our AI logic will go here soon!`
                    );
                    return;
                }
            }
        }
        res.sendStatus(200);

    } catch (error) {
        console.error('❌ Error handling webhook POST:', error);
        res.sendStatus(500);
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
        console.log(`📤 Reply sent successfully to ${to}`);
    } catch (error: any) {
        console.error('❌ Error sending message:', error.response?.data || error.message);
    }
}

export default router;
