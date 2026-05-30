export interface Heading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  id?: string;
}

export interface Paragraph {
  index: number;
  text: string;
}

export interface List {
  type: 'ul' | 'ol';
  items: string[];
}

export interface Table {
  headers: string[];
  rows: string[][];
}

export interface Image {
  src: string;
  alt: string;
  isDecorative: boolean;
}

export interface Link {
  href: string;
  text: string;
  isExternal: boolean;
  crawlDecision: 'skip' | 'explore';
  reason?: string;
}

export interface PageContent {
  url: string;
  title: string;
  description: string;
  lang: string;
  extractedAt: string;
  depth: number;
  parentUrl: string | null;
  content: {
    headings: Heading[];
    paragraphs: Paragraph[];
    lists: List[];
    tables: Table[];
    images: Image[];
    links: Link[];
  };
  metadata: {
    wordCount: number;
    readabilityScore?: number;
    canonicalUrl?: string;
    ogImage?: string;
    scrollEventsFired: number;
    contentLoadedAfterScroll: boolean;
  };
}