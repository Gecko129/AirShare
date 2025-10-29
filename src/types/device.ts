export type DeviceType = 'windows' | 'macos' | 'linux' | 'iphone' | 'android' | 'other';

export type DeviceStatus = 'online' | 'offline';

export interface Device {
  id: string;
  name: string;
  ip: string;
  port?: number;
  last_seen?: string | number; // ISO string or epoch
  lastSeenEpoch?: number; // optional parsed epoch seconds
  type?: DeviceType;
  status?: DeviceStatus;
  ipAddress?: string;
}
export interface Device {
  [x: string]: string;
  id: string;
  name: string;
  // aggiungi altre proprietà che servono
}