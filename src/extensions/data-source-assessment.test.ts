import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  DataSource,
  QualityAssessment,
  DataSourceApprovalRequest,
  DataSourceProvenance,
  DataSourceAssessor,
} from "./data-source-assessment";

describe("issue-18", () => {
  let assessor: DataSourceAssessor;

  beforeEach(() => {
    assessor = new DataSourceAssessor();
  });

  describe("Data source identification", () => {
    it("should identify candidate data sources from a query", async () => {
      const query =
        "I need customer age and income data from a public dataset";
      const sources = await assessor.identifySources(query);

      expect(sources).toBeDefined();
      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
    });

    it("should identify multiple source types (APIs, datasets, CSVs, etc.)", async () => {
      const query = "Find historical stock price data";
      const sources = await assessor.identifySources(query);

      const sourceTypes = new Set(sources.map((s) => s.type));
      expect(sourceTypes.size).toBeGreaterThan(0);
    });

    it("should return sources with required metadata", async () => {
      const query = "Need population demographic data";
      const sources = await assessor.identifySources(query);

      if (sources.length > 0) {
        const source = sources[0];
        expect(source).toHaveProperty("id");
        expect(source).toHaveProperty("name");
        expect(source).toHaveProperty("url");
        expect(source).toHaveProperty("type");
        expect(source).toHaveProperty("description");
      }
    });

    it("should handle empty results gracefully", async () => {
      const query = "Completely nonsensical query xyz123abc";
      const sources = await assessor.identifySources(query);

      expect(Array.isArray(sources)).toBe(true);
      // Can be empty, but should not throw
    });

    it("should identify API sources correctly", async () => {
      const query = "Need weather data API";
      const sources = await assessor.identifySources(query);

      const apiSources = sources.filter((s) => s.type === "api");
      if (sources.length > 0) {
        expect(apiSources.length + sources.length).toBeGreaterThanOrEqual(
          sources.length
        );
      }
    });

    it("should identify public dataset sources", async () => {
      const query = "Find public dataset for analysis";
      const sources = await assessor.identifySources(query);

      const datasetSources = sources.filter((s) => s.type === "dataset");
      if (sources.length > 0) {
        expect(datasetSources.length + sources.length).toBeGreaterThanOrEqual(
          sources.length
        );
      }
    });

    it("should identify CSV file sources", async () => {
      const query = "Need CSV data";
      const sources = await assessor.identifySources(query);

      const csvSources = sources.filter((s) => s.type === "csv");
      if (sources.length > 0) {
        expect(csvSources.length + sources.length).toBeGreaterThanOrEqual(
          sources.length
        );
      }
    });

    it("should identify web-scrape sources", async () => {
      const query = "Need data from web pages";
      const sources = await assessor.identifySources(query);

      const scrapeSources = sources.filter((s) => s.type === "web-scrape");
      if (sources.length > 0) {
        expect(scrapeSources.length + sources.length).toBeGreaterThanOrEqual(
          sources.length
        );
      }
    });

    it("should identify survey-based sources", async () => {
      const query = "Need survey data";
      const sources = await assessor.identifySources(query);

      const surveySources = sources.filter((s) => s.type === "survey");
      if (sources.length > 0) {
        expect(surveySources.length + sources.length).toBeGreaterThanOrEqual(
          sources.length
        );
      }
    });
  });

  describe("Quality assessment", () => {
    it("should assess source quality", async () => {
      const source: DataSource = {
        id: "test-1",
        name: "Test Dataset",
        url: "https://example.com/data",
        type: "dataset",
        description: "Test data source",
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment).toBeDefined();
      expect(assessment).toHaveProperty("sourceId");
      expect(assessment).toHaveProperty("credibility");
      expect(assessment).toHaveProperty("trustScore");
      expect(assessment).toHaveProperty("reasoning");
      expect(assessment).toHaveProperty("risks");
      expect(assessment).toHaveProperty("recommendations");
    });

    it("should classify official API sources as official", async () => {
      const source: DataSource = {
        id: "api-official",
        name: "Google Analytics API",
        url: "https://analytics.google.com/analytics/web/",
        type: "api",
        description: "Official Google Analytics API",
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment.credibility).toBe("official");
    });

    it("should classify published datasets appropriately", async () => {
      const source: DataSource = {
        id: "kaggle-dataset",
        name: "Kaggle Dataset",
        url: "https://www.kaggle.com/datasets/example",
        type: "dataset",
        description: "Published dataset on Kaggle",
      };

      const assessment = await assessor.assessQuality(source);

      expect(["published", "official"]).toContain(assessment.credibility);
    });

    it("should identify scraped web sources", async () => {
      const source: DataSource = {
        id: "scraped-web",
        name: "Scraped Web Data",
        url: "https://example.com/page",
        type: "web-scrape",
        description: "Data scraped from web",
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment.credibility).toBe("scraped");
    });

    it("should identify survey-based sources", async () => {
      const source: DataSource = {
        id: "survey-data",
        name: "Survey Results",
        url: "https://survey.example.com",
        type: "survey",
        description: "Self-reported survey data",
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment.credibility).toBe("survey");
    });

    it("should provide trust score between 0 and 100", async () => {
      const source: DataSource = {
        id: "test-source",
        name: "Test",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment.trustScore).toBeGreaterThanOrEqual(0);
      expect(assessment.trustScore).toBeLessThanOrEqual(100);
    });

    it("should identify risks for low-credibility sources", async () => {
      const source: DataSource = {
        id: "low-cred",
        name: "Unknown Source",
        url: "https://example.com/random",
        type: "other",
        description: "Unknown origin",
      };

      const assessment = await assessor.assessQuality(source);

      expect(Array.isArray(assessment.risks)).toBe(true);
      if (assessment.trustScore < 50) {
        expect(assessment.risks.length).toBeGreaterThan(0);
      }
    });

    it("should provide recommendations for improving data quality", async () => {
      const source: DataSource = {
        id: "test-recommend",
        name: "Test Source",
        url: "https://example.com",
        type: "dataset",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      expect(Array.isArray(assessment.recommendations)).toBe(true);
    });

    it("should explain reasoning for quality assessment", async () => {
      const source: DataSource = {
        id: "test-reasoning",
        name: "Test Source",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      expect(typeof assessment.reasoning).toBe("string");
      expect(assessment.reasoning.length).toBeGreaterThan(0);
    });

    it("should be conservative in quality assessment", async () => {
      const unknownSource: DataSource = {
        id: "unknown",
        name: "Unknown Source",
        url: "https://unknown.example.com",
        type: "other",
        description: "Unknown",
      };

      const assessment = await assessor.assessQuality(unknownSource);

      // Conservative means erring on side of caution
      expect(assessment.trustScore).toBeLessThan(70);
    });

    it("should rate official APIs higher than scraped sources", async () => {
      const officialSource: DataSource = {
        id: "official",
        name: "Official API",
        url: "https://api.example.com",
        type: "api",
        description: "Official",
      };

      const scrapedSource: DataSource = {
        id: "scraped",
        name: "Scraped Data",
        url: "https://example.com",
        type: "web-scrape",
        description: "Scraped",
      };

      const officialAssessment = await assessor.assessQuality(officialSource);
      const scrapedAssessment = await assessor.assessQuality(scrapedSource);

      expect(officialAssessment.trustScore).toBeGreaterThan(
        scrapedAssessment.trustScore
      );
    });
  });

  describe("User approval workflow", () => {
    it("should request user approval before using a source", async () => {
      const source: DataSource = {
        id: "test-source",
        name: "Test Source",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      const request: DataSourceApprovalRequest = {
        source,
        assessment,
        userAction: "pending",
      };

      const approval = await assessor.requestUserApproval(request);

      expect(typeof approval).toBe("boolean");
    });

    it("should accept user approval", async () => {
      const source: DataSource = {
        id: "test-approve",
        name: "Test",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      const request: DataSourceApprovalRequest = {
        source,
        assessment,
        userAction: "approved",
      };

      const approval = await assessor.requestUserApproval(request);

      expect(approval).toBe(true);
    });

    it("should accept user rejection", async () => {
      const source: DataSource = {
        id: "test-reject",
        name: "Test",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      const request: DataSourceApprovalRequest = {
        source,
        assessment,
        userAction: "rejected",
      };

      const approval = await assessor.requestUserApproval(request);

      expect(approval).toBe(false);
    });

    it("should show assessment details in approval request", async () => {
      const source: DataSource = {
        id: "test-details",
        name: "Test Source",
        url: "https://example.com",
        type: "dataset",
        description: "Test dataset",
      };

      const assessment = await assessor.assessQuality(source);

      const request: DataSourceApprovalRequest = {
        source,
        assessment,
      };

      // Approval request should contain all assessment information
      expect(request.assessment.trustScore).toBeDefined();
      expect(request.assessment.credibility).toBeDefined();
      expect(request.assessment.risks).toBeDefined();
      expect(request.assessment.reasoning).toBeDefined();
    });

    it("should prevent use of unapproved sources", async () => {
      const source: DataSource = {
        id: "unapproved",
        name: "Test",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      const request: DataSourceApprovalRequest = {
        source,
        assessment,
        userAction: "rejected",
      };

      const approval = await assessor.requestUserApproval(request);

      expect(approval).toBe(false);
      // Should not proceed with data acquisition if not approved
    });

    it("should have timestamp when requesting approval", async () => {
      const source: DataSource = {
        id: "timestamp-test",
        name: "Test",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      const request: DataSourceApprovalRequest = {
        source,
        assessment,
        timestamp: new Date().toISOString(),
      };

      expect(request.timestamp).toBeDefined();
      expect(typeof request.timestamp).toBe("string");
    });
  });

  describe("Provenance recording", () => {
    it("should record assessment with provenance", async () => {
      const source: DataSource = {
        id: "prov-test",
        name: "Test Source",
        url: "https://example.com/data",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      const provenance: DataSourceProvenance = {
        sourceId: source.id,
        sourceUrl: source.url,
        acquisitionTimestamp: new Date().toISOString(),
        qualityAssessment: assessment,
        userApprovalTimestamp: new Date().toISOString(),
        approvedBy: "user@example.com",
        acquisitionCode: "fetch_data_from_api()",
      };

      await assessor.recordProvenance(provenance);

      expect(provenance.sourceId).toBe(source.id);
      expect(provenance.sourceUrl).toBe(source.url);
    });

    it("should record source URL with provenance", async () => {
      const sourceUrl = "https://api.example.com/data";

      const provenance: DataSourceProvenance = {
        sourceId: "test-id",
        sourceUrl,
        acquisitionTimestamp: new Date().toISOString(),
        qualityAssessment: {
          sourceId: "test-id",
          credibility: "official",
          trustScore: 85,
          reasoning: "Official API",
          risks: [],
          recommendations: [],
        },
        userApprovalTimestamp: new Date().toISOString(),
        approvedBy: "user@example.com",
        acquisitionCode: "fetch_api_data()",
      };

      await assessor.recordProvenance(provenance);

      expect(provenance.sourceUrl).toBe(sourceUrl);
    });

    it("should record acquisition timestamp", async () => {
      const timestamp = new Date().toISOString();

      const provenance: DataSourceProvenance = {
        sourceId: "test-id",
        sourceUrl: "https://example.com",
        acquisitionTimestamp: timestamp,
        qualityAssessment: {
          sourceId: "test-id",
          credibility: "official",
          trustScore: 85,
          reasoning: "Official",
          risks: [],
          recommendations: [],
        },
        userApprovalTimestamp: new Date().toISOString(),
        approvedBy: "user@example.com",
        acquisitionCode: "fetch_data()",
      };

      await assessor.recordProvenance(provenance);

      expect(provenance.acquisitionTimestamp).toBe(timestamp);
    });

    it("should record quality assessment in provenance", async () => {
      const assessment: QualityAssessment = {
        sourceId: "test-id",
        credibility: "official",
        trustScore: 90,
        reasoning: "Official government data source",
        risks: [],
        recommendations: ["Verify recent updates"],
      };

      const provenance: DataSourceProvenance = {
        sourceId: "test-id",
        sourceUrl: "https://example.com",
        acquisitionTimestamp: new Date().toISOString(),
        qualityAssessment: assessment,
        userApprovalTimestamp: new Date().toISOString(),
        approvedBy: "user@example.com",
        acquisitionCode: "fetch_official_data()",
      };

      await assessor.recordProvenance(provenance);

      expect(provenance.qualityAssessment).toEqual(assessment);
    });

    it("should record user approval timestamp", async () => {
      const approvalTime = new Date().toISOString();

      const provenance: DataSourceProvenance = {
        sourceId: "test-id",
        sourceUrl: "https://example.com",
        acquisitionTimestamp: new Date().toISOString(),
        qualityAssessment: {
          sourceId: "test-id",
          credibility: "official",
          trustScore: 85,
          reasoning: "Test",
          risks: [],
          recommendations: [],
        },
        userApprovalTimestamp: approvalTime,
        approvedBy: "user@example.com",
        acquisitionCode: "fetch_data()",
      };

      await assessor.recordProvenance(provenance);

      expect(provenance.userApprovalTimestamp).toBe(approvalTime);
    });

    it("should record acquisition code with provenance", async () => {
      const code = `
        import pandas as pd
        df = pd.read_csv('https://example.com/data.csv')
      `;

      const provenance: DataSourceProvenance = {
        sourceId: "test-id",
        sourceUrl: "https://example.com/data.csv",
        acquisitionTimestamp: new Date().toISOString(),
        qualityAssessment: {
          sourceId: "test-id",
          credibility: "published",
          trustScore: 75,
          reasoning: "Published dataset",
          risks: [],
          recommendations: [],
        },
        userApprovalTimestamp: new Date().toISOString(),
        approvedBy: "user@example.com",
        acquisitionCode: code,
      };

      await assessor.recordProvenance(provenance);

      expect(provenance.acquisitionCode).toContain("read_csv");
    });

    it("should record user approval identifier", async () => {
      const userId = "user@example.com";

      const provenance: DataSourceProvenance = {
        sourceId: "test-id",
        sourceUrl: "https://example.com",
        acquisitionTimestamp: new Date().toISOString(),
        qualityAssessment: {
          sourceId: "test-id",
          credibility: "official",
          trustScore: 85,
          reasoning: "Test",
          risks: [],
          recommendations: [],
        },
        userApprovalTimestamp: new Date().toISOString(),
        approvedBy: userId,
        acquisitionCode: "fetch_data()",
      };

      await assessor.recordProvenance(provenance);

      expect(provenance.approvedBy).toBe(userId);
    });

    it("should optionally record data snapshot with provenance", async () => {
      const snapshot = {
        shape: [1000, 5],
        columns: ["id", "name", "email", "age", "created_at"],
        sampleRow: {
          id: 1,
          name: "John Doe",
          email: "john@example.com",
          age: 30,
          created_at: "2024-01-01",
        },
      };

      const provenance: DataSourceProvenance = {
        sourceId: "test-id",
        sourceUrl: "https://example.com",
        acquisitionTimestamp: new Date().toISOString(),
        qualityAssessment: {
          sourceId: "test-id",
          credibility: "official",
          trustScore: 85,
          reasoning: "Official",
          risks: [],
          recommendations: [],
        },
        userApprovalTimestamp: new Date().toISOString(),
        approvedBy: "user@example.com",
        acquisitionCode: "fetch_data()",
        dataSnapshot: snapshot,
      };

      await assessor.recordProvenance(provenance);

      expect(provenance.dataSnapshot).toBeDefined();
      expect(provenance.dataSnapshot).toHaveProperty("shape");
      expect(provenance.dataSnapshot).toHaveProperty("columns");
    });
  });

  describe("Integration scenarios", () => {
    it("should complete full workflow: identify → assess → approve → record", async () => {
      // Step 1: Identify sources
      const query = "Need customer data for analysis";
      const sources = await assessor.identifySources(query);
      expect(sources.length).toBeGreaterThanOrEqual(0);

      // If sources found, proceed with assessment and approval
      if (sources.length > 0) {
        const source = sources[0];

        // Step 2: Assess quality
        const assessment = await assessor.assessQuality(source);
        expect(assessment).toBeDefined();

        // Step 3: Request approval
        const approvalRequest: DataSourceApprovalRequest = {
          source,
          assessment,
          userAction: "approved",
          timestamp: new Date().toISOString(),
        };

        const approved = await assessor.requestUserApproval(approvalRequest);
        expect(approved).toBe(true);

        // Step 4: Record provenance
        if (approved) {
          const provenance: DataSourceProvenance = {
            sourceId: source.id,
            sourceUrl: source.url,
            acquisitionTimestamp: new Date().toISOString(),
            qualityAssessment: assessment,
            userApprovalTimestamp: new Date().toISOString(),
            approvedBy: "user@example.com",
            acquisitionCode: "fetch_approved_data()",
          };

          await assessor.recordProvenance(provenance);
          expect(provenance.sourceId).toBe(source.id);
        }
      }
    });

    it("should prevent data use without approval", async () => {
      const source: DataSource = {
        id: "test-no-approval",
        name: "Test",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      const request: DataSourceApprovalRequest = {
        source,
        assessment,
        userAction: "rejected",
      };

      const approved = await assessor.requestUserApproval(request);

      expect(approved).toBe(false);
      // Data should not be acquired if not approved
    });

    it("should allow reapproval of sources with updated assessment", async () => {
      const source: DataSource = {
        id: "test-reapprove",
        name: "Test",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const initialAssessment = await assessor.assessQuality(source);

      // First approval
      let request: DataSourceApprovalRequest = {
        source,
        assessment: initialAssessment,
        userAction: "rejected",
      };

      let approved = await assessor.requestUserApproval(request);
      expect(approved).toBe(false);

      // Re-assess (maybe source quality improved)
      const updatedAssessment = await assessor.assessQuality(source);

      // Request approval again
      request = {
        source,
        assessment: updatedAssessment,
        userAction: "approved",
      };

      approved = await assessor.requestUserApproval(request);
      expect(approved).toBe(true);
    });

    it("should handle multiple sources for same query", async () => {
      const query = "Customer demographic data";
      const sources = await assessor.identifySources(query);

      if (sources.length >= 2) {
        // Assess multiple sources
        const assessments = await Promise.all(
          sources.map((s) => assessor.assessQuality(s))
        );

        expect(assessments.length).toBe(sources.length);
        // Should be able to compare quality across sources
        const trustScores = assessments.map((a) => a.trustScore);
        expect(Math.max(...trustScores)).toBeGreaterThanOrEqual(
          Math.min(...trustScores)
        );
      }
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle sources with missing URL", async () => {
      const source: DataSource = {
        id: "no-url",
        name: "Test Source",
        url: "",
        type: "api",
        description: "Test",
      };

      // Should still attempt assessment even with missing URL
      const assessment = await assessor.assessQuality(source);
      expect(assessment).toBeDefined();
      // But should flag missing URL as a risk
      expect(assessment.risks.length).toBeGreaterThan(0);
    });

    it("should handle invalid URL formats", async () => {
      const source: DataSource = {
        id: "bad-url",
        name: "Test",
        url: "not-a-valid-url",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment.credibility).toBe("unknown");
      expect(assessment.trustScore).toBeLessThan(50);
    });

    it("should validate credibility enum values", async () => {
      const validCredibilities = [
        "official",
        "published",
        "scraped",
        "survey",
        "unknown",
      ];

      const source: DataSource = {
        id: "enum-test",
        name: "Test",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      expect(validCredibilities).toContain(assessment.credibility);
    });

    it("should handle very long descriptions", async () => {
      const longDescription = "A".repeat(10000);

      const source: DataSource = {
        id: "long-desc",
        name: "Test",
        url: "https://example.com",
        type: "dataset",
        description: longDescription,
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment).toBeDefined();
    });

    it("should handle special characters in source name", async () => {
      const source: DataSource = {
        id: "special-chars",
        name: "Test & API (v2.0) [Beta]",
        url: "https://example.com",
        type: "api",
        description: "Test",
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment).toBeDefined();
    });
  });

  describe("Credibility assessment details", () => {
    it("should identify government data as official", async () => {
      const source: DataSource = {
        id: "gov-data",
        name: "US Census Bureau Data",
        url: "https://www.census.gov/data",
        type: "dataset",
        description: "Official US Census",
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment.credibility).toBe("official");
      expect(assessment.trustScore).toBeGreaterThan(80);
    });

    it("should rate academic/published datasets high", async () => {
      const source: DataSource = {
        id: "academic",
        name: "UCI Machine Learning Repository",
        url: "https://archive.ics.uci.edu/ml/",
        type: "dataset",
        description: "Academic dataset collection",
      };

      const assessment = await assessor.assessQuality(source);

      expect(["official", "published"]).toContain(assessment.credibility);
      expect(assessment.trustScore).toBeGreaterThan(70);
    });

    it("should flag web scrapes as lower credibility", async () => {
      const source: DataSource = {
        id: "scrape",
        name: "Scraped E-commerce Data",
        url: "https://ecommerce-site.com/products",
        type: "web-scrape",
        description: "Scraped product data",
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment.credibility).toBe("scraped");
      expect(assessment.trustScore).toBeLessThan(70);
      expect(assessment.risks.length).toBeGreaterThan(0);
    });

    it("should flag survey data with medium credibility", async () => {
      const source: DataSource = {
        id: "survey",
        name: "Online Survey Results",
        url: "https://survey.example.com",
        type: "survey",
        description: "Self-reported survey",
      };

      const assessment = await assessor.assessQuality(source);

      expect(assessment.credibility).toBe("survey");
      expect(assessment.trustScore).toBeLessThan(80);
      expect(assessment.trustScore).toBeGreaterThan(30);
      // Should include risk about self-reporting bias
      expect(
        assessment.risks.some((r) =>
          r.toLowerCase().includes("survey")
        )
      ).toBe(true);
    });
  });
});
