import { faker } from "@faker-js/faker";
import { v4 as uuidv4 } from "uuid";

export function generateUsers(numUsers) {
  return Array.from({ length: numUsers }, () => {
    return {
      id: uuidv4(),
      email: faker.internet.email(),
      password_hash: faker.internet.password(),
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      phone: faker.phone.number(),
      last_login_at: faker.date.past(),
    };
  });
}
