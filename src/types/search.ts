export interface QmdSearchResult {
  docid: string;
  file: string;
  score: number;
  snippet?: string;
  title?: string;
}

export interface QmdSearchResponse {
  results: QmdSearchResult[];
  query: string;
  mode: string;
  total: number;
}

export interface QmdStatusResponse {
  collection: string;
  documents: number;
  embeddings: number;
  path: string;
}

export type SearchMode = "keyword" | "semantic" | "hybrid";
