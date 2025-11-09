import { storage } from "./storage";
import type { ItemWithDetails, UserInteraction, UserPreferences, User } from "@shared/schema";

export interface RecommendationScore {
  itemId: number;
  score: number;
  reasons: string[];
}

export interface RecommendationResult {
  items: ItemWithDetails[];
  scores: RecommendationScore[];
}

export class RecommendationEngine {
  
  // Cache for recommendations to avoid recomputing frequently
  private recommendationCache = new Map<number, { data: RecommendationResult; timestamp: number; }>();
  private readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes - longer cache
  
  // Cache for trending items (shared across users)
  private trendingCache: { data: RecommendationResult; timestamp: number } | null = null;
  private readonly TRENDING_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
  
  // Track user interactions for learning preferences
  async trackInteraction(userId: number, itemId: number, interactionType: string, weight: number = 1.0) {
    try {
      await storage.createUserInteraction({
        userId,
        itemId,
        interactionType,
        weight: weight.toString(),
      });

      // Auto-update user preferences based on interactions
      if (interactionType === 'view' && weight >= 1.0) {
        const item = await storage.getItem(itemId);
        if (item) {
          await this.updateUserPreferences(userId, item.categoryId);
        }
      }
    } catch (error) {
      console.error("Error tracking interaction:", error);
    }
  }

  // Get personalized recommendations for a user
  async getRecommendations(userId: number, limit: number = 6): Promise<RecommendationResult> {
    try {
      // Check cache first
      const cached = this.recommendationCache.get(userId);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
        console.log(`📦 Using cached recommendations for user ${userId}`);
        return {
          items: cached.data.items.slice(0, limit),
          scores: cached.data.scores.slice(0, limit)
        };
      }

      console.log(`🔄 Computing fresh recommendations for user ${userId}`);
      
      // Perform computation without timeout
      const computationPromise = this.computeRecommendations(userId, limit);
      
      try {
        return await computationPromise;
      } catch (error) {
        console.log('⚡ Falling back to simple trending items due to error');
        return await this.getTrendingItems(limit);
      }
    } catch (error) {
      console.error('Error in getRecommendations:', error);
      return await this.getTrendingItems(limit);
    }
  }

  // Separate computation method for timeout handling
  private async computeRecommendations(userId: number, limit: number): Promise<RecommendationResult> {
    // Get all data in parallel to reduce latency
    const [interactions, preferences, user, allItems] = await Promise.all([
      storage.getUserInteractions(userId),
      storage.getUserPreferences(userId),  
      storage.getUser(userId),
      storage.getItems()
    ]);
    
    // Filter available items early
    const availableItems = allItems.filter(item => item.ownerId !== userId && item.available);
    
    // If no items available, return empty result immediately
    if (availableItems.length === 0) {
      return { items: [], scores: [] };
    }
    
    // Calculate recommendation scores
    const scores = await this.calculateRecommendationScores(
      availableItems,
      interactions,
      preferences,
      user
    );
    
    // Sort by score and get top items
    const topScores = scores
      .sort((a, b) => b.score - a.score);
    
    const recommendedItems = topScores.map(score => 
      availableItems.find(item => item.id === score.itemId)!
    ).filter(Boolean);
    
    const result = {
      items: recommendedItems,
      scores: topScores,
    };
    
    // Cache the result
    this.recommendationCache.set(userId, {
      data: result,
      timestamp: Date.now()
    });
    
    console.log(`✅ Computed ${recommendedItems.length} recommendations for user ${userId}`);
    
    return {
      items: recommendedItems.slice(0, limit),
      scores: topScores.slice(0, limit)
    };
  }

  // Calculate recommendation scores based on multiple factors
  private async calculateRecommendationScores(
    items: ItemWithDetails[],
    interactions: UserInteraction[],
    preferences: UserPreferences | null,
    user: User | null
  ): Promise<RecommendationScore[]> {
    
    return items.map(item => {
      let score = 0;
      const reasons: string[] = [];
      
      // 1. Category preference based on interaction history
      const categoryInteractions = interactions.filter(i => 
        items.find(item => item.id === i.itemId)?.categoryId === item.categoryId
      );
      if (categoryInteractions.length > 0) {
        const categoryScore = Math.min(categoryInteractions.length * 0.3, 2.0);
        score += categoryScore;
        reasons.push(`Popular in ${item.category.name}`);
      }
      
      // 2. Price preference alignment
      if (preferences?.priceRangeMin && preferences?.priceRangeMax) {
        const itemPrice = parseFloat(item.price);
        const minPrice = parseFloat(preferences.priceRangeMin);
        const maxPrice = parseFloat(preferences.priceRangeMax);
        
        if (itemPrice >= minPrice && itemPrice <= maxPrice) {
          score += 1.5;
          reasons.push("Within your price range");
        } else if (itemPrice < maxPrice * 1.2) {
          score += 0.5;
          reasons.push("Near your price range");
        }
      }
      
      // 3. Location preference
      if (preferences?.preferredLocations?.includes(item.location)) {
        score += 1.0;
        reasons.push("In your preferred location");
      }
      
      // 4. Item rating and popularity
      const itemRating = parseFloat(item.rating);
      if (itemRating >= 4.0) {
        score += 1.0;
        reasons.push("Highly rated");
      } else if (itemRating >= 3.0) {
        score += 0.5;
      }
      
      // 5. Similar users' preferences (collaborative filtering)
      const similarUserBonus = this.calculateSimilarUserScore(interactions, item);
      score += similarUserBonus;
      if (similarUserBonus > 0.5) {
        reasons.push("Popular with similar users");
      }
      
      // 6. Recency and availability boost
      const createdAt = new Date(item.createdAt);
      const daysSinceCreated = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreated < 7) {
        score += 0.5;
        reasons.push("Recently listed");
      }
      
      // 7. Random factor to ensure variety
      score += Math.random() * 0.3;
      
      return {
        itemId: item.id,
        score: Math.max(score, 0.1), // Minimum score to ensure variety
        reasons,
      };
    });
  }
  
  // Calculate similarity score based on other users' interactions
  private calculateSimilarUserScore(userInteractions: UserInteraction[], item: ItemWithDetails): number {
    // Simple collaborative filtering based on item views
    const itemViewCount = userInteractions.filter(i => 
      i.itemId === item.id && i.interactionType === 'view'
    ).length;
    
    return Math.min(itemViewCount * 0.2, 1.0);
  }
  
  // Clear cache when items change
  clearCache() {
    this.recommendationCache.clear();
    this.trendingCache = null; // Clear trending cache too
    console.log('🗑️ Recommendations and trending cache cleared');
  }
  
  // Fallback to trending items when personalization fails (optimized with caching)
  private async getTrendingItems(limit: number): Promise<RecommendationResult> {
    try {
      // Check trending cache first
      if (this.trendingCache && (Date.now() - this.trendingCache.timestamp) < this.TRENDING_CACHE_DURATION) {
        console.log(`⚡ Using cached trending items`);
        return {
          items: this.trendingCache.data.items.slice(0, limit),
          scores: this.trendingCache.data.scores.slice(0, limit)
        };
      }

      console.log('🔥 Computing fresh trending items');
      const items = await storage.getItems();
      const availableItems = items.filter(item => item.available);
      
      // Quick trending algorithm - sort by rating and recent activity
      const trending = availableItems
        .sort((a, b) => {
          const scoreA = parseFloat(a.rating) * a.reviewCount;
          const scoreB = parseFloat(b.rating) * b.reviewCount;
          return scoreB - scoreA;
        })
        .slice(0, Math.max(limit, 12)); // Cache extra items for different limits
      
      const scores = trending.map((item, index) => ({
        itemId: item.id,
        score: Math.max(limit - index, 1),
        reasons: ["Trending item"],
      }));
      
      const result = { items: trending, scores };
      
      // Cache the trending result
      this.trendingCache = {
        data: result,
        timestamp: Date.now()
      };
      
      return {
        items: result.items.slice(0, limit),
        scores: result.scores.slice(0, limit)
      };
    } catch (error) {
      console.error("Error getting trending items:", error);
      return { items: [], scores: [] };
    }
  }
  
  // Update user preferences based on interactions
  async updateUserPreferences(userId: number, categoryId?: number, priceRange?: { min: number; max: number }, location?: string) {
    try {
      const existingPrefs = await storage.getUserPreferences(userId);
      
      let preferredCategories = existingPrefs?.preferredCategories || [];
      let preferredLocations = existingPrefs?.preferredLocations || [];
      
      // Add category if not already preferred
      if (categoryId && !preferredCategories.includes(categoryId)) {
        preferredCategories = [...preferredCategories, categoryId].slice(-5); // Keep last 5
      }
      
      // Add location if not already preferred
      if (location && !preferredLocations.includes(location)) {
        preferredLocations = [...preferredLocations, location].slice(-5); // Keep last 5
      }
      
      const preferencesData = {
        userId,
        preferredCategories,
        priceRangeMin: priceRange?.min.toString() || existingPrefs?.priceRangeMin || "0",
        priceRangeMax: priceRange?.max.toString() || existingPrefs?.priceRangeMax || "1000",
        preferredLocations,
      };
      
      if (existingPrefs) {
        await storage.updateUserPreferences(userId, preferencesData);
      } else {
        await storage.createUserPreferences(preferencesData);
      }
    } catch (error) {
      console.error("Error updating user preferences:", error);
    }
  }
}

export const recommendationEngine = new RecommendationEngine();