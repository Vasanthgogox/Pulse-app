export interface PageRequest {
  limit?:  number;
  cursor?: string;
}

export interface PageMeta {
  nextCursor?: string;
  hasMore:     boolean;
  total?:      number;
}

export interface Page<T> {
  items: T[];
  meta:  PageMeta;
}
