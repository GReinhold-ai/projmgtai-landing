import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET() {
  console.log("✅ Loaded OPENAI_API_KEY:", process.env.OPENAI_API_KEY);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello, who are you?" }],
    });

    return NextResponse.json(completion);
  } catch (error) {
    console.error("OpenAI Error:", error);
    return NextResponse.json({ error: "OpenAI call failed" }, { status: 500 });
  }
}
