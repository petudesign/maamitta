import {
  DEFAULT_PRICE_BOOK,
  sanitizePriceBook,
} from '../engine/priceBook';
import type { PriceBook } from '../engine/types';

export interface PriceBookRepository {
  load(): PriceBook;
  save(priceBook: PriceBook): boolean;
  clear(): void;
}

const PRICE_BOOK_KEY = 'maamitta:pricebook:v1';

class LocalStoragePriceBookRepository implements PriceBookRepository {
  load(): PriceBook {
    if (typeof window === 'undefined') {
      return { ...DEFAULT_PRICE_BOOK, presets: {} };
    }
    try {
      const raw = window.localStorage.getItem(PRICE_BOOK_KEY);
      if (!raw) return { ...DEFAULT_PRICE_BOOK, presets: {} };
      return sanitizePriceBook(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_PRICE_BOOK, presets: {} };
    }
  }

  save(priceBook: PriceBook): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const clean = sanitizePriceBook(priceBook);
      window.localStorage.setItem(PRICE_BOOK_KEY, JSON.stringify(clean));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(PRICE_BOOK_KEY);
    } catch {
      // Ignore storage errors
    }
  }
}

export const priceBookRepository: PriceBookRepository =
  new LocalStoragePriceBookRepository();
