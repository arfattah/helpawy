export type CircleType = 'family' | 'friends' | 'work' | 'neighbors';
export type LocMode = 'always' | 'sos' | 'off';
export type MediaMode = 'approval' | 'sos' | 'never';

export interface Profile {
  id: string;
  display_name: string;
  phone_hash: string | null;
  lang: 'ar' | 'en';
  push_token: string | null;
  helper_enabled: boolean;
  helper_radius_m: 500 | 1000 | 2000;
  helper_max_links: 1 | 2 | 3;
  quiet_hours: boolean;
  quiet_start: number;
  quiet_end: number;
  quiet_allow_direct: boolean;
  created_at: string;
}

export interface Circle {
  id: string;
  name: string;
  type: CircleType;
  owner_id: string;
  invite_code: string;
  created_at: string;
}

export interface CircleMember {
  circle_id: string;
  user_id: string;
  role: 'owner' | 'member';
  loc_mode: LocMode;
  mic_mode: MediaMode;
  cam_mode: MediaMode;
  joined_at: string;
}

export interface MemberLocation {
  user_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  updated_at: string;
}

export interface SosEvent {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  state: 'live' | 'safe' | 'cancelled';
  mic_open: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface SosAlert {
  sos_id: string;
  recipient_id: string;
  audience: 'circle' | 'nearby';
  links: number;
  via_hash: string | null;
  dist_m: number | null;
  seen_at: string | null;
  response: 'on_my_way' | 'cant' | null;
  created_at: string;
}

export interface SosMedia {
  id: string;
  sos_id: string;
  user_id: string;
  kind: 'photo' | 'video' | 'voice';
  path: string;
  created_at: string;
}

export interface ListenRequest {
  id: string;
  circle_id: string;
  from_user: string;
  to_user: string;
  kind: 'mic' | 'cam' | 'both';
  state: 'pending' | 'allowed' | 'denied' | 'ended';
  created_at: string;
}

export interface SosStats {
  circle_total: number;
  nearby_total: number;
  seen: number;
  on_my_way: number;
}
