-- Lock down the leftover dev-toy table so the public key cannot read/write it.
alter table if exists public.chat_messages enable row level security;
