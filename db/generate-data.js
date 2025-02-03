import { faker } from "@faker-js/faker";

const createUserQuery = `
  create table users (
  id uuid primary key,
  organization_id uuid references organizations (id),
  name text not null,
  email text not null,
  role text not null
);`;

export async function runMigrations() {
  try {
    for (const query of [createUserQuery]) {
      await client.query(query);
    }
    console.log("All queries have been executed");
  } catch (e) {
    console.error(e);
  } finally {
    client.end();
  }
}

export function generateUsers(numUsers) {
  const id = uuidv4();
  return Array.from({ length: numUsers }, () => {
    return {
      id: id,
      first_name: faker.person.FirstName,
      last_name: faker.person.LastName,
      email: faker.internet.email,
      role: faker.person.jobTitle,
    };
  });
}
