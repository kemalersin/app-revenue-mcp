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

const server = new McpServer({
  name: "app-info-scraper",
  version: "1.0.0"
});

// App Store Tools
server.tool("app-store-search", 
  "Search for apps on the App Store",
  {
    term: z.string().describe("Search term"),
    country: z.string().default("us").describe("Country code (default: us)"),
    num: z.number().default(50).describe("Number of results (default: 50)")
  }, 
  async ({ term, country, num }) => {
    const results = await store.search({ term, country, num });
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

server.tool("app-store-details", 
  "Get detailed information about an App Store app",
  {
    id: z.number().describe("Numeric App ID (e.g., 444934666)"),
    country: z.string().default("us").describe("Country code (default: us)")
  }, 
  async ({ id, country }) => {
    const details = await store.app({ id, country });
    return { content: [{ type: "text", text: JSON.stringify(details) }] };
  }
);

server.tool("app-store-reviews", 
  "Get reviews for an App Store app",
  {
    id: z.number().describe("Numeric App ID (e.g., 444934666)"),
    country: z.string().default("us").describe("Country code (default: us)"),
    page: z.number().default(1).describe("Page number (default: 1)"),
    sort: z.enum(["recent", "helpful"]).default("recent").describe("Sort order (recent or helpful)")
  }, 
  async ({ id, country, page, sort }) => {
    const reviews = await store.reviews({
      id,
      country,
      page,
      sort: sort === "helpful" ? store.sort.HELPFUL : store.sort.RECENT
    });
    return { content: [{ type: "text", text: JSON.stringify(reviews) }] };
  }
);

server.tool("app-store-similar", 
  "Get similar apps from the App Store",
  {
    id: z.number().describe("Numeric App ID (e.g., 444934666)")
  }, 
  async ({ id }) => {
    const similar = await store.similar({ id });
    return { content: [{ type: "text", text: JSON.stringify(similar) }] };
  }
);

// Additional App Store Tools
server.tool("app-store-developer", 
  "Get apps by a developer on the App Store",
  {
    devId: z.string().describe("Developer ID"),
    country: z.string().default("us").describe("Country code (default: us)")
  }, 
  async ({ devId, country }) => {
    const apps = await store.developer({ devId, country });
    return { content: [{ type: "text", text: JSON.stringify(apps) }] };
  }
);

server.tool("app-store-suggest", 
  "Get search suggestions from App Store",
  {
    term: z.string().describe("Search term"),
    country: z.string().default("us").describe("Country code (default: us)")
  }, 
  async ({ term, country }) => {
    const suggestions = await store.suggest({ term, country });
    return { content: [{ type: "text", text: JSON.stringify(suggestions) }] };
  }
);

server.tool("app-store-ratings", 
  "Get ratings for an App Store app",
  {
    id: z.number().describe("Numeric App ID (e.g., 444934666)"),
    country: z.string().default("us").describe("Country code (default: us)")
  }, 
  async ({ id, country }) => {
    const ratings = await store.ratings({ id, country });
    return { content: [{ type: "text", text: JSON.stringify(ratings) }] };
  }
);

server.tool("app-store-version-history", 
  "Get version history for an App Store app",
  {
    id: z.number().describe("Numeric App ID (e.g., 444934666)")
  }, 
  async ({ id }) => {
    const history = await store.versionHistory({ id });
    return { content: [{ type: "text", text: JSON.stringify(history) }] };
  }
);

server.tool("app-store-privacy", 
  "Get privacy details for an App Store app",
  {
    id: z.number().describe("Numeric App ID (e.g., 444934666)")
  }, 
  async ({ id }) => {
    const privacy = await store.privacy({ id });
    return { content: [{ type: "text", text: JSON.stringify(privacy) }] };
  }
);
server.tool("app-store-list", 
  "Get apps from iTunes collections",
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
    country: z.string().default("us").describe("Country code (default: us)"),
    num: z.number().max(200).default(50).describe("Number of results (default: 50, max: 200)")
  }, 
  async ({ collection, category, country, num }) => {
    const results = await store.list({ collection, category, country, num });
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

// Google Play Tools
server.tool("google-play-search", 
  "Search for apps on Google Play",
  {
    term: z.string().describe("Search term"),
    country: z.string().default("us").describe("Country code (default: us)"),
    num: z.number().default(20).describe("Number of results (default: 20)"),
    fullDetail: z.boolean().default(false).describe("Fetch full details (default: false)")
  }, 
  async ({ term, country, num, fullDetail }) => {
    const results = await gplay.search({ term, country, num, fullDetail });
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

server.tool("google-play-details", 
  "Get detailed information about a Google Play app",
  {
    appId: z.string().describe("App ID"),
    country: z.string().default("us").describe("Country code (default: us)")
  }, 
  async ({ appId, country }) => {
    const details = await gplay.app({ appId, country });
    return { content: [{ type: "text", text: JSON.stringify(details) }] };
  }
);

server.tool("google-play-reviews", 
  "Get reviews for a Google Play app",
  {
    appId: z.string().describe("App ID"),
    country: z.string().default("us").describe("Country code (default: us)"),
    num: z.number().default(100).describe("Number of reviews (default: 100)")
  }, 
  async ({ appId, country, num }) => {
    const reviews = await gplay.reviews({ appId, country, num, sort: gplay.sort.NEWEST });
    return { content: [{ type: "text", text: JSON.stringify(reviews.data) }] };
  }
);

server.tool("google-play-similar", 
  "Get similar apps from Google Play",
  {
    appId: z.string().describe("App ID"),
    country: z.string().default("us").describe("Country code (default: us)")
  }, 
  async ({ appId, country }) => {
    const similar = await gplay.similar({ appId, country });
    return { content: [{ type: "text", text: JSON.stringify(similar) }] };
  }
);

// Additional Google Play Tools
server.tool("google-play-developer", 
  "Get apps by a developer on Google Play",
  {
    devId: z.string().describe("Developer ID"),
    lang: z.string().default("en").describe("Language code (default: en)"),
    country: z.string().default("us").describe("Country code (default: us)"),
    num: z.number().default(60).describe("Number of results (default: 60)")
  }, 
  async ({ devId, lang, country, num }) => {
    const apps = await gplay.developer({ devId, lang, country, num });
    return { content: [{ type: "text", text: JSON.stringify(apps) }] };
  }
);

server.tool("google-play-suggest", 
  "Get search suggestions from Google Play",
  {
    term: z.string().describe("Search term"),
    lang: z.string().default("en").describe("Language code (default: en)"),
    country: z.string().default("us").describe("Country code (default: us)")
  }, 
  async ({ term, lang, country }) => {
    const suggestions = await gplay.suggest({ term, lang, country });
    return { content: [{ type: "text", text: JSON.stringify(suggestions) }] };
  }
);

server.tool("google-play-permissions", 
  "Get permissions required by a Google Play app",
  {
    appId: z.string().describe("App ID"),
    lang: z.string().default("en").describe("Language code (default: en)"),
    short: z.boolean().default(false).describe("Short format (default: false)")
  }, 
  async ({ appId, lang, short }) => {
    const permissions = await gplay.permissions({ appId, lang, short });
    return { content: [{ type: "text", text: JSON.stringify(permissions) }] };
  }
);

server.tool("google-play-datasafety", 
  "Get data safety information for a Google Play app",
  {
    appId: z.string().describe("App ID"),
    lang: z.string().default("en").describe("Language code (default: en)")
  }, 
  async ({ appId, lang }) => {
    const datasafety = await gplay.datasafety({ appId, lang });
    return { content: [{ type: "text", text: JSON.stringify(datasafety) }] };
  }
);

server.tool("google-play-categories", 
  "Get list of Google Play app categories",
  {}, 
  async () => {
    const categories = await gplay.categories();
    return { content: [{ type: "text", text: JSON.stringify(categories) }] };
  }
);

server.tool("google-play-list", 
  "Get apps from Google Play collections",
  {
    collection: z.enum(['TOP_FREE', 'TOP_PAID', 'GROSSING'])
      .describe(
        "Collection to fetch from. Available collections:\n" +
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
    country: z.string().default("us").describe("Country code (default: us)"),
    num: z.number().default(50).describe("Number of results (default: 50)")
  }, 
  async ({ collection, category, country, num }) => {
    const results = await gplay.list({ collection, category, country, num });
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
