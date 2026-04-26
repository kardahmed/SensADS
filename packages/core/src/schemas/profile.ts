import { z } from 'zod';
import { CLIENT_MEMBER_ACCESS_LEVELS } from '../constants';
import { emailSchema, languageCodeSchema, userRoleSchema, uuidSchema } from './common';

export const createProfileSchema = z.object({
  email: emailSchema,
  fullName: z.string().min(1).max(200).nullable(),
  role: userRoleSchema,
  organizationId: uuidSchema.nullable(),
  preferredLanguage: languageCodeSchema.default('fr'),
  parentUserId: uuidSchema.nullable().optional(),
  accessLevel: z.enum(CLIENT_MEMBER_ACCESS_LEVELS).nullable().optional(),
  assignedTmId: uuidSchema.nullable().optional(),
});

export const updateProfileSchema = createProfileSchema.partial();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  totpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z
      .string()
      .min(12, 'Mot de passe minimum 12 caractères')
      .max(128)
      .regex(/[A-Z]/, 'Au moins 1 majuscule')
      .regex(/[a-z]/, 'Au moins 1 minuscule')
      .regex(/\d/, 'Au moins 1 chiffre')
      .regex(/[^\w]/, 'Au moins 1 caractère spécial'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
