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
import store from 'app-store-scraper';
import gplay from 'google-play-scraper';
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
    collection: z.string().describe("Collection to fetch from (e.g. TOP_FREE_IOS, TOP_PAID_IOS, etc)"),
    category: z.string().optional().describe("Category ID to filter by"),
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
    collection: z.string().describe("Collection to fetch from (e.g. TOP_FREE, TOP_PAID, etc)"),
    category: z.string().optional().describe("Category to filter by"),
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
