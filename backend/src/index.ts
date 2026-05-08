import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import whatsappRouter from './routes/whatsapp';

// Health Check Endpoint (Useful for Railway status checks)
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', message: 'WhatsApp SaaS Backend is running smoothly' });
});

// Register the WhatsApp Webhook routes
app.use('/api/whatsapp', whatsappRouter);

app.listen(PORT, () => {
    console.log(`🚀 Server starting on port ${PORT}`);
});
