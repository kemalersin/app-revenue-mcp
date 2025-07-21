#!/usr/bin/env node

/**
 * MIT License
 * 
 * Copyright (c) 2024 Insightly
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import store from '@jeromyfu/app-store-scraper';
import gplay from '@jeromyfu/google-play-scraper';
import { z } from 'zod';

// Cache for Sensor Tower API responses (in-memory cache)
const sensorTowerCache = new Map();
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

// Helper function for Sensor Tower API calls with caching and rate limiting
async function callSensorTowerAPI(endpoint, cacheKey, country = null) {
  // Add country parameter to cache key if provided
  const finalCacheKey = country ? `${cacheKey}_${country}` : cacheKey;
  
  // Check cache first
  const cached = sensorTowerCache.get(finalCacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Add country parameter to endpoint if provided
    const finalEndpoint = country ? `${endpoint}?country=${country}` : endpoint;
    
    const response = await fetch(finalEndpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Cache the response
    sensorTowerCache.set(finalCacheKey, {
      data: data,
      timestamp: Date.now()
    });

    return data;
  } catch (error) {
    if (error.message.includes('Rate limit')) {
      throw error;
    }
    throw new Error(`Failed to fetch data from Sensor Tower: ${error.message}`);
  }
}

// Helper function to extract essential revenue data
function extractEssentialRevenueData(rawData, platform, identifier) {
  if (!rawData) return null;

  try {
    const essential = {
      app_info: {
        id: platform === 'ios' ? rawData.app_id : rawData.package_name || identifier,
        name: rawData.name || rawData.title,
        publisher: rawData.publisher_name || rawData.developer,
        platform: platform,
        category: rawData.categories?.[0]?.name || 'Unknown',
        content_rating: rawData.content_rating,
        current_version: rawData.current_version
      },
      revenue_metrics: {
        last_month_revenue: rawData.worldwide_last_month_revenue?.value || 0,
        last_month_downloads: rawData.worldwide_last_month_downloads?.value || 0,
        revenue_currency: rawData.worldwide_last_month_revenue?.currency || 'USD',
        revenue_formatted: formatRevenue(rawData.worldwide_last_month_revenue?.value || 0)
      },
      market_position: {
        overall_rating: rawData.rating || rawData.score,
        rating_count: rawData.rating_count || rawData.reviews,
        top_countries: rawData.top_countries?.slice(0, 3) || [],
        category_rankings: extractCategoryRankings(rawData.category_rankings, platform)
      },
      monetization: {
        price: rawData.price?.string_value || rawData.priceText || 'Free',
        has_in_app_purchases: rawData.has_in_app_purchases || rawData.offersIAP || false,
        top_iap_prices: extractTopIAPPrices(rawData.top_in_app_purchases)
      },
      competitive_analysis: {
        related_apps_count: rawData.related_apps?.length || 0,
        top_competitors: rawData.related_apps?.slice(0, 3)?.map(app => ({
          name: app.name || app.title,
          rating: app.rating || app.score,
          price: app.price?.string_value || app.priceText || 'Free'
        })) || []
      }
    };

    return essential;
  } catch (error) {
    return {
      error: `Failed to extract data: ${error.message}`,
      raw_data_available: !!rawData
    };
  }
}

// Helper function to format revenue
function formatRevenue(cents) {
  if (!cents || cents === 0) return '$0';
  const dollars = cents / 100;
  if (dollars >= 1000000) {
    return `$${(dollars / 1000000).toFixed(1)}M`;
  } else if (dollars >= 1000) {
    return `$${(dollars / 1000).toFixed(1)}K`;
  }
  return `$${dollars.toLocaleString()}`;
}

// Helper function to extract category rankings
function extractCategoryRankings(rankings, platform) {
  if (!rankings) return {};
  
  try {
    const deviceType = platform === 'ios' ? 'iphone' : 'phone';
    const deviceRankings = rankings[deviceType] || rankings;
    
    return {
      top_free: deviceRankings?.top_free?.primary_categories?.[0] || null,
      top_grossing: deviceRankings?.top_grossing?.primary_categories?.[0] || null,
      top_paid: deviceRankings?.top_paid?.primary_categories?.[0] || null
    };
  } catch (error) {
    return {};
  }
}

// Helper function to extract top IAP prices
function extractTopIAPPrices(iapData) {
  if (!iapData) return [];
  
  try {
    const prices = [];
    if (iapData.US) {
      prices.push(...iapData.US.slice(0, 3).map(iap => iap.price));
    }
    return [...new Set(prices)]; // Remove duplicates
  } catch (error) {
    return [];
  }
}

const server = new McpServer({
  name: "app-info-scraper",
  version: "1.0.0"
});

// App Store Tools
server.tool("app-store-search", 
  "Search for apps on the App Store. Returns a list of apps with the following fields:\n" +
  "- id: App Store ID number\n" +
  "- appId: Bundle ID (e.g. 'com.company.app')\n" +
  "- title: App name\n" +
  "- icon: Icon image URL\n" +
  "- url: App Store URL\n" +
  "- price: Price in USD\n" +
  "- currency: Price currency code\n" +
  "- free: Boolean indicating if app is free\n" +
  "- description: App description\n" +
  "- developer: Developer name\n" +
  "- developerUrl: Developer's App Store URL\n" +
  "- developerId: Developer's ID\n" +
  "- genre: App category name\n" +
  "- genreId: Category ID\n" +
  "- released: Release date (ISO string)",
  {
    term: z.string().describe("Search term (required)"),
    num: z.number().default(50).describe("Number of results to retrieve (default: 50)"),
    page: z.number().default(1).describe("Page of results to retrieve (default: 1)"),
    country: z.string().default("us").describe("Two letter country code (default: us)"),
    lang: z.string().default("en-us").describe("Language code for result text (default: en-us)"),
    idsOnly: z.boolean().default(false).describe("Skip extra lookup request. Returns array of application IDs only (default: false)")
  }, 
  async ({ term, num, page, country, lang, idsOnly }) => {
    const results = await store.search({ term, num, page, country, lang, idsOnly });
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

server.tool("app-store-details", 
  "Get detailed information about an App Store app. Returns an object with:\n" +
  "- id: App Store ID number\n" +
  "- appId: Bundle ID (e.g. 'com.company.app')\n" +
  "- title: App name\n" +
  "- url: App Store URL\n" +
  "- description: Full app description\n" +
  "- icon: Icon URL\n" +
  "- genres: Array of category names\n" +
  "- genreIds: Array of category IDs\n" +
  "- primaryGenre: Main category name\n" +
  "- primaryGenreId: Main category ID\n" +
  "- contentRating: Content rating (e.g. '4+')\n" +
  "- languages: Array of language codes\n" +
  "- size: App size in bytes\n" +
  "- requiredOsVersion: Minimum iOS version required\n" +
  "- released: Initial release date (ISO string)\n" +
  "- updated: Last update date (ISO string)\n" +
  "- releaseNotes: Latest version changes\n" +
  "- version: Current version string\n" +
  "- price: Price in USD\n" +
  "- currency: Price currency code\n" +
  "- free: Boolean indicating if app is free\n" +
  "- developerId: Developer's ID\n" +
  "- developer: Developer name\n" +
  "- developerUrl: Developer's App Store URL\n" +
  "- developerWebsite: Developer's website URL if available\n" +
  "- score: Current rating (0-5)\n" +
  "- reviews: Total number of ratings\n" +
  "- currentVersionScore: Current version rating (0-5)\n" +
  "- currentVersionReviews: Current version review count\n" +
  "- screenshots: Array of screenshot URLs\n" +
  "- ipadScreenshots: Array of iPad screenshot URLs\n" +
  "- appletvScreenshots: Array of Apple TV screenshot URLs\n" +
  "- supportedDevices: Array of supported device IDs\n" +
  "- ratings: Total number of ratings (when ratings option enabled)\n" +
  "- histogram: Rating distribution by star level (when ratings option enabled)",
  {
    id: z.number().optional().describe("Numeric App ID (e.g., 553834731). Either this or appId must be provided."),
    appId: z.string().optional().describe("Bundle ID (e.g., 'com.midasplayer.apps.candycrushsaga'). Either this or id must be provided."), 
    country: z.string().default("us").describe("Country code to get app details from (default: us). Also affects data language."),
    lang: z.string().optional().describe("Language code for result text. If not provided, uses country-specific language."),
    ratings: z.boolean().optional().default(false).describe("Load additional ratings information like ratings count and histogram")
  },
  async ({ id, appId, country, lang, ratings }) => {
    const details = await store.app({ id, appId, country, lang, ratings });
    return { content: [{ type: "text", text: JSON.stringify(details) }] };
  }
);

server.tool("app-store-reviews", 
  "Get reviews for an App Store app. Returns an array of reviews with:\n" +
  "- id: Review ID\n" +
  "- userName: Reviewer's name\n" +
  "- userUrl: Reviewer's profile URL\n" +
  "- version: App version reviewed\n" +
  "- score: Rating (1-5)\n" +
  "- title: Review title\n" +
  "- text: Review content\n" +
  "- url: Review URL\n" +
  "- updated: Review date (ISO string)",
  {
    id: z.number().optional().describe("Numeric App ID (e.g., 553834731). Either this or appId must be provided."),
    appId: z.string().optional().describe("Bundle ID (e.g., 'com.midasplayer.apps.candycrushsaga'). Either this or id must be provided."),
    country: z.string().default("us").describe("Country code to get reviews from (default: us)"),
    page: z.number().min(1).max(10).default(1).describe("Page number to retrieve (default: 1, max: 10)"),
    sort: z.enum(["recent", "helpful"]).default("recent").describe("Sort order (recent or helpful)")
  }, 
  async ({ id, appId, country, page, sort }) => {
    const reviews = await store.reviews({
      id,
      appId, 
      country,
      page,
      sort: sort === "helpful" ? store.sort.HELPFUL : store.sort.RECENT
    });
    return { content: [{ type: "text", text: JSON.stringify(reviews) }] };
  }
);

server.tool("app-store-similar", 
  "Get similar apps ('customers also bought') from the App Store. Returns a list of apps with:\n" +
  "- id: App Store ID number\n" +
  "- appId: Bundle ID (e.g. 'com.company.app')\n" +
  "- title: App name\n" + 
  "- icon: Icon image URL\n" +
  "- url: App Store URL\n" +
  "- price: Price in USD\n" +
  "- currency: Price currency code\n" +
  "- free: Boolean indicating if app is free\n" +
  "- description: App description\n" +
  "- developer: Developer name\n" +
  "- developerUrl: Developer's App Store URL\n" +
  "- developerId: Developer's ID\n" +
  "- genre: App category name\n" +
  "- genreId: Category ID\n" +
  "- released: Release date (ISO string)",
  {
    id: z.number().optional().describe("Numeric App ID (e.g., 553834731). Either this or appId must be provided."),
    appId: z.string().optional().describe("Bundle ID (e.g., 'com.midasplayer.apps.candycrushsaga'). Either this or id must be provided.")
  }, 
  async ({ id, appId }) => {
    const similar = await store.similar({ id, appId });
    return { content: [{ type: "text", text: JSON.stringify(similar) }] };
  }
);

// Additional App Store Tools
server.tool("app-store-developer", 
  "Get apps by a developer on the App Store. Returns a list of apps with:\n" +
  "- id: App Store ID number\n" +
  "- appId: Bundle ID (e.g. 'com.company.app')\n" +
  "- title: App name\n" + 
  "- icon: Icon image URL\n" +
  "- url: App Store URL\n" +
  "- price: Price in USD\n" +
  "- currency: Price currency code\n" +
  "- free: Boolean indicating if app is free\n" +
  "- description: App description\n" +
  "- developer: Developer name\n" +
  "- developerUrl: Developer's App Store URL\n" +
  "- developerId: Developer's ID\n" +
  "- genre: App category name\n" +
  "- genreId: Category ID\n" +
  "- released: Release date (ISO string)",
  {
    devId: z.string().describe("iTunes artist ID of the developer (e.g., 284882218 for Facebook)"),
    country: z.string().default("us").describe("Country code to get app details from (default: us). Also affects data language."),
    lang: z.string().optional().describe("Language code for result text. If not provided, uses country-specific language.")
  }, 
  async ({ devId, country, lang }) => {
    const apps = await store.developer({ devId, country, lang });
    return { content: [{ type: "text", text: JSON.stringify(apps) }] };
  }
);

server.tool("app-store-suggest", 
  "Get search suggestions from the App Store. Returns an array of objects with:\n" +
  "- term: Suggested search term\n" +
  "Each suggestion has a priority from 0 (low traffic) to 10000 (most searched)",
  {
    term: z.string().describe("Search term to get suggestions for")
  }, 
  async ({ term, country }) => {
    const suggestions = await store.suggest({ term });
    return { content: [{ type: "text", text: JSON.stringify(suggestions) }] };
  }
);

server.tool("app-store-ratings", 
  "Get ratings for an App Store app. Returns an object with:\n" +
  "- ratings: Total number of ratings\n" +
  "- histogram: Distribution of ratings by star level (1-5)",
  {
    id: z.number().optional().describe("Numeric App ID (e.g., 553834731). Either this or appId must be provided."),
    appId: z.string().optional().describe("Bundle ID (e.g., 'com.midasplayer.apps.candycrushsaga'). Either this or id must be provided."),
    country: z.string().default("us").describe("Country code to get ratings from (default: us)")
  }, 
  async ({ id, appId, country }) => {
    const ratings = await store.ratings({ id, appId, country });
    return { content: [{ type: "text", text: JSON.stringify(ratings) }] };
  }
);

server.tool("app-store-version-history", 
  "Get version history for an App Store app. Returns an array of versions with:\n" +
  "- versionDisplay: Version number string\n" +
  "- releaseNotes: Update description\n" +
  "- releaseDate: Release date (YYYY-MM-DD)\n" +
  "- releaseTimestamp: Release date and time (ISO string)",
  {
    id: z.number().describe("Numeric App ID (e.g., 444934666)")
  }, 
  async ({ id }) => {
    const history = await store.versionHistory({ id });
    return { content: [{ type: "text", text: JSON.stringify(history) }] };
  }
);

server.tool("app-store-privacy", 
  "Get privacy details for an App Store app. Returns an object with:\n" +
  "- managePrivacyChoicesUrl: URL to manage privacy choices (if available)\n" +
  "- privacyTypes: Array of privacy data types, each containing:\n" +
  "  - privacyType: Name of the privacy category\n" +
  "  - identifier: Unique identifier for the privacy type\n" +
  "  - description: Detailed description of how data is used\n" +
  "  - dataCategories: Array of data categories, each containing:\n" +
  "    - dataCategory: Category name\n" +
  "    - identifier: Category identifier\n" +
  "    - dataTypes: Array of specific data types collected\n" +
  "  - purposes: Array of purposes for data collection\n" +
  "Note: Currently only available for US App Store.",
  {
    id: z.number().describe("Numeric App ID (e.g., 553834731)")
  },
  async ({ id }) => {
    const privacy = await store.privacy({ id });
    return { content: [{ type: "text", text: JSON.stringify(privacy) }] };
  }
);

server.tool("app-store-list", 
  "Get apps from iTunes collections. Returns a list of apps with:\n" +
  "- id: App Store ID number\n" +
  "- appId: Bundle ID (e.g. 'com.company.app')\n" +
  "- title: App name\n" +
  "- icon: Icon image URL\n" +
  "- url: App Store URL\n" +
  "- price: Price in USD\n" +
  "- currency: Price currency code\n" +
  "- free: Boolean indicating if app is free\n" +
  "- description: App description\n" +
  "- developer: Developer name\n" +
  "- developerUrl: Developer's App Store URL\n" +
  "- developerId: Developer's ID\n" +
  "- genre: App category name\n" +
  "- genreId: Category ID\n" +
  "- released: Release date (ISO string)",
  {
    collection: z.enum([
      'newapplications',
      'newfreeapplications',
      'newpaidapplications',
      'topfreeapplications',
      'topfreeipadapplications',
      'topgrossingapplications',
      'topgrossingipadapplications',
      'toppaidapplications',
      'toppaidipadapplications'
    ]).describe(
      "Collection to fetch from. Available collections:\n" +
      "- newapplications: New iOS applications\n" +
      "- newfreeapplications: New free iOS applications\n" +
      "- newpaidapplications: New paid iOS applications\n" +
      "- topfreeapplications: Top free iOS applications\n" +
      "- topfreeipadapplications: Top free iPad applications\n" +
      "- topgrossingapplications: Top grossing iOS applications\n" +
      "- topgrossingipadapplications: Top grossing iPad applications\n" +
      "- toppaidapplications: Top paid iOS applications\n" +
      "- toppaidipadapplications: Top paid iPad applications"
    ),
    category: z.number().optional().describe(
      "Category ID to filter by. Available categories:\n" +
      "Main Categories:\n" +
      "- 6000: BUSINESS\n" +
      "- 6001: WEATHER\n" +
      "- 6002: UTILITIES\n" +
      "- 6003: TRAVEL\n" +
      "- 6004: SPORTS\n" +
      "- 6005: SOCIAL_NETWORKING\n" +
      "- 6006: REFERENCE\n" +
      "- 6007: PRODUCTIVITY\n" +
      "- 6008: PHOTO_AND_VIDEO\n" +
      "- 6009: NEWS\n" +
      "- 6010: NAVIGATION\n" +
      "- 6011: MUSIC\n" +
      "- 6012: LIFESTYLE\n" +
      "- 6013: HEALTH_AND_FITNESS\n" +
      "- 6014: GAMES\n" +
      "- 6015: FINANCE\n" +
      "- 6016: ENTERTAINMENT\n" +
      "- 6017: EDUCATION\n" +
      "- 6018: BOOKS\n" +
      "- 6020: MEDICAL\n" +
      "- 6021: MAGAZINES_AND_NEWSPAPERS\n" +
      "- 6022: CATALOGS\n" +
      "- 6023: FOOD_AND_DRINK\n" +
      "- 6024: SHOPPING\n\n" +
      "Games Subcategories:\n" +
      "- 7001: ACTION\n" +
      "- 7002: ADVENTURE\n" +
      "- 7003: ARCADE\n" +
      "- 7004: BOARD\n" +
      "- 7005: CARD\n" +
      "- 7006: CASINO\n" +
      "- 7007: DICE\n" +
      "- 7008: EDUCATIONAL\n" +
      "- 7009: FAMILY\n" +
      "- 7011: MUSIC\n" +
      "- 7012: PUZZLE\n" +
      "- 7013: RACING\n" +
      "- 7014: ROLE_PLAYING\n" +
      "- 7015: SIMULATION\n" +
      "- 7016: SPORTS\n" +
      "- 7017: STRATEGY\n" +
      "- 7018: TRIVIA\n" +
      "- 7019: WORD\n\n" +
      "Magazine Subcategories:\n" +
      "- 13001: POLITICS\n" +
      "- 13002: FASHION\n" +
      "- 13003: HOME\n" +
      "- 13004: OUTDOORS\n" +
      "- 13005: SPORTS\n" +
      "- 13006: AUTOMOTIVE\n" +
      "- 13007: ARTS\n" +
      "- 13008: WEDDINGS\n" +
      "- 13009: BUSINESS\n" +
      "- 13010: CHILDREN\n" +
      "- 13011: COMPUTER\n" +
      "- 13012: FOOD\n" +
      "- 13013: CRAFTS\n" +
      "- 13014: ELECTRONICS\n" +
      "- 13015: ENTERTAINMENT\n" +
      "- 13017: HEALTH\n" +
      "- 13018: HISTORY\n" +
      "- 13019: LITERARY\n" +
      "- 13020: MEN\n" +
      "- 13021: MOVIES_AND_MUSIC\n" +
      "- 13023: FAMILY\n" +
      "- 13024: PETS\n" +
      "- 13025: PROFESSIONAL\n" +
      "- 13026: REGIONAL\n" +
      "- 13027: SCIENCE\n" +
      "- 13028: TEENS\n" +
      "- 13029: TRAVEL\n" +
      "- 13030: WOMEN"
    ),
    lang: z.string().optional().describe("Language code for result text. If not provided, uses country-specific language."),
    fullDetail: z.boolean().default(false).describe("Get full app details including ratings, reviews etc (default: false)"),
    country: z.string().default("us").describe("Country code (default: us)"),
    num: z.number().max(200).default(50).describe("Number of results (default: 50, max: 200)")
  }, 
  async ({ collection, category, country, num, lang, fullDetail }) => {
    const results = await store.list({ collection, category, country, num, lang, fullDetail });
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

// Google Play Tools
server.tool("google-play-search", 
  "Search for apps on Google Play. Returns a list of apps with:\n" +
  "- title: App name\n" +
  "- appId: Package name (e.g. 'com.company.app')\n" +
  "- url: Play Store URL\n" +
  "- icon: Icon image URL\n" +
  "- developer: Developer name\n" +
  "- developerId: Developer ID\n" +
  "- priceText: Price display text\n" +
  "- free: Boolean indicating if app is free\n" +
  "- summary: Short description\n" +
  "- scoreText: Rating display text\n" +
  "- score: Rating (0-5)",
  {
    term: z.string().describe("Search term to query apps"),
    price: z.enum(["all", "free", "paid"]).default("all").describe("Filter by price: all, free, or paid (default: all)"),
    num: z.number().default(20).describe("Number of results to retrieve (default: 20, max: 250)"),
    lang: z.string().default("en").describe("Language code for result text (default: en)"), 
    country: z.string().default("us").describe("Country code to get results from (default: us)"),
    fullDetail: z.boolean().default(false).describe("Include full app details in results (default: false)")
  }, 
  async ({ term, price, num, lang, country, fullDetail }) => {
    const results = await gplay.search({ term, price, num, lang, country, fullDetail });
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

server.tool("google-play-details", 
  "Get detailed information about a Google Play app. Returns an object with:\n" +
  "- title: App name\n" +
  "- description: Full app description\n" +
  "- descriptionHTML: Description with HTML formatting\n" +
  "- summary: Short description\n" +
  "- installs: Install count range\n" +
  "- minInstalls: Minimum install count\n" +
  "- maxInstalls: Maximum install count\n" +
  "- score: Average rating (0-5)\n" +
  "- scoreText: Rating display text\n" +
  "- ratings: Total number of ratings\n" +
  "- reviews: Total number of reviews\n" +
  "- histogram: Rating distribution by star level\n" +
  "- price: Price in local currency\n" +
  "- free: Boolean indicating if app is free\n" +
  "- currency: Price currency code\n" +
  "- priceText: Formatted price string\n" +
  "- offersIAP: Boolean indicating in-app purchases\n" +
  "- IAPRange: Price range for in-app purchases\n" +
  "- androidVersion: Minimum Android version required\n" +
  "- androidVersionText: Formatted Android version text\n" +
  "- developer: Developer name\n" +
  "- developerId: Developer ID\n" +
  "- developerEmail: Developer contact email\n" +
  "- developerWebsite: Developer website URL\n" +
  "- developerAddress: Developer physical address\n" +
  "- genre: App category\n" +
  "- genreId: Category ID\n" +
  "- icon: Icon URL\n" +
  "- headerImage: Feature graphic URL\n" +
  "- screenshots: Array of screenshot URLs\n" +
  "- contentRating: Content rating (e.g. 'Everyone')\n" +
  "- contentRatingDescription: Content rating details\n" +
  "- adSupported: Boolean indicating if app shows ads\n" +
  "- released: Release date\n" +
  "- updated: Last update date\n" +
  "- version: Current version string\n" +
  "- recentChanges: Latest version changes\n" +
  "- preregister: Boolean indicating if app is in pre-registration\n" +
  "- editorsChoice: Boolean indicating Editor's Choice status\n" +
  "- features: Array of special features",
  {
    appId: z.string().describe("Google Play package name (e.g., 'com.google.android.apps.translate')"),
    lang: z.string().default("en").describe("Language code for result text (default: en)"),
    country: z.string().default("us").describe("Country code to check app availability (default: us)")
  }, 
  async ({ appId, lang, country }) => {
    const details = await gplay.app({ appId, lang, country });
    return { content: [{ type: "text", text: JSON.stringify(details) }] };
  }
);

server.tool("google-play-reviews", 
  "Get reviews for a Google Play app. Returns an array of reviews with:\n" +
  "- id: Review ID string\n" +
  "- userName: Reviewer's name\n" +
  "- userImage: Reviewer's profile image URL\n" +
  "- date: Review date (ISO string)\n" +
  "- score: Rating (1-5)\n" +
  "- scoreText: Rating display text\n" +
  "- title: Review title\n" +
  "- text: Review content\n" +
  "- url: Review URL\n" +
  "- version: App version reviewed\n" +
  "- thumbsUp: Number of thumbs up votes\n" +
  "- replyDate: Developer reply date (if any)\n" +
  "- replyText: Developer reply content (if any)\n" +
  "- criterias: Array of rating criteria (if any)\n" +
  "\nNote: Reviews are returned in the specified language. The total review count\n" +
  "shown in Google Play refers to ratings, not written reviews.",
  {
    appId: z.string().describe("Package name of the app (e.g., 'com.mojang.minecraftpe')"),
    lang: z.string().default("en").describe("Language code for reviews (default: en)"),
    country: z.string().default("us").describe("Country code (default: us)"),
    sort: z.enum(["newest", "rating", "helpfulness"]).default("newest")
      .describe("Sort order: newest, rating, or helpfulness (default: newest)"),
    num: z.number().default(100).describe("Number of reviews to retrieve (default: 100). Ignored if paginate is true."),
    paginate: z.boolean().default(false).describe("Enable pagination with 150 reviews per page"),
    nextPaginationToken: z.string().optional().describe("Token for fetching next page of reviews")
  }, 
  async ({ appId, lang, country, sort, num, paginate, nextPaginationToken }) => {
    const sortMap = {
      newest: gplay.sort.NEWEST,
      rating: gplay.sort.RATING,
      helpfulness: gplay.sort.HELPFULNESS
    };

    const reviews = await gplay.reviews({
      appId,
      lang,
      country,
      sort: sortMap[sort],
      num,
      paginate,
      nextPaginationToken
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          reviews: reviews.data,
          nextPage: reviews.nextPaginationToken
        })
      }] 
    };
  }
);

server.tool("google-play-similar", 
  "Get similar apps from Google Play. Returns a list of apps with:\n" +
  "- url: Play Store URL\n" +
  "- appId: Package name (e.g. 'com.company.app')\n" +
  "- summary: Short description\n" +
  "- developer: Developer name\n" +
  "- developerId: Developer ID\n" +
  "- icon: Icon image URL\n" +
  "- score: Rating (0-5)\n" +
  "- scoreText: Rating display text\n" +
  "- priceText: Price display text\n" +
  "- free: Boolean indicating if app is free\n",
  {
    appId: z.string().describe("Google Play package name (e.g., 'com.dxco.pandavszombies')"),
    lang: z.string().default("en").describe("Language code for result text (default: en)"),
    country: z.string().default("us").describe("Country code to get results from (default: us)"),
    fullDetail: z.boolean().default(false).describe("Include full app details in results (default: false), If fullDetail is true, includes all fields from app details endpoint.")
  }, 
  async ({ appId, lang, country, fullDetail }) => {
    const similar = await gplay.similar({ appId, lang, country, fullDetail });
    return { content: [{ type: "text", text: JSON.stringify(similar) }] };
  }
);

// Additional Google Play Tools
server.tool("google-play-developer", 
  "Get apps by a developer on Google Play. Returns a list of apps with:\n" +
  "- url: Play Store URL\n" +
  "- appId: Package name (e.g. 'com.company.app')\n" +
  "- title: App name\n" +
  "- summary: Short app description\n" +
  "- developer: Developer name\n" +
  "- developerId: Developer ID\n" +
  "- icon: Icon image URL\n" +
  "- score: Rating (0-5)\n" +
  "- scoreText: Rating display text\n" +
  "- priceText: Price display text\n" +
  "- free: Boolean indicating if app is free\n",
  {
    devId: z.string().describe("Developer name (e.g., 'DxCo Games')"),
    lang: z.string().default("en").describe("Language code for result text (default: en)"),
    country: z.string().default("us").describe("Country code to get results from (default: us)"),
    num: z.number().default(60).describe("Number of results to retrieve (default: 60)"),
    fullDetail: z.boolean().default(false).describe("Include full app details in results (default: false), If fullDetail is true, includes all fields from app details endpoint.")
  }, 
  async ({ devId, lang, country, num, fullDetail }) => {
    const apps = await gplay.developer({ devId, lang, country, num, fullDetail });
    return { content: [{ type: "text", text: JSON.stringify(apps) }] };
  }
);

server.tool("google-play-suggest", 
  "Get search suggestions from Google Play. Returns an array of suggested search terms (up to 5).\n" +
  "Sample response: ['panda pop', 'panda', 'panda games', 'panda run', 'panda pop for free']",
  {
    term: z.string().describe("Search term to get suggestions for (e.g., 'panda')"),
    lang: z.string().default("en").describe("Language code for suggestions (default: en)"),
    country: z.string().default("us").describe("Country code to get suggestions from (default: us)")
  }, 
  async ({ term, lang, country }) => {
    const suggestions = await gplay.suggest({ term, lang, country });
    // API returns array of strings directly
    return { content: [{ type: "text", text: JSON.stringify(suggestions) }] };
  }
);

server.tool("google-play-permissions", 
  "Get permissions required by a Google Play app. Returns a list of permissions with:\n" +
  "- permission: Description of the permission (e.g., 'modify storage contents')\n" +
  "- type: Permission category (e.g., 'Storage', 'Network')\n\n" +
  "When short=true, returns just an array of permission strings.\n" +
  "Note: Permissions are returned in the specified language.",
  {
    appId: z.string().describe("Google Play package name (e.g., 'com.dxco.pandavszombies')"),
    lang: z.string().default("en").describe("Language code for permission text (default: en)"),
    country: z.string().default("us").describe("Country code to check app (default: us)"),
    short: z.boolean().default(false).describe("Return only permission names without categories (default: false)")
  }, 
  async ({ appId, lang, country, short }) => {
    const permissions = await gplay.permissions({ appId, lang, country, short });
    return { content: [{ type: "text", text: JSON.stringify(permissions) }] };
  }
);

server.tool("google-play-datasafety", 
  "Get data safety information for a Google Play app. Returns an object with:\n" +
  "- dataShared: Array of shared data items, each containing:\n" +
  "  - data: Name of the data being shared (e.g., 'User IDs')\n" +
  "  - optional: Boolean indicating if sharing is optional\n" +
  "  - purpose: Comma-separated list of purposes (e.g., 'Analytics, Marketing')\n" +
  "  - type: Category of data (e.g., 'Personal info')\n" +
  "- dataCollected: Array of collected data items with same structure as dataShared\n" +
  "- securityPractices: Array of security practices, each containing:\n" +
  "  - practice: Name of the security practice\n" +
  "  - description: Detailed description of the practice\n" +
  "- privacyPolicyUrl: URL to the app's privacy policy\n\n" +
  "Data types can include: Personal info, Financial info, Messages, Contacts,\n" +
  "App activity, App info and performance, Device or other IDs",
  {
    appId: z.string().describe("Google Play package name (e.g., 'com.dxco.pandavszombies')"),
    lang: z.string().default("en").describe("Language code for data safety info (default: en)")
  }, 
  async ({ appId, lang }) => {
    const datasafety = await gplay.datasafety({ appId, lang });
    return { content: [{ type: "text", text: JSON.stringify(datasafety) }] };
  }
);

server.tool("google-play-categories", 
  "Get list of all Google Play categories. Returns an array of category identifiers like:\n" +
  "- 'APPLICATION': All applications\n" +
  "- 'GAME': All games\n" +
  "- 'ANDROID_WEAR': Wear OS apps\n" +
  "- 'SOCIAL': Social apps\n" +
  "- 'PRODUCTIVITY': Productivity apps\n" +
  "etc.\n\n" +
  "These category IDs can be used with the google-play-list tool to filter apps by category.\n" +
  "Sample response: ['AUTO_AND_VEHICLES', 'LIBRARIES_AND_DEMO', 'LIFESTYLE', ...]",
  {}, // No parameters needed
  async () => {
    const categories = await gplay.categories();
    return { content: [{ type: "text", text: JSON.stringify(categories) }] };
  }
);

server.tool("google-play-list", 
  "Get apps from Google Play collections. Returns a list of apps with:\n" +
  "- url: Play Store URL\n" +
  "- appId: Package name (e.g., 'com.company.app')\n" +
  "- title: App name\n" +
  "- summary: Short description\n" +
  "- developer: Developer name\n" +
  "- developerId: Developer ID\n" +
  "- icon: Icon URL\n" +
  "- score: Rating (0-5)\n" +
  "- scoreText: Rating display text\n" +
  "- priceText: Price display text\n" +
  "- free: Boolean indicating if app is free\n\n" +
  "When fullDetail is true, includes all fields from app details endpoint.",
  {
    collection: z.enum(['TOP_FREE', 'TOP_PAID', 'GROSSING', 'TOP_FREE_GAMES', 'TOP_PAID_GAMES', 'TOP_GROSSING_GAMES'])
      .default('TOP_FREE')
      .describe(
        "Collection to fetch apps from (default: TOP_FREE). Available collections:\n" +
        "- TOP_FREE: Top free applications\n" +
        "- TOP_PAID: Top paid applications\n" +
        "- GROSSING: Top grossing applications"
      ),
    category: z.enum([
      'APPLICATION',
      'ANDROID_WEAR',
      'ART_AND_DESIGN',
      'AUTO_AND_VEHICLES',
      'BEAUTY',
      'BOOKS_AND_REFERENCE',
      'BUSINESS',
      'COMICS',
      'COMMUNICATION',
      'DATING',
      'EDUCATION',
      'ENTERTAINMENT',
      'EVENTS',
      'FINANCE',
      'FOOD_AND_DRINK',
      'HEALTH_AND_FITNESS',
      'HOUSE_AND_HOME',
      'LIBRARIES_AND_DEMO',
      'LIFESTYLE',
      'MAPS_AND_NAVIGATION',
      'MEDICAL',
      'MUSIC_AND_AUDIO',
      'NEWS_AND_MAGAZINES',
      'PARENTING',
      'PERSONALIZATION',
      'PHOTOGRAPHY',
      'PRODUCTIVITY',
      'SHOPPING',
      'SOCIAL',
      'SPORTS',
      'TOOLS',
      'TRAVEL_AND_LOCAL',
      'VIDEO_PLAYERS',
      'WATCH_FACE',
      'WEATHER',
      'GAME',
      'GAME_ACTION',
      'GAME_ADVENTURE',
      'GAME_ARCADE',
      'GAME_BOARD',
      'GAME_CARD',
      'GAME_CASINO',
      'GAME_CASUAL',
      'GAME_EDUCATIONAL',
      'GAME_MUSIC',
      'GAME_PUZZLE',
      'GAME_RACING',
      'GAME_ROLE_PLAYING',
      'GAME_SIMULATION',
      'GAME_SPORTS',
      'GAME_STRATEGY',
      'GAME_TRIVIA',
      'GAME_WORD',
      'FAMILY'
    ]).optional().describe(
      "Category to filter by. Available categories:\n" +
      "Main Categories:\n" +
      "- APPLICATION: All applications\n" +
      "- ANDROID_WEAR: Wear OS apps\n" +
      "- ART_AND_DESIGN: Art & Design\n" +
      "- AUTO_AND_VEHICLES: Auto & Vehicles\n" +
      "- BEAUTY: Beauty\n" +
      "- BOOKS_AND_REFERENCE: Books & Reference\n" +
      "- BUSINESS: Business\n" +
      "- COMICS: Comics\n" +
      "- COMMUNICATION: Communication\n" +
      "- DATING: Dating\n" +
      "- EDUCATION: Education\n" +
      "- ENTERTAINMENT: Entertainment\n" +
      "- EVENTS: Events\n" +
      "- FINANCE: Finance\n" +
      "- FOOD_AND_DRINK: Food & Drink\n" +
      "- HEALTH_AND_FITNESS: Health & Fitness\n" +
      "- HOUSE_AND_HOME: House & Home\n" +
      "- LIFESTYLE: Lifestyle\n" +
      "- MAPS_AND_NAVIGATION: Maps & Navigation\n" +
      "- MEDICAL: Medical\n" +
      "- MUSIC_AND_AUDIO: Music & Audio\n" +
      "- NEWS_AND_MAGAZINES: News & Magazines\n" +
      "- PARENTING: Parenting\n" +
      "- PERSONALIZATION: Personalization\n" +
      "- PHOTOGRAPHY: Photography\n" +
      "- PRODUCTIVITY: Productivity\n" +
      "- SHOPPING: Shopping\n" +
      "- SOCIAL: Social\n" +
      "- SPORTS: Sports\n" +
      "- TOOLS: Tools\n" +
      "- TRAVEL_AND_LOCAL: Travel & Local\n" +
      "- VIDEO_PLAYERS: Video Players\n" +
      "- WATCH_FACE: Watch Faces\n" +
      "- WEATHER: Weather\n\n" +
      "Game Categories:\n" +
      "- GAME: All Games\n" +
      "- GAME_ACTION: Action Games\n" +
      "- GAME_ADVENTURE: Adventure Games\n" +
      "- GAME_ARCADE: Arcade Games\n" +
      "- GAME_BOARD: Board Games\n" +
      "- GAME_CARD: Card Games\n" +
      "- GAME_CASINO: Casino Games\n" +
      "- GAME_CASUAL: Casual Games\n" +
      "- GAME_EDUCATIONAL: Educational Games\n" +
      "- GAME_MUSIC: Music Games\n" +
      "- GAME_PUZZLE: Puzzle Games\n" +
      "- GAME_RACING: Racing Games\n" +
      "- GAME_ROLE_PLAYING: Role Playing Games\n" +
      "- GAME_SIMULATION: Simulation Games\n" +
      "- GAME_SPORTS: Sports Games\n" +
      "- GAME_STRATEGY: Strategy Games\n" +
      "- GAME_TRIVIA: Trivia Games\n" +
      "- GAME_WORD: Word Games\n" +
      "- FAMILY: Family Games"
    ),
    age: z.enum(['FIVE_UNDER', 'SIX_EIGHT', 'NINE_UP'])
      .optional()
      .describe("Age range filter (only for FAMILY category). Options: FIVE_UNDER, SIX_EIGHT, NINE_UP"),
    num: z.number()
      .default(500)
      .describe("Number of apps to retrieve (default: 500)"),
    lang: z.string()
      .default("en")
      .describe("Language code for result text (default: en)"),
    country: z.string()
      .default("us")
      .describe("Country code to get results from (default: us)"),
    fullDetail: z.boolean()
      .default(false)
      .describe("Include full app details in results (default: false)")
  }, 
  async ({ collection, category, age, num, lang, country, fullDetail }) => {
    const results = await gplay.list({
      collection,
      category,
      age,
      num,
      lang,
      country,
      fullDetail
    });
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

// Sensor Tower iOS Revenue Tool
server.tool("sensor-tower-ios-revenue", 
  "Get essential revenue and market intelligence data for iOS apps from Sensor Tower. Returns optimized data including:\n" +
  "- Monthly revenue and download estimates\n" +
  "- App Store rankings and ratings\n" +
  "- Monetization details (pricing, IAP)\n" +
  "- Top 3 competitors analysis\n" +
  "- Market positioning metrics\n" +
  "Supports multiple apps in single request. Optional country parameter for region-specific data. Data cached for 30 days.",
  {
    appIds: z.union([
      z.number(),
      z.array(z.number())
    ]).describe("iOS App Store ID(s) - single number or array of numbers (e.g., 341232718 or [341232718, 553834731])"),
    includeCompetitors: z.boolean().default(true).describe("Include competitor analysis (default: true)"),
    country: z.string().optional().describe("Country code for region-specific data (e.g., 'TR', 'US', 'DE'). Optional parameter.")
  },
  async ({ appIds, includeCompetitors, country }) => {
    try {
      const ids = Array.isArray(appIds) ? appIds : [appIds];
      const results = [];

      for (const appId of ids) {
        try {
          const endpoint = `https://app.sensortower.com/api/ios/apps/${appId}`;
          const cacheKey = `ios_${appId}`;
          const rawData = await callSensorTowerAPI(endpoint, cacheKey, country);
          
          let essentialData = extractEssentialRevenueData(rawData, 'ios', appId);
          
          // Remove competitors if not requested
          if (!includeCompetitors && essentialData.competitive_analysis) {
            delete essentialData.competitive_analysis;
          }
          
          results.push({
            app_id: appId,
            success: true,
            data: essentialData
          });
        } catch (error) {
          results.push({
            app_id: appId,
            success: false,
            error: error.message
          });
        }
      }

      const summary = {
        total_apps: ids.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        apps: results
      };

      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    } catch (error) {
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            error: error.message,
            platform: "iOS"
          }, null, 2) 
        }] 
      };
    }
  }
);

// Sensor Tower Android Revenue Tool
server.tool("sensor-tower-android-revenue", 
  "Get essential revenue and market intelligence data for Android apps from Sensor Tower. Returns optimized data including:\n" +
  "- Monthly revenue and download estimates\n" +
  "- Play Store rankings and ratings\n" +
  "- Monetization details (pricing, IAP)\n" +
  "- Top 3 competitors analysis\n" +
  "- Market positioning metrics\n" +
  "Supports multiple apps in single request. Optional country parameter for region-specific data. Data cached for 30 days.",
  {
    packageNames: z.union([
      z.string(),
      z.array(z.string())
    ]).describe("Android package name(s) - single string or array (e.g., 'com.YoStarEN.Arknights' or ['com.whatsapp', 'com.facebook.katana'])"),
    includeCompetitors: z.boolean().default(true).describe("Include competitor analysis (default: true)"),
    country: z.string().optional().describe("Country code for region-specific data (e.g., 'TR', 'US', 'DE'). Optional parameter.")
  },
  async ({ packageNames, includeCompetitors, country }) => {
    try {
      const names = Array.isArray(packageNames) ? packageNames : [packageNames];
      const results = [];

      for (const packageName of names) {
        try {
          const endpoint = `https://app.sensortower.com/api/android/apps/${packageName}`;
          const cacheKey = `android_${packageName}`;
          const rawData = await callSensorTowerAPI(endpoint, cacheKey, country);
          
          let essentialData = extractEssentialRevenueData(rawData, 'android', packageName);
          
          // Remove competitors if not requested
          if (!includeCompetitors && essentialData.competitive_analysis) {
            delete essentialData.competitive_analysis;
          }
          
          results.push({
            package_name: packageName,
            success: true,
            data: essentialData
          });
        } catch (error) {
          results.push({
            package_name: packageName,
            success: false,
            error: error.message
          });
        }
      }

      const summary = {
        total_apps: names.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        apps: results
      };

      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    } catch (error) {
      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            error: error.message,
            platform: "Android"
          }, null, 2) 
        }] 
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
