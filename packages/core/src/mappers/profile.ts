import type { LanguageCode, UserRole, ClientMemberAccessLevel } from '../constants';
import type { Profile } from '../types';

export interface DbProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  organization_id: string | null;
  preferred_language: LanguageCode;
  two_factor_enabled: boolean;
  parent_user_id: string | null;
  access_level: ClientMemberAccessLevel | null;
  assigned_tm_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function dbProfileToProfile(db: DbProfile): Profile {
  return {
    id: db.id,
    email: db.email,
    fullName: db.full_name,
    role: db.role,
    organizationId: db.organization_id,
    preferredLanguage: db.preferred_language,
    twoFactorEnabled: db.two_factor_enabled,
    parentUserId: db.parent_user_id,
    accessLevel: db.access_level,
    assignedTmId: db.assigned_tm_id,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    deletedAt: db.deleted_at,
  };
}
