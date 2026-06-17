import Dexie, { type Table } from "dexie";

export interface Customer {
  code: string;            // primary key (customer code from invoice)
  name: string;
  address?: string;
  phone?: string;
  createdAt: number;
  updatedAt: number;
}

export interface InvoiceLine {
  description: string;
  saleQty: number;
  freeQty: number;
  retailPrice: number;
  tradePrice: number;
  discountRegular: number;
  discountSpecial: number;
  tradeOfferRate: number;
  tradeOfferAmount: number;
  salesTax: number;
  netAmount: number;
  netRate: number;
}

export interface Invoice {
  number: string;          // primary key (invoice #)
  date: string;            // ISO yyyy-mm-dd
  customerCode: string;
  customerName: string;
  address?: string;
  bookerName?: string;
  deliveryman?: string;
  customerNo?: string;
  lines: InvoiceLine[];
  itemCount: number;
  grandTotal: number;
  source: "pdf-import" | "manual" | "outstanding-seed";
  sourceFile?: string;
  rawText?: string;
  confidence: number;      // 0..1
  lowConfidenceFields?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Payment {
  id?: number;
  customerCode: string;
  invoiceNumber?: string;   // optional: allocated to invoice
  date: string;             // ISO
  amount: number;
  method?: string;          // Cash / Bank / Cheque / Online
  reference?: string;
  collector?: string;       // person who collected
  notes?: string;
  source: "manual" | "outstanding-seed";
  createdAt: number;
}

export interface ActivityEntry {
  id?: number;
  at: number;
  kind: string;             // e.g. "invoice.import", "payment.add"
  entity?: string;          // e.g. "invoice:082909"
  summary: string;
  meta?: Record<string, unknown>;
}

export interface SettingsRow {
  key: string;
  value: unknown;
}

export interface ImportRecord {
  id?: number;
  at: number;
  fileName: string;
  kind: "invoice" | "outstanding-report" | "unknown";
  itemsImported: number;
  itemsSkipped: number;
  notes?: string;
}

class ZamZamDB extends Dexie {
  customers!: Table<Customer, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<Payment, number>;
  activity!: Table<ActivityEntry, number>;
  settings!: Table<SettingsRow, string>;
  imports!: Table<ImportRecord, number>;

  constructor() {
    super("zamzam_traders_v1");
    this.version(1).stores({
      customers: "code, name, updatedAt",
      invoices: "number, date, customerCode, customerName, bookerName, deliveryman, grandTotal, updatedAt",
      payments: "++id, customerCode, invoiceNumber, date, createdAt",
      activity: "++id, at, kind, entity",
      settings: "key",
      imports: "++id, at, kind",
    });
  }
}

let _db: ZamZamDB | null = null;
export function db(): ZamZamDB {
  if (!_db) _db = new ZamZamDB();
  return _db;
}

export function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}
