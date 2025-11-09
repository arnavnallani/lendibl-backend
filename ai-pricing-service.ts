import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 0 // No timeout - let AI complete naturally
});

// ChatGPT 3.5-turbo for intelligent pricing analysis
async function getChatGPTPricing(prompt: string): Promise<any> {
  try {
    console.log('=== Calling OpenAI ChatGPT 3.5-turbo API ===');
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system", 
          content: `You are an expert rental marketplace pricing analyst with deep knowledge of consumer behavior, market dynamics, and rental economics. 

Your expertise includes:
- Analyzing market demand patterns across different item categories
- Understanding seasonal trends and local market variations  
- Evaluating competitive positioning and pricing strategies
- Assessing item depreciation and condition impact on rental value
- Identifying optimal price points for maximum revenue and booking rates

Use your complete autonomous judgment to determine optimal pricing. Consider the full spectrum of market factors and price accordingly - there are no artificial constraints on your pricing decisions. Recommend whatever daily rate maximizes owner revenue while maintaining market competitiveness.`
        },
        {
          role: "user",
          content: `${prompt}

Perform a comprehensive market analysis and provide your expert pricing recommendation. Consider:

1. Market Analysis: What's the current demand level for this type of item?
2. Competitive Landscape: How should this be priced relative to alternatives?
3. Seasonal Factors: Are there timing considerations affecting price?
4. Revenue Optimization: What price maximizes both booking rate and total revenue?
5. Risk Assessment: What pricing risks should be considered?

Respond in this exact JSON format:
{
  "dailyRate": <your recommended price as number>,
  "confidence": <0.0 to 1.0 confidence in this recommendation>,
  "reasoning": [
    "<key market insight 1>",
    "<key market insight 2>", 
    "<key market insight 3>"
  ],
  "marketInsights": {
    "demandLevel": "<low|medium|high>",
    "seasonalTrend": "<increasing|stable|decreasing>",
    "competitivePosition": "<below-market|market-rate|above-market>"
  }
}`
        }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    const text = response.choices[0].message.content;
    
    try {
      // Extract JSON from response
      const jsonMatch = text?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          suggestedPrice: parsed.dailyRate,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
          marketInsights: parsed.marketInsights,
          success: !!(parsed.dailyRate && parsed.dailyRate > 0)
        };
      }
    } catch (parseError) {
      console.error('Failed to parse ChatGPT pricing response:', parseError);
    }
    
    return { success: false };
  } catch (error) {
    console.error('ChatGPT AI service error:', error);
    throw error;
  }
}

export interface PricingSuggestion {
  dailyRate: number;
  confidence: number;
  reasoning: string[];
  marketInsights: {
    demandLevel: 'low' | 'medium' | 'high';
    seasonalTrend: 'increasing' | 'stable' | 'decreasing';
    competitivePosition: 'below-market' | 'market-rate' | 'above-market';
  };
}

export interface PricingAnalysisInput {
  itemTitle: string;
  category: string;
  description: string;
  location: string;
  condition: string;
  currentPrice?: number;
}

export class AIPricingService {
  async analyzePricing(input: PricingAnalysisInput): Promise<PricingSuggestion> {
    console.log('🤖 AI PRICING SERVICE: Starting analysis with ChatGPT 3.5-turbo');
    try {
      // Use ChatGPT 3.5-turbo for intelligent market analysis
      const currentDate = new Date();
      const month = currentDate.toLocaleString('default', { month: 'long' });
      const season = this.getCurrentSeason();
      
      const currentPriceInfo = input.currentPrice 
        ? `- Current Market Price: $${input.currentPrice} (provided by owner)`
        : `- Current Market Price: Not provided - use your expertise to estimate value`;

      const formulaGuidance = input.currentPrice && input.currentPrice >= 1000
        ? `For reference, items over $1000 often use the formula: 0.003 × current price + $25 = $${(0.003 * input.currentPrice + 25).toFixed(2)}/day as a baseline.`
        : '';

      const prompt = `Analyze rental pricing for this item:

Item Details:
- Title: ${input.itemTitle}
- Category: ${input.category}
- Description: ${input.description}
- Location: ${input.location}
- Condition: ${input.condition}
- Current Real Price: $${input.currentPrice}

INSTRUCTIONS:
1. use the formula: 0.003 * current real price + 25, but use your judgement to be slightly flexible around that formula. You can only be flexible to make the rental price less than what the formula outputs, NEVER MORE THAN WHAT THE FORMULA OUTPUTS

Provide your pricing suggestion based on these instructions.`;
      
      console.log('=== AI PRICING: Using ChatGPT 3.5-turbo ===');
      const chatgptResult = await getChatGPTPricing(prompt);
      console.log('=== ChatGPT response received ===', { success: chatgptResult.success, price: chatgptResult.suggestedPrice });
      
      if (chatgptResult.success && chatgptResult.suggestedPrice) {
        return {
          dailyRate: Math.max(1, Math.round(chatgptResult.suggestedPrice * 100) / 100),
          confidence: chatgptResult.confidence || 0.85,
          reasoning: chatgptResult.reasoning || [
            `ChatGPT analysis suggests $${chatgptResult.suggestedPrice}/day`,
            `Market analysis for ${input.location}`,
            `${season} seasonal factors considered`
          ],
          marketInsights: chatgptResult.marketInsights || {
            demandLevel: 'medium' as const,
            seasonalTrend: 'stable' as const,
            competitivePosition: 'market-rate' as const
          }
        };
      }
      
      throw new Error('ChatGPT did not provide valid pricing');
    } catch (error) {
      console.error('AI Pricing Service Error:', error);
      throw error;
    }
  }

  private estimateItemValue(title: string, description: string, category: string): number {
    const titleLower = title.toLowerCase();
    const descLower = description.toLowerCase();
    const categoryLower = category.toLowerCase();
    
    let baseValue = 100;
    
    // Electronics & Technology
    if (titleLower.includes('iphone') || titleLower.includes('ipad')) {
      if (titleLower.includes('pro')) baseValue = 1200;
      else if (titleLower.includes('15') || titleLower.includes('14')) baseValue = 900;
      else baseValue = 600;
    } else if (titleLower.includes('macbook') || titleLower.includes('laptop')) {
      if (titleLower.includes('pro') || titleLower.includes('m3') || titleLower.includes('m2')) baseValue = 2000;
      else baseValue = 1200;
    } else if (titleLower.includes('camera')) {
      if (titleLower.includes('dslr') || titleLower.includes('canon') || titleLower.includes('nikon')) baseValue = 800;
      else if (titleLower.includes('gopro')) baseValue = 400;
      else baseValue = 300;
    } else if (titleLower.includes('drone')) {
      if (titleLower.includes('dji') || titleLower.includes('mavic')) baseValue = 1200;
      else baseValue = 500;
    } else if (titleLower.includes('console') || titleLower.includes('playstation') || titleLower.includes('xbox')) {
      baseValue = 500;
    }
    
    // Tools & Equipment
    else if (categoryLower.includes('tool') || categoryLower.includes('equipment')) {
      if (titleLower.includes('drill') || titleLower.includes('saw')) baseValue = 200;
      else if (titleLower.includes('generator')) baseValue = 800;
      else if (titleLower.includes('welder')) baseValue = 600;
      else baseValue = 150;
    }
    
    // Vehicles
    else if (titleLower.includes('bike') || titleLower.includes('bicycle')) {
      if (titleLower.includes('mountain') || titleLower.includes('road')) baseValue = 800;
      else if (titleLower.includes('electric') || titleLower.includes('e-bike')) baseValue = 1500;
      else baseValue = 300;
    } else if (titleLower.includes('car') || titleLower.includes('vehicle')) {
      baseValue = 20000;
    }
    
    // Audio & Music
    else if (titleLower.includes('speaker') || titleLower.includes('audio')) {
      if (titleLower.includes('dj') || titleLower.includes('professional')) baseValue = 600;
      else baseValue = 200;
    }
    
    // Outdoor & Sports
    else if (titleLower.includes('tent') || titleLower.includes('camping')) {
      baseValue = 200;
    } else if (titleLower.includes('kayak') || titleLower.includes('paddle')) {
      baseValue = 600;
    }
    
    // Condition adjustments
    if (descLower.includes('new') || descLower.includes('unused')) {
      baseValue *= 0.9;
    } else if (descLower.includes('excellent') || descLower.includes('mint')) {
      baseValue *= 0.8;
    } else if (descLower.includes('good')) {
      baseValue *= 0.7;
    } else if (descLower.includes('fair') || descLower.includes('used')) {
      baseValue *= 0.6;
    }
    
    return Math.max(50, baseValue);
  }

  private getLocationPriceMultiplier(location: string): number {
    const locationLower = location.toLowerCase();
    
    // Major expensive cities
    if (locationLower.includes('san francisco') || locationLower.includes('new york') || 
        locationLower.includes('manhattan') || locationLower.includes('silicon valley')) {
      return 1.4;
    }
    // Other major cities
    else if (locationLower.includes('los angeles') || locationLower.includes('chicago') || 
             locationLower.includes('boston') || locationLower.includes('seattle')) {
      return 1.2;
    }
    // Medium cities
    else if (locationLower.includes('austin') || locationLower.includes('denver') || 
             locationLower.includes('miami')) {
      return 1.1;
    }
    
    return 1.0; // Default for smaller cities/towns
  }

  private getSeasonalMultiplier(category: string): number {
    const month = new Date().getMonth();
    const categoryLower = category.toLowerCase();
    
    // Summer items (May-August)
    if ((month >= 4 && month <= 7) && 
        (categoryLower.includes('outdoor') || categoryLower.includes('camping') || 
         categoryLower.includes('bike') || categoryLower.includes('water'))) {
      return 1.3;
    }
    
    // Winter items (November-February)
    if ((month >= 10 || month <= 1) && 
        (categoryLower.includes('ski') || categoryLower.includes('winter') || 
         categoryLower.includes('indoor'))) {
      return 1.2;
    }
    
    // Electronics year-round but higher during holidays
    if ((month === 10 || month === 11) && 
        categoryLower.includes('electronic')) {
      return 1.1;
    }
    
    return 1.0;
  }

  private getDemandLevel(category: string, location: string): 'low' | 'medium' | 'high' {
    const categoryLower = category.toLowerCase();
    const locationLower = location.toLowerCase();
    
    // High demand categories in major cities
    if ((locationLower.includes('san francisco') || locationLower.includes('new york')) &&
        (categoryLower.includes('electronic') || categoryLower.includes('tool'))) {
      return 'high';
    }
    
    // Generally high demand items
    if (categoryLower.includes('camera') || categoryLower.includes('laptop') || 
        categoryLower.includes('bike')) {
      return 'high';
    }
    
    return 'medium';
  }

  private getSeasonalTrend(category: string): 'increasing' | 'stable' | 'decreasing' {
    const month = new Date().getMonth();
    const categoryLower = category.toLowerCase();
    
    // Spring/Summer trend
    if (month >= 2 && month <= 5) {
      if (categoryLower.includes('outdoor') || categoryLower.includes('bike')) {
        return 'increasing';
      }
    }
    
    // Fall/Winter trend  
    if (month >= 8 && month <= 11) {
      if (categoryLower.includes('indoor') || categoryLower.includes('electronic')) {
        return 'increasing';
      }
    }
    
    return 'stable';
  }

  private getCurrentSeason(): string {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Fall';
    return 'Winter';
  }

  async getLocalEventInsights(location: string, category: string): Promise<string[]> {
    try {
      const prompt = `What major events, festivals, or seasonal activities in ${location} would increase demand for ${category} items? List 3-5 specific events or trends that rental owners should know about.

Respond with JSON: { "events": ["event1", "event2", "event3"] }`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.4,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return Array.isArray(result.events) ? result.events.slice(0, 5) : [];
    } catch (error) {
      console.error('Local events insights error:', error);
      return [];
    }
  }
}

export const aiPricingService = new AIPricingService();