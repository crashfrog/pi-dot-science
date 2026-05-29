export interface FetchOptions {
  headers?: Record<string, string>;
  retries?: number;   // default 3
  backoffMs?: number; // initial delay ms, default 1000
}

export interface FetchResult {
  body: string;
  statusCode: number;
  acquisitionCode: string;
}

export interface DataFetcherOptions {
  fetch?: typeof fetch;
}

export class DataFetcher {
  private readonly fetch: typeof fetch;

  constructor(options?: DataFetcherOptions) {
    this.fetch = options?.fetch ?? globalThis.fetch;
  }

  async fetchCsv(url: string, opts?: FetchOptions): Promise<FetchResult> {
    const { body, statusCode } = await this.request(url, opts);
    return {
      body,
      statusCode,
      acquisitionCode: `import pandas as pd\ndf = pd.read_csv('${url}')`,
    };
  }

  async fetchApi(url: string, opts?: FetchOptions): Promise<FetchResult> {
    const { body, statusCode } = await this.request(url, opts);
    const headerLines = opts?.headers
      ? `headers = ${JSON.stringify(opts.headers)}\n`
      : "";
    return {
      body,
      statusCode,
      acquisitionCode: `import requests\n${headerLines}response = requests.get('${url}'${opts?.headers ? ", headers=headers" : ""})\ndata = response.json()`,
    };
  }

  private async request(
    url: string,
    opts?: FetchOptions,
  ): Promise<{ body: string; statusCode: number }> {
    const maxRetries = opts?.retries ?? 3;
    const backoffMs = opts?.backoffMs ?? 1000;
    let attempt = 0;

    while (true) {
      const response = await this.fetch(url, {
        headers: opts?.headers,
      });

      if (response.ok) {
        return { body: await response.text(), statusCode: response.status };
      }

      // 4xx — do not retry
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`HTTP ${response.status}: client error for ${url}`);
      }

      // 5xx — retry with backoff
      attempt++;
      if (attempt > maxRetries) {
        throw new Error(
          `HTTP ${response.status}: failed after ${maxRetries} retries for ${url}`,
        );
      }

      if (backoffMs > 0) {
        await new Promise(r => setTimeout(r, backoffMs * 2 ** (attempt - 1)));
      }
    }
  }
}
