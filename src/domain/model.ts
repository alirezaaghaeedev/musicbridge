export interface Metadata {
  title?: string;
  artist?: string;
  durationSeconds?: number;
  fileId?: string;
  fileUniqueId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  ambiguous?: boolean;
}
export interface Track {
  id: string;
  uri: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  available?: boolean;
  isrc?: string;
}
export interface MatchCandidate extends Track {
  spotifyTrackId: string;
  spotifyTrackUri: string;
  titleScore: number;
  artistScore: number | null;
  durationScore: number | null;
  finalScore: number;
  versionMismatch: boolean;
  missingFields: string[];
  warnings: string[];
  reasons: string[];
  computationLimited?: boolean;
}
export interface Settings {
  auto: boolean;
  threshold: number;
  duplicates: boolean;
  locale: "fa" | "en";
  minimumArtist: number;
  margin: number;
  playlist?: string;
  playlistName?: string;
}
export const states = [
  "RECEIVED",
  "QUEUED",
  "PROCESSING",
  "METADATA_REQUIRED",
  "SEARCHING",
  "REVIEW_REQUIRED",
  "READY_TO_ADD",
  "ADDING",
  "ADDED",
  "ALREADY_EXISTS",
  "NO_MATCH",
  "REAUTH_REQUIRED",
  "RETRY_PENDING",
  "RECONCILIATION_REQUIRED",
  "FAILED",
  "CANCELLED",
] as const;
export type State = (typeof states)[number];
export const terminal: readonly State[] = [
  "ADDED",
  "ALREADY_EXISTS",
  "CANCELLED",
];
export const transitions: Record<State, readonly State[]> = {
  RECEIVED: ["QUEUED"],
  QUEUED: ["PROCESSING", "CANCELLED"],
  PROCESSING: [
    "METADATA_REQUIRED",
    "SEARCHING",
    "READY_TO_ADD",
    "REAUTH_REQUIRED",
    "FAILED",
    "RETRY_PENDING",
    "RECONCILIATION_REQUIRED",
  ],
  METADATA_REQUIRED: ["QUEUED", "CANCELLED"],
  SEARCHING: [
    "REVIEW_REQUIRED",
    "READY_TO_ADD",
    "NO_MATCH",
    "RETRY_PENDING",
    "REAUTH_REQUIRED",
    "FAILED",
    "CANCELLED",
  ],
  REVIEW_REQUIRED: ["QUEUED", "CANCELLED"],
  READY_TO_ADD: [
    "ADDING",
    "ALREADY_EXISTS",
    "RETRY_PENDING",
    "REAUTH_REQUIRED",
    "FAILED",
    "RECONCILIATION_REQUIRED",
  ],
  ADDING: [
    "ADDED",
    "RECONCILIATION_REQUIRED",
    "REAUTH_REQUIRED",
    "RETRY_PENDING",
    "FAILED",
  ],
  ADDED: [],
  ALREADY_EXISTS: [],
  NO_MATCH: ["QUEUED", "CANCELLED"],
  REAUTH_REQUIRED: ["QUEUED", "CANCELLED"],
  RETRY_PENDING: ["PROCESSING", "CANCELLED"],
  RECONCILIATION_REQUIRED: ["PROCESSING", "ADDED", "CANCELLED"],
  FAILED: ["QUEUED", "CANCELLED"],
  CANCELLED: [],
};
export interface Submission {
  id: string;
  user_id: string;
  chat_id: string;
  message_id: number;
  metadata: string;
  settings: string;
  state: State;
  selected: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}
export interface Job {
  id: string;
  kind: "update" | "music" | "notify";
  payload: string;
  status: string;
  attempts: number;
  lease: number;
  available_at: number;
}
