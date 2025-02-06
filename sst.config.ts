/// <reference path="./.sst/platform/config.d.ts" />

import {execSync} from "node:child_process";

export default $config({
  app(input) {
    return {
      name: "a2025BlogBackendSyncBenchmarks",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          profile: `marketing`,
        },
        neon: "0.6.3",
        command: `1.0.1`,
      },
    };
  },
  async run() {
    // env var checks
    const {getNeonConnectionString, createNeonDb} = await import("./neon");
    // Create a db in Neon
    const project = neon.getProjectOutput({id: `square-flower-52864146`});
    const dbName = `user_benchmark_${$app.stage.replace(/-/g, `_`)}`;
    const branchId = `br-blue-morning-a4ywuv4l`;

    type NeonConnOptions = Parameters<typeof getNeonConnectionString>[0];
    let dbOpts: NeonConnOptions = {
      project,
      branchId,
      roleName: "",
      databaseName: "",
      pooled: false,
    };

    const {dbName: resultingDbName, ownerName} = createNeonDb({
      projectId: project.id,
      branchId,
      dbName,
    });
    dbOpts.roleName = ownerName;
    dbOpts.databaseName = resultingDbName;
    const dbUrl = getNeonConnectionString(dbOpts);

    const postgres = new sst.Linkable(`postgres`, {
      properties: {
        url: dbUrl,
      },
    });

    dbUrl.apply((url) => {
      applyMigrations(url);
    });

    const electricUrlLink = new sst.Linkable("ElectricUrl", {
      properties: {
        url: process.env.ELECTRIC_URL,
        sourceId: process..env.ELECTRIC_SOURCE_ID,
        sourceSecret: process..env.ELECTRIC_SOURCE_SECRET,
      },
    });

    const vpc = sst.aws.Vpc.get(
      "examples-infra-shared-examplesInfraVpcShared",
      "vpc-044836d73fc26a218",
    );

    const cluster = sst.aws.Cluster.get(
      "examples-infra-shared-examplesInfraClusterSharedCluster",
      {
        vpc,
        id: `arn:aws:ecs:us-east-1:904233135193:cluster/examples-infra-shared-examplesInfraClusterSharedCluster`,
      },
    );

    const redisBenchmark = cluster.addService("redis-benchmark", {
      link: [postgres],
      dev: {
        command: `node server/app.mjs`,
        url: `http://localhost:4005`,
      },
      memory: `8 GB`,
      cpu: `4 vCPU`,
      containers: [
        {
          name: `benchmark-script`,
          image: {
            dockerfile: `./node/Dockerfile.redis`,
          },
          environment: {
            SOURCE_ID: process.env.SOURCE_ID,
            SOURCE_SECRET: process.env.SOURCE_SECRET,
            NO_COLOR: "1",
            FORCE_COLOR: "0",
          },
          cpu: `2 vCPU`,
          memory: `4 GB`,
        },
        {
          name: `redis`,
          image: {
            dockerfile: `./node/Dockerfile.redis-server`,
          },
          cpu: `2 vCPU`,
          memory: `4 GB`,
        },
      ],
    });

    //add lambda
    const node = new sst.aws.Function("FastifyApi", {
      url: true,
      link: [electricUrlLink],
      handler: "server/lambda.handler",
      timeout: "3 minutes",
      memory: "1024 MB",
    });


    return {
      node: node.url,
      dbUrl: postgres.properties.url,
    };
  },
});

function applyMigrations(uri: string) {
  console.log(`apply migrations to `, uri);
  execSync(`npx pg-migrations apply --directory ./db/migrations`, {
    env: {
      ...process.env,
      DATABASE_URL: uri,
    },
  });
}
