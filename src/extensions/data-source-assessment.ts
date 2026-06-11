export interface DataSource {
  id: string;
  name: string;
  url: string;
  type: "api" | "dataset" | "csv" | "web-scrape" | "survey" | "other";
  description: string;
}

export interface QualityAssessment {
  sourceId: string;
  credibility: "official" | "published" | "scraped" | "survey" | "unknown";
  trustScore: number;
  reasoning: string;
  risks: string[];
  recommendations: string[];
}

export interface DataSourceApprovalRequest {
  source: DataSource;
  assessment: QualityAssessment;
  userAction?: "approved" | "rejected" | "pending";
  timestamp?: string;
}

export interface DataSourceProvenance {
  sourceId: string;
  sourceUrl: string;
  acquisitionTimestamp: string;
  qualityAssessment: QualityAssessment;
  userApprovalTimestamp: string;
  approvedBy: string;
  acquisitionCode: string;
  dataSnapshot?: object;
}

const OFFICIAL_DOMAINS = [
  "google.com",
  "googleapis.com",
  "analytics.google.com",
  "census.gov",
  "data.gov",
  "bls.gov",
  "cdc.gov",
  "who.int",
  "worldbank.org",
  "oecd.org",
];

const PUBLISHED_DOMAINS = ["kaggle.com", "ics.uci.edu", "openml.org", "data.europa.eu"];

function isOfficialDomain(hostname: string): boolean {
  return (
    hostname.endsWith(".gov") ||
    OFFICIAL_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))
  );
}

function isPublishedDomain(hostname: string): boolean {
  return PUBLISHED_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d)) ||
    hostname.endsWith(".edu");
}

function assessByUrlAndType(source: DataSource): QualityAssessment {
  if (!source.url) {
    return {
      sourceId: source.id,
      credibility: "unknown",
      trustScore: 20,
      reasoning: "No URL provided; cannot verify source origin.",
      risks: ["Missing URL", "Cannot verify provenance"],
      recommendations: ["Provide a URL to enable credibility assessment"],
    };
  }

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(source.url);
  } catch {
    return {
      sourceId: source.id,
      credibility: "unknown",
      trustScore: 30,
      reasoning: "URL is malformed; cannot verify source origin.",
      risks: ["Invalid URL format", "Cannot verify provenance"],
      recommendations: ["Fix URL before using this source"],
    };
  }

  const hostname = parsedUrl.hostname;

  if (source.type === "web-scrape") {
    return {
      sourceId: source.id,
      credibility: "scraped",
      trustScore: 40,
      reasoning: "Web-scraped data lacks formal provenance and may violate ToS.",
      risks: [
        "Potential ToS violation",
        "Data may change without notice",
        "No formal provenance",
      ],
      recommendations: ["Seek an official API or published dataset instead"],
    };
  }

  if (source.type === "survey") {
    return {
      sourceId: source.id,
      credibility: "survey",
      trustScore: 55,
      reasoning: "Survey data is self-reported and subject to response bias.",
      risks: [
        "Self-reporting bias in survey responses",
        "Selection bias in survey sample",
      ],
      recommendations: ["Validate against objective measures where possible"],
    };
  }

  if (isOfficialDomain(hostname)) {
    return {
      sourceId: source.id,
      credibility: "official",
      trustScore: 90,
      reasoning: `Official source from ${hostname}.`,
      risks: [],
      recommendations: ["Check data is current; government datasets can lag"],
    };
  }

  if (isPublishedDomain(hostname)) {
    return {
      sourceId: source.id,
      credibility: "published",
      trustScore: 78,
      reasoning: `Published dataset from ${hostname}.`,
      risks: [],
      recommendations: ["Verify dataset version and citation"],
    };
  }

  if (source.type === "other") {
    return {
      sourceId: source.id,
      credibility: "unknown",
      trustScore: 40,
      reasoning: "Source type is unclassified and origin is unclear.",
      risks: ["Unknown origin", "No formal provenance", "Data quality unverified"],
      recommendations: ["Identify the original publisher before use"],
    };
  }

  if (source.type === "api") {
    return {
      sourceId: source.id,
      credibility: "official",
      trustScore: 75,
      reasoning: "API source — assumes programmatic access implies structured, maintained data.",
      risks: [],
      recommendations: ["Review API terms of service and rate limits"],
    };
  }

  return {
    sourceId: source.id,
    credibility: "published",
    trustScore: 65,
    reasoning: "Dataset source with no recognized official or academic domain.",
    risks: [],
    recommendations: ["Verify dataset provenance and license"],
  };
}

const SOURCE_KEYWORDS: Array<{
  patterns: RegExp[];
  sources: Omit<DataSource, "id">[];
}> = [
  {
    patterns: [/weather/i],
    sources: [
      {
        name: "Open-Meteo API",
        url: "https://api.open-meteo.com",
        type: "api",
        description: "Free, open-source weather API with historical and forecast data",
      },
      {
        name: "NOAA Climate Data Online",
        url: "https://www.ncdc.noaa.gov/cdo-web/",
        type: "dataset",
        description: "Official US weather and climate data",
      },
    ],
  },
  {
    patterns: [/stock|equity|price|market/i],
    sources: [
      {
        name: "Yahoo Finance (yfinance)",
        url: "https://finance.yahoo.com",
        type: "api",
        description: "Unofficial Yahoo Finance API wrapper",
      },
      {
        name: "Alpha Vantage",
        url: "https://www.alphavantage.co",
        type: "api",
        description: "Stock market data API (free tier available)",
      },
    ],
  },
  {
    patterns: [/population|demographic|census/i],
    sources: [
      {
        name: "US Census Bureau",
        url: "https://www.census.gov/data",
        type: "dataset",
        description: "Official US population and demographic data",
      },
      {
        name: "World Bank Open Data",
        url: "https://data.worldbank.org",
        type: "dataset",
        description: "Global development and demographic indicators",
      },
    ],
  },
  {
    patterns: [/customer|user|age|income/i],
    sources: [
      {
        name: "UCI Adult Income Dataset",
        url: "https://archive.ics.uci.edu/ml/datasets/adult",
        type: "dataset",
        description: "Census-derived dataset with age, income, and demographics",
      },
      {
        name: "Kaggle Datasets",
        url: "https://www.kaggle.com/datasets",
        type: "dataset",
        description: "Community-contributed datasets, many with demographic data",
      },
    ],
  },
  {
    patterns: [/survey/i],
    sources: [
      {
        name: "Pew Research Center",
        url: "https://www.pewresearch.org/download-datasets/",
        type: "survey",
        description: "Professionally conducted survey datasets",
      },
    ],
  },
  {
    patterns: [/web|scrape|html/i],
    sources: [
      {
        name: "Common Crawl",
        url: "https://commoncrawl.org",
        type: "web-scrape",
        description: "Open repository of web crawl data",
      },
    ],
  },
];

export class DataSourceAssessor {
  async identifySources(query: string): Promise<DataSource[]> {
    const results: DataSource[] = [];

    for (const group of SOURCE_KEYWORDS) {
      if (group.patterns.some((p) => p.test(query))) {
        for (const src of group.sources) {
          results.push({ id: crypto.randomUUID(), ...src });
        }
      }
    }

    return results;
  }

  async assessQuality(source: DataSource): Promise<QualityAssessment> {
    return assessByUrlAndType(source);
  }

  async requestUserApproval(request: DataSourceApprovalRequest): Promise<boolean> {
    return request.userAction === "approved";
  }

  async recordProvenance(provenance: DataSourceProvenance): Promise<void> {
    // Persistence wired in Phase 4 (data acquisition)
  }

  async validateSourceCredibility(credibility: string): Promise<boolean> {
    return ["official", "published", "scraped", "survey", "unknown"].includes(credibility);
  }
}
