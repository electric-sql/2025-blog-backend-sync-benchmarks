/// <reference path="./.sst/platform/config.d.ts" />
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
    const { getNeonConnectionString, createNeonDb } = await import("./neon");
    // Create a db in Neon
    const project = neon.getProjectOutput({ id: `square-flower-52864146` });
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

    const { dbName: resultingDbName, ownerName } = createNeonDb({
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

    // TODO run db migrations here
    //
    // TODO add db as source to Cloud

    const vpc = sst.aws.Vpc.get(
      "examples-infra-shared-examplesInfraVpcShared",
      "vpc-044836d73fc26a218",
    );
    const redis = new sst.aws.Redis("redis", { vpc });

    const cluster = sst.aws.Cluster.get(
      "examples-infra-shared-examplesInfraClusterSharedCluster",
      {
        vpc,
        id: `arn:aws:ecs:us-east-1:904233135193:cluster/examples-infra-shared-examplesInfraClusterSharedCluster`,
      },
    );

    const nodejs = cluster.addService("nodejs", {
      loadBalancer: {
        ports: [{ listen: "80/http" }],
      },
      link: [postgres, redis],
      dev: {
        command: `npx tsx ./node/index.ts`,
        url: `http://localhost:4005`,
      },
      // TODO add dockerfile in the nodejs folder
    });

    return {
      nodejs: nodejs.url,
      dbUrl: postgres.properties.url,
      redis: redis.host,
    };
  },
});
