import { faker } from "@faker-js/faker";
import { v4 as uuidv4 } from "uuid";

export function generateUsers(numUsers) {
  return Array.from({ length: numUsers }, () => {
    const firstName = faker.person.firstName().toLowerCase();
    const lastName = faker.person.lastName().toLowerCase();
    const randomNum = faker.number.int({ min: 1000, max: 999999 });
    const domain = faker.internet.domainName();
    
    return {
      id: uuidv4(),
      email: `${firstName}.${lastName}.${randomNum}@${domain}`,
      password_hash: faker.internet.password(),
      first_name: firstName,
      last_name: lastName,
      phone: faker.phone.number(),
      last_login_at: faker.date.past(),
    };
  });
}
