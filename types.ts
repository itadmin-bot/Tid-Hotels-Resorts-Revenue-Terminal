export enum UnitType {
  ZENZA = 'Zenza',
  WHISPERS = 'Whispers'
}

export enum SettlementStatus {
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID'
}

export enum SettlementMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  POS = 'POS'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF'
}

export enum Currency {
  NGN = 'NGN',
  USD = 'USD'
}

export interface BankAccount {
  bank: string;
  accountNumber: string;
  accountName: string;
  currency?: string;
  sortCode?: string;
  swiftCode?: string;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  price: number;
  currency: Currency;
  description?: string;
  totalInventory: number;
  bookedCount: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: Currency;
  category: string;
  unit: UnitType | 'ALL';
  imageUrl?: string;
  initialStock: number;
  soldCount: number;
  lowStockThreshold?: number;
  parStock?: number;
  minOrderLevelPar?: number;
  minOrderLevelTotal?: number;
}

export interface AppNotification {
  id: string;
  type: 'LOW_STOCK' | 'SOLD_OUT' | 'SECURITY';
  message: string;
  timestamp: number;
  isRead: boolean;
  unit?: string;
}

export interface TaxConfig {
  id: string;
  name: string;
  rate: number;
  type: 'VAT' | 'SC' | 'OTHER';
  visibleOnReceipt: boolean;
  isActive?: boolean;
  calculationType?: 'PERCENTAGE' | 'FIXED';
}

export interface AppSettings {
  hotelName: string;
  hotelSubName: string;
  hotelAddress: string;
  vat: number; // Legacy, kept for compatibility
  serviceCharge: number; // Legacy, kept for compatibility
  isTaxInclusive: boolean;
  taxes: TaxConfig[];
  zenzaBanks: BankAccount[];
  whispersBanks: BankAccount[];
  invoiceBanks: BankAccount[];
  proformaBanks: BankAccount[];
}

export interface PaymentEditLog {
  originalAmount: number;
  editedAmount: number;
  editorId: string;
  editorName: string;
  editedAt: number;
}

export interface TransactionPayment {
  method: SettlementMethod;
  amount: number;
  currency: Currency;
  timestamp: number;
  editLogs?: PaymentEditLog[];
}

export interface Transaction {
  id: string;
  reference: string;
  type: 'POS' | 'FOLIO' | 'PROFORMA';
  unit?: UnitType;
  source: string;
  guestName: string;
  organisation?: string;
  address?: string;
  event?: string;
  eventPeriod?: string;
  identityType?: string;
  idNumber?: string;
  email?: string;
  phone?: string;
  items: TransactionItem[];
  proformaRooms?: ProformaRoomItem[];
  proformaFood?: ProformaFoodItem[];
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  payments?: TransactionPayment[];
  currency: Currency;
  balance: number;
  status: SettlementStatus;
  settlementMethod?: SettlementMethod;
  selectedBank?: BankAccount;
  orderReference?: string;
  createdBy: string;
  userId: string;
  cashierName: string;
  preparedBy?: string;
  generatorEmail?: string;
  isDeleted?: boolean;
  appliedTaxes?: TaxConfig[];
  isTaxInclusive?: boolean;
  createdAt: number;
  updatedAt: number;
  roomDetails?: {
    roomName: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    rate: number;
  };
}

export interface ProformaRoomItem {
  startDate: string;
  endDate: string;
  noOfDays: number;
  description: string;
  qty: number;
  unitRate: number;
  discountedRate: number;
  total: number;
  comments?: string;
}

export interface ProformaFoodItem {
  startDate: string;
  endDate: string;
  noOfDays: number;
  description: string;
  qty: number;
  duration?: string;
  unitRate: number;
  discountedRate: number;
  total: number;
  comment?: string;
}

export interface TransactionItem {
  itemId?: string;
  description: string;
  quantity: number;
  price: number;
  total: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  isAdmin?: boolean;
  domainVerified: boolean;
  lastActive?: number;
  onlineSince?: number;
  isOnline?: boolean;
  assignedUnit?: UnitType | 'ALL';
}

export enum LedgerType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE'
}

export interface LedgerEntry {
  id: string;
  type: LedgerType;
  category: string;
  amount: number;
  currency: Currency;
  description: string;
  date: number;
  recordedBy: string;
  recordedById: string;
  reference?: string;
  createdAt: number;
  updatedAt: number;
}