import { faker } from "@faker-js/faker";

export function generateUsers(numUsers) {
  const id = uuidv4();
  return Array.from({ length: numUsers }, () => {
    return {
      id: id,
      email: faker.internet.email(),
      password_hash: faker.internet.password(),
      first_name: faker.person.FirstName(),
      last_name: faker.person.LastName(),
      phone: faker.phone.number(),
      last_login: faker.date.past(),
    };
  });
}
