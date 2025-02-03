create table users (
  id uuid primary key,
  first_name text not null,
  last_name text not null,
  email text not null,
  role text not null
);

