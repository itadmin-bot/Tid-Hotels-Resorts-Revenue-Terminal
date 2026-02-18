
import { BankAccount, Room, UnitType } from './types';

export const BRAND = {
  name: 'TIDÈ HOTELS',
  address: '38 S.O. Williams Street, Utako, Abuja.',
  domain: '@tidehotelgroup.com'
};

export const COLORS = {
  primaryBg: '#0B1C2D',
  cardBg: '#13263A',
  gold: '#C8A862',
  green: '#1DB954',
  red: '#E5484D',
  textSecondary: '#A0AEC0'
};

export const ZENZA_BANK: BankAccount = {
  bank: 'Moniepoint',
  accountNumber: '5226968546',
  accountName: 'Tide Hotels and Resorts LTD - Zenza'
};

export const WHISPERS_BANK: BankAccount = {
  bank: 'Suntrust Bank',
  accountNumber: '9990000647',
  accountName: 'Tidé Hotels and Resorts'
};

export const INVOICE_BANKS: BankAccount[] = [
  {
    bank: 'Zenith Bank',
    accountNumber: '1311027935',
    accountName: 'Tidé Hotels and Resort'
  },
  {
    bank: 'Moniepoint',
    accountNumber: '5169200615',
    accountName: 'Tidé Hotels and Resorts'
  }
];

export const INITIAL_ROOMS: Room[] = [
  { id: '1', name: 'The Sojourn Room', type: 'Standard', price: 45000 },
  { id: '2', name: 'The Harmony Studio', type: 'Studio', price: 55000 },
  { id: '3', name: 'The Serenity Studio', type: 'Studio', price: 65000 },
  { id: '4', name: 'The Narrative Suite', type: 'Suite', price: 85000 },
  { id: '5', name: 'The Odyssey Suite', type: 'Suite', price: 105000 },
  { id: '6', name: 'The Tidé Signature Suite', type: 'Signature', price: 155000 },
  { id: '7', name: 'The Tranquil Room', type: 'Standard', price: 42000 },
  { id: '8', name: 'Tranquil Grand', type: 'Grand', price: 48000 }
];

export const TAX_RATES = {
  VAT: 0.075,
  SERVICE_CHARGE: 0.10
};
