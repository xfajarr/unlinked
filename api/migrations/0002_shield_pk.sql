-- Unlinked Shield (spec 2026-11-21, section 4): shieldPk = Poseidon(shieldSk), 32-byte field element as 64 hex chars.
-- Null for profiles claimed before Shield; payers then can't pay that handle from a private balance.
alter table users add column shield_pk text;
