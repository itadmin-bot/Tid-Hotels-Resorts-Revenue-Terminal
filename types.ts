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
  TRANSFER = 'TRANSFER'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF'
}

export interface BankAccount {
  bank: string;
  accountNumber: string;
  accountName: string;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  price: number;
  description?: string;
  totalInventory: number;
  bookedCount: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  unit: UnitType | 'ALL';
  imageUrl?: string;
  initialStock: number;
  soldCount: number;
  lowStockThreshold?: number;
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
}

export interface TransactionPayment {
  method: SettlementMethod;
  amount: number;
  timestamp: number;
}

export interface Transaction {
  id: string;
  reference: string;
  type: 'POS' | 'FOLIO';
  unit?: UnitType;
  source: string;
  guestName: string;
  identityType?: string;
  idNumber?: string;
  email?: string;
  phone?: string;
  items: TransactionItem[];
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  payments?: TransactionPayment[];
  balance: number;
  status: SettlementStatus;
  settlementMethod?: SettlementMethod;
  selectedBank?: BankAccount;
  orderReference?: string;
  createdBy: string;
  userId: string;
  cashierName: string;
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
  domainVerified: boolean;
  lastActive?: number;
  onlineSince?: number;
  isOnline?: boolean;
  assignedUnit?: UnitType | 'ALL';
}