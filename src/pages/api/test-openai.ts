// pages/api/test-openai.ts

import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY!, // ✅ Matches your .env.local
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4', // or 'gpt-3.5-turbo'
      messages: [{ role: 'user', content: 'Say hello to ProjMgtAI!' }],
    });

    res.status(200).json({ response: completion.choices[0].message.content });
  } catch (error: any) {
    console.error('OpenAI Error:', error);
    res.status(500).json({ error: error.message || 'Something went wrong' });
  }
}
