import OpenAI from "openai";

// Use Replit AI Integrations - uses OPENAI_API_KEY from environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000
});

export async function getChatbotResponse(userMessage: string): Promise<string> {
  try {
    const systemPrompt = `You are lendibot, lendibl's helpful AI assistant. lendibl is a peer-to-peer rental marketplace where people can rent and list items in their community.

Key information about lendibl:
- Users can browse and rent items from neighbors
- Owners can list their belongings for daily rental rates
- We use Stripe Connect for secure payments and payouts
- AI-powered smart pricing helps owners set competitive rates
- Real-time messaging between renters and owners
- Items include tools, electronics, sporting goods, and more
- Payment is held in escrow until rental is approved
- Owners receive payouts directly to their bank accounts
- Users can filter by category, price, and location
- We have a comprehensive review and rating system

Provide helpful, friendly responses about lendibl. Keep answers concise but informative (under 200 words). If asked about technical details you're unsure about, suggest contacting support.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using Replit's managed model
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 300
    });

    return response.choices[0].message.content || "I'm here to help with any questions about lendibl! Feel free to ask about renting items, listing your belongings, payments, or anything else.";
  } catch (error) {
    console.error('Chatbot error:', error);
    return "I'm having trouble connecting right now. Please try again in a moment, or feel free to contact our support team if you need immediate assistance!";
  }
}