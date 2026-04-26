import { z } from 'zod';
import { SUPPORTED_CURRENCIES, SUPPORTED_LANGUAGES, USER_ROLES } from '../constants';

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().toLowerCase().trim();
export const positiveDecimalSchema = z.number().positive().finite();
export const nonNegativeDecimalSchema = z.number().nonnegative().finite();
export const percentageSchema = z.number().min(0).max(1);
export const datetimeSchema = z.string().datetime();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD requis');

export const currencyCodeSchema = z.enum(SUPPORTED_CURRENCIES);
export const languageCodeSchema = z.enum(SUPPORTED_LANGUAGES);
export const userRoleSchema = z.enum(USER_ROLES);

// Algérie : NIF 15 chiffres, NIS 15 chiffres, RC variable
export const nifSchema = z
  .string()
  .regex(/^\d{15}$/, 'NIF doit contenir 15 chiffres')
  .optional()
  .or(z.literal(''));

export const nisSchema = z
  .string()
  .regex(/^\d{15}$/, 'NIS doit contenir 15 chiffres')
  .optional()
  .or(z.literal(''));

export const rcSchema = z
  .string()
  .min(3)
  .max(50)
  .optional()
  .or(z.literal(''));

// EU VAT-ID format (ex: FR12345678901, DE123456789)
export const vatIdSchema = z
  .string()
  .regex(/^[A-Z]{2}[A-Z0-9]{8,12}$/i, 'Format VAT-ID EU invalide')
  .optional()
  .or(z.literal(''));

// Phone international format
export const phoneSchema = z
  .string()
  .regex(/^\+?[\d\s\-()]{6,20}$/, 'Numéro de téléphone invalide')
  .optional()
  .or(z.literal(''));

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
