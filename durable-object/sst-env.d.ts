/* This file is auto-generated by SST. Do not edit. */
/* tslint:disable */
/* eslint-disable */
/* deno-fmt-ignore-file */

import "sst"
declare module "sst" {
  export interface Resource {
    "ElectricUrl": {
      "sourceId": string
      "sourceSecret": string
      "type": "sst.sst.Linkable"
      "url": string
    }
    "examples-infra-shared-examplesInfraVpcShared": {
      "type": "sst.aws.Vpc"
    }
    "postgres": {
      "type": "sst.sst.Linkable"
      "url": string
    }
    "redis-benchmark": {
      "service": string
      "type": "sst.aws.Service"
    }
    "vpc": {
      "type": "sst.aws.Vpc"
    }
  }
}

import "sst"
export {}