/// <reference types="node" />
import * as cdk from "aws-cdk-lib";
import { ApiServiceStack } from "../lib/api-service-stack";

const app = new cdk.App();

const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

// ECS Service that attaches to the existing platform ALB/cluster
new ApiServiceStack(app, "VersoStat-ApiServiceStack-prod", {
    env,
    imageTag: process.env.IMAGE_TAG ?? "latest",
    desiredCount: 1,
    cpu: 512,
    memoryMiB: 1024,
});
