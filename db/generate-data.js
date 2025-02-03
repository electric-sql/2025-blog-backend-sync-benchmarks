import { faker } from "@faker-js/faker";

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
