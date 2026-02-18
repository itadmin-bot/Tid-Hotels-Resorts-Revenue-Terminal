export enum UnitType {
  ZENZA = 'Zenza',
  WHISPERS = 'Whispers'
}

export enum SettlementStatus {
  UNPAID = 'UNPAID',
  SETTLED = 'SETTLED'
}

export enum SettlementMethod {
  POS = 'POS',
  CASH = 'CASH',
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
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
}

export interface AppSettings {
  vat: number;
  serviceCharge: number;
  zenzaBank: BankAccount;
  whispersBank: BankAccount;
  invoiceBanks: BankAccount[];
}

export interface Transaction {
  id: string;
  reference: string;
  type: 'POS' | 'FOLIO';
  unit?: UnitType; // Source Unit
  source: string; // System Source (App, Walk-in, Third-party)
  guestName: string;
  identityType?: string;
  idNumber?: string;
  email?: string;
  phone?: string;
  items: TransactionItem[];
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  discountAmount: number; // Added for flexible discounting
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: SettlementStatus;
  settlementMethod?: SettlementMethod;
  createdBy: string;
  userId: string; // Explicitly for rule matching
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
  isOnline?: boolean;
}