const awsLambdaFastify = require("@fastify/aws-lambda");
const init = require("./app");

const proxy = awsLambdaFastify(init());

exports.handler = proxy;
