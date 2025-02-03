import camelcase from 'camelcase'

export function getNeonConnectionString({
  project,
  roleName,
  databaseName,
  branchId,
  pooled = false,
}: {
  project: $util.Output<neon.GetProjectResult>
  roleName: $util.Input<string>
  databaseName: $util.Input<string>
  branchId: $util.Input<string>
  pooled?: boolean
}): $util.Output<string> {
  const passwordOutput = neon.getBranchRolePasswordOutput({
    projectId: project.id,
    branchId: branchId,
    roleName: roleName,
  })

  const endpoint = neon.getBranchEndpointsOutput({
    projectId: project.id,
    branchId: branchId,
  })

  const databaseHost = endpoint.endpoints?.apply((endpoints) => {
    const hostname = endpoints![0].host
    const endpointId = endpoints![0].id
    return pooled
      ? hostname.replace(endpointId, `${endpointId}-pooler`)
      : hostname
  })

  const url = $interpolate`postgresql://${passwordOutput.roleName}:${passwordOutput.password}@${databaseHost}/${databaseName}?sslmode=require`
  return url
}

/**
 * Uses the [Neon API](https://neon.tech/docs/manage/databases) along with
 * a Pulumi Command resource and `curl` to create and delete Neon databases.
 */
export function createNeonDb({
  projectId,
  branchId,
  dbName,
}: {
  projectId: $util.Input<string>
  branchId: $util.Input<string>
  dbName: $util.Input<string>
}): $util.Output<{
  dbName: string
  ownerName: string
}> {
  if (!process.env.NEON_API_KEY) {
    throw new Error(`NEON_API_KEY is not set`)
  }

  const ownerName = `neondb_owner`

  const createCommand = `curl -f -s "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$BRANCH_ID/databases" \
    -H 'Accept: application/json' \
    -H "Authorization: Bearer $NEON_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
      "database": {
        "name": "'$DATABASE_NAME'",
        "owner_name": "${ownerName}"
      }
    }' \
    && echo " SUCCESS" || echo " FAILURE"`

  const updateCommand = `echo "Cannot update Neon database with this provisioning method SUCCESS"`

  const deleteCommand = `curl -f -s -X 'DELETE' \
    "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches/$BRANCH_ID/databases/$DATABASE_NAME" \
    -H 'Accept: application/json' \
    -H "Authorization: Bearer $NEON_API_KEY" \
    && echo " SUCCESS" || echo " FAILURE"`

  const result = new command.local.Command(
    camelcase(`neon-db-command-${dbName}`),
    {
      create: createCommand,
      update: updateCommand,
      delete: deleteCommand,
      environment: {
        NEON_API_KEY: process.env.NEON_API_KEY,
        PROJECT_ID: projectId,
        BRANCH_ID: branchId,
        DATABASE_NAME: dbName,
      },
    }
  )
  return $resolve([result.stdout, dbName]).apply(([stdout, dbName]) => {
    if (stdout.endsWith(`SUCCESS`)) {
      console.log(`Created Neon database ${dbName}`)
      return {
        dbName,
        ownerName,
      }
    } else {
      throw new Error(`Failed to create Neon database ${dbName}: ${stdout}`)
    }
  })
}
