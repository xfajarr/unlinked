-- Profiles: public keys only. V (scan) and B (spend) are what payers need; A (auth) verifies profile edits.
create table users (
  handle text primary key,
  scan_pub text not null,
  spend_pub text not null,
  auth_pub text not null,
  display_name text,
  bio text,
  created_at integer not null
);
-- One global board for every user: no handle, no address (spec 5.3).
create table announcements (
  id integer primary key autoincrement,
  ephemeral_pub text not null unique,
  view_tag integer not null,
  note_ciphertext text,
  created_at integer not null
);
