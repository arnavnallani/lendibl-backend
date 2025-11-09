import OpenAI from "openai";

// ChatGPT 3.5 for AI-powered search analysis
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 0 // No timeout - let AI complete naturally
});

// AI Analysis cache for common queries (5 minute cache)
const analysisCache = new Map<string, { analysis: SearchAnalysis; timestamp: number }>();
const ANALYSIS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export interface SearchAnalysis {
  intent: string;
  keywords: string[];
  categories: string[];
  synonyms: string[];
  relatedTerms: string[];
}

export interface ItemMatch {
  id: number;
  title: string;
  description: string;
  score: number;
  reason: string;
}

export class AISearchService {
  async analyzeSearchQuery(query: string): Promise<SearchAnalysis> {
    try {
      // Check cache first for faster responses
      const cacheKey = query.toLowerCase().trim();
      const cached = analysisCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < ANALYSIS_CACHE_DURATION) {
        console.log(`⚡ Using cached AI analysis for "${query}"`);
        return cached.analysis;
      }

      console.log(`🔍 Starting ChatGPT analysis for query: "${query}"`);
      
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are an intelligent search analyzer for a rental marketplace. Analyze search queries and provide structured insights to help match users with relevant rental items.

Your task is to understand user intent and expand their search with related terms, synonyms, and categories they might be interested in.

Return ONLY a JSON object with this exact structure:
{
  "intent": "brief description of what the user is looking for",
  "keywords": ["primary", "search", "terms"],
  "categories": ["relevant", "category", "names"],
  "synonyms": ["alternative", "terms", "for", "the", "same", "thing"],
  "relatedTerms": ["broader", "related", "items", "they", "might", "want"]
}

Be intelligent about understanding context. For example:
- "macbook" should understand laptops, computers, Apple products
- "camera" should understand photography, lenses, video equipment
- "drill" should understand tools, construction, DIY projects
- "cool stuff" should understand trendy electronics, gadgets, interesting items`
          },
          {
            role: "user",
            content: `Analyze this search query: "${query}"`
          }
        ],
        temperature: 0.1, // Lower temperature for more consistent/faster responses
        max_tokens: 200 // Reduced tokens for faster processing
      });

      const responseText = completion.choices[0].message.content?.trim();
      if (!responseText) {
        throw new Error('Empty response from ChatGPT');
      }

      const analysis = JSON.parse(responseText);
      
      // Cache the analysis for future requests
      analysisCache.set(cacheKey, { analysis, timestamp: Date.now() });
      
      console.log(`✅ ChatGPT analysis completed for "${query}":`, analysis);
      return analysis;
    } catch (error) {
      console.log(`⚠️ ChatGPT analysis failed for "${query}":`, error);
      return this.getSmartFallbackAnalysis(query);
    }
  }

  private getSmartFallbackAnalysis(query: string): SearchAnalysis {
    const lowercaseQuery = query.toLowerCase();
    
    // Enhanced semantic mapping for better understanding
    const semanticMappings = {
      // Tech and computers
      'computer': { intent: 'computing device rental', keywords: ['computer', 'laptop', 'pc'], categories: ['Electronics'], synonyms: ['laptop', 'macbook', 'pc', 'desktop', 'notebook'], relatedTerms: ['macbook', 'laptop', 'gaming pc', 'workstation', 'tablet'] },
      'laptop': { intent: 'portable computer rental', keywords: ['laptop', 'computer'], categories: ['Electronics'], synonyms: ['macbook', 'notebook', 'computer'], relatedTerms: ['macbook pro', 'gaming laptop', 'business laptop'] },
      'macbook': { intent: 'apple laptop rental', keywords: ['macbook', 'apple', 'laptop'], categories: ['Electronics'], synonyms: ['laptop', 'computer', 'apple'], relatedTerms: ['macbook pro', 'macbook air', 'laptop'] },
      
      // Cool/awesome items
      'cool': { intent: 'interesting or trendy items', keywords: ['cool', 'awesome', 'interesting'], categories: ['Electronics', 'Photography', 'Sports'], synonyms: ['awesome', 'amazing', 'trendy', 'popular'], relatedTerms: ['camera', 'drone', 'gaming', 'tech', 'gadget'] },
      'awesome': { intent: 'impressive rental items', keywords: ['awesome', 'cool', 'amazing'], categories: ['Electronics', 'Photography', 'Sports'], synonyms: ['cool', 'amazing', 'impressive'], relatedTerms: ['camera', 'drone', 'gaming', 'sports gear'] },
      'stuff': { intent: 'general items for rent', keywords: ['items', 'things', 'stuff'], categories: ['Tools', 'Electronics', 'Sports'], synonyms: ['items', 'things', 'equipment'], relatedTerms: ['tools', 'electronics', 'gear', 'equipment'] },
      
      // Audio equipment
      'airpods': { intent: 'wireless audio equipment', keywords: ['airpods', 'headphones', 'wireless'], categories: ['Electronics'], synonyms: ['headphones', 'earbuds', 'audio'], relatedTerms: ['apple', 'wireless', 'bluetooth', 'headphones'] },
      'headphones': { intent: 'audio equipment rental', keywords: ['headphones', 'audio'], categories: ['Electronics'], synonyms: ['airpods', 'earbuds', 'headset'], relatedTerms: ['wireless', 'bluetooth', 'music', 'audio'] },
      
      // Sports equipment
      'racket': { intent: 'sports racket equipment', keywords: ['racket', 'tennis', 'sports'], categories: ['Sports'], synonyms: ['racquet', 'tennis racket'], relatedTerms: ['tennis', 'badminton', 'squash', 'sports'] },
      'rackets': { intent: 'sports racket equipment', keywords: ['rackets', 'tennis', 'sports'], categories: ['Sports'], synonyms: ['racquets', 'tennis rackets'], relatedTerms: ['tennis', 'badminton', 'squash', 'sports'] },
      'tennis': { intent: 'tennis equipment rental', keywords: ['tennis', 'racket'], categories: ['Sports'], synonyms: ['racket', 'racquet'], relatedTerms: ['tennis balls', 'court', 'sports'] },
      
      // Tools
      'drill': { intent: 'power tools for projects', keywords: ['drill', 'tool'], categories: ['Tools'], synonyms: ['power drill', 'driver'], relatedTerms: ['screwdriver', 'saw', 'hammer'] },
      'tool': { intent: 'construction and repair tools', keywords: ['tool', 'tools'], categories: ['Tools'], synonyms: ['equipment', 'instrument'], relatedTerms: ['drill', 'saw', 'hammer', 'screwdriver'] },
      'ladder': { intent: 'climbing and access equipment', keywords: ['ladder', 'climbing'], categories: ['Tools'], synonyms: ['step ladder', 'extension ladder'], relatedTerms: ['tools', 'height', 'construction', 'maintenance'] },
      
      // Bikes and transportation
      'bike': { intent: 'bicycle rental', keywords: ['bike', 'bicycle'], categories: ['Sports', 'Transportation'], synonyms: ['bicycle', 'cycle'], relatedTerms: ['mountain bike', 'road bike', 'cycling', 'exercise'] },
      'bicycle': { intent: 'bicycle rental', keywords: ['bicycle', 'bike'], categories: ['Sports', 'Transportation'], synonyms: ['bike', 'cycle'], relatedTerms: ['mountain bike', 'road bike', 'cycling', 'exercise'] },
    };
    
    // Find best match
    for (const [key, mapping] of Object.entries(semanticMappings)) {
      if (lowercaseQuery.includes(key)) {
        return mapping;
      }
    }
    
    // General fallback with basic keyword extraction
    const words = lowercaseQuery.split(' ').filter(word => word.length > 2);
    return {
      intent: `rental items related to ${query}`,
      keywords: words,
      categories: ['Electronics', 'Tools', 'Sports'],
      synonyms: words,
      relatedTerms: words
    };
  }

  // Optimized version with pre-processed lowercase strings
  async scoreItemRelevanceOptimized(items: any[], analysis: SearchAnalysis): Promise<any[]> {
    // Pre-compile search terms for faster matching
    const searchTerms = {
      keywords: analysis.keywords.map(k => k.toLowerCase()),
      synonyms: analysis.synonyms.map(s => s.toLowerCase()),
      relatedTerms: analysis.relatedTerms.map(t => t.toLowerCase()),
      categories: analysis.categories.map(c => c.toLowerCase())
    };

    const scoredItems = items.map(item => {
      let score = 0;
      let reasons = [];

      // Use pre-computed lowercase strings
      const titleLower = item.titleLower || item.title.toLowerCase();
      const descriptionLower = item.descriptionLower || item.description.toLowerCase();
      
      // Optimized keyword matching with early scoring
      for (const keyword of searchTerms.keywords) {
        if (titleLower.includes(keyword)) {
          score += 10;
          reasons.push(`Title matches "${keyword}"`);
        }
        if (descriptionLower.includes(keyword)) {
          score += 5;
          reasons.push(`Description mentions "${keyword}"`);
        }
      }

      // Only process synonyms and related terms if we don't have a high score yet
      if (score < 15) {
        // Synonym matches
        for (const synonym of searchTerms.synonyms) {
          if (titleLower.includes(synonym)) {
            score += 8;
            reasons.push(`Title matches synonym "${synonym}"`);
          }
          if (descriptionLower.includes(synonym)) {
            score += 4;
            reasons.push(`Description mentions synonym "${synonym}"`);
          }
        }

        // Related terms (only if still low score)
        if (score < 10) {
          for (const term of searchTerms.relatedTerms) {
            if (titleLower.includes(term)) {
              score += 6;
              reasons.push(`Title contains related term "${term}"`);
            }
            if (descriptionLower.includes(term)) {
              score += 3;
              reasons.push(`Description contains related term "${term}"`);
            }
          }
        }
      }

      // Category matching
      if (item.category && searchTerms.categories.some(cat => 
        item.category.name.toLowerCase().includes(cat) ||
        cat.includes(item.category.name.toLowerCase())
      )) {
        score += 5;
        reasons.push(`Category matches search intent`);
      }

      return {
        ...item,
        score,
        reason: reasons.join(', ') || 'General relevance'
      };
    });

    // Sort by score and return top matches
    return scoredItems
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  // Keep original method for backward compatibility
  async scoreItemRelevance(items: any[], analysis: SearchAnalysis): Promise<any[]> {
    const scoredItems = items.map(item => {
      let score = 0;
      let reasons = [];

      // Title matching with semantic understanding
      const titleLowercase = item.title.toLowerCase();
      const descriptionLowercase = item.description.toLowerCase();
      
      // Exact keyword matches (highest priority)
      for (const keyword of analysis.keywords) {
        if (titleLowercase.includes(keyword.toLowerCase())) {
          score += 10;
          reasons.push(`Title matches "${keyword}"`);
        }
        if (descriptionLowercase.includes(keyword.toLowerCase())) {
          score += 5;
          reasons.push(`Description mentions "${keyword}"`);
        }
      }

      // Synonym matches (high priority)
      for (const synonym of analysis.synonyms) {
        if (titleLowercase.includes(synonym.toLowerCase())) {
          score += 8;
          reasons.push(`Title matches synonym "${synonym}"`);
        }
        if (descriptionLowercase.includes(synonym.toLowerCase())) {
          score += 4;
          reasons.push(`Description mentions synonym "${synonym}"`);
        }
      }

      // Related terms (medium priority)
      for (const term of analysis.relatedTerms) {
        if (titleLowercase.includes(term.toLowerCase())) {
          score += 6;
          reasons.push(`Title contains related term "${term}"`);
        }
        if (descriptionLowercase.includes(term.toLowerCase())) {
          score += 3;
          reasons.push(`Description contains related term "${term}"`);
        }
      }

      // Category matching
      if (item.category && analysis.categories.some(cat => 
        item.category.name.toLowerCase().includes(cat.toLowerCase()) ||
        cat.toLowerCase().includes(item.category.name.toLowerCase())
      )) {
        score += 5;
        reasons.push(`Category matches search intent`);
      }

      return {
        ...item,
        score,
        reason: reasons.join(', ') || 'General relevance'
      };
    });

    // Sort by score and return top matches
    return scoredItems
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  async enhancedSearch(query: string, items: any[]): Promise<any[]> {
    try {
      console.log(`✅ AI search starting for query: "${query}"`);
      
      // Optimize: Run analysis and prepare items in parallel
      const [analysis] = await Promise.all([
        this.analyzeSearchQuery(query),
        // Pre-process items for faster scoring (run in parallel)
        Promise.resolve(items.map(item => ({
          ...item,
          titleLower: item.title.toLowerCase(),
          descriptionLower: item.description.toLowerCase()
        })))
      ]);
      
      console.log('AI Search Analysis:', analysis);
      
      // Step 2: Score items based on AI analysis (using pre-processed data)
      const scoredItems = await this.scoreItemRelevanceOptimized(items, analysis);
      
      console.log(`AI Search found ${scoredItems.length} relevant items for "${query}"`);
      
      return scoredItems;
    } catch (error) {
      console.error('Enhanced search error:', error);
      return [];
    }
  }
}

export const aiSearchService = new AISearchService();