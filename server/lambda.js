const awsLambdaFastify = require("@fastify/aws-lambda");
import { init } from "./app.mjs";

const proxy = awsLambdaFastify(init());

export { proxy as handler };
