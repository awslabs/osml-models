/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * Unit tests for IntegrationTestStack.
 */

import "source-map-support/register";

import { App, Aspects } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks } from "cdk-nag";

import { IntegrationTestStack } from "../lib/integration-test-stack";
import { ModelEndpointStack } from "../lib/model-endpoint-stack";
import { NetworkStack } from "../lib/network-stack";
import {
  createTestApp,
  createTestDeploymentConfig,
  createTestEnvironment,
  generateNagReport
} from "./test-utils";

describe("IntegrationTestStack", () => {
  let app: App;
  let deploymentConfig: ReturnType<typeof createTestDeploymentConfig>;
  let networkStack: NetworkStack;
  let modelEndpointStack: ModelEndpointStack;

  beforeEach(() => {
    app = createTestApp();
    deploymentConfig = createTestDeploymentConfig({
      deployIntegrationTests: true
    });

    // Create network stack for VPC dependency
    networkStack = new NetworkStack(app, "NetworkStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig
    });

    // Create model endpoint stack for endpoint dependency
    modelEndpointStack = new ModelEndpointStack(app, "ModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup
    });
  });

  test("creates stack with correct name", () => {
    const stack = new IntegrationTestStack(app, "TestIntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup,
      modelEndpoint: {
        aircraftEndpoint: modelEndpointStack.resources.aircraftEndpoint
      }
    });

    expect(stack).toBeDefined();
    expect(stack.stackName).toBe("TestIntegrationTestStack");
  });

  test("creates test imagery construct", () => {
    const stack = new IntegrationTestStack(app, "TestIntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup,
      modelEndpoint: {
        aircraftEndpoint: modelEndpointStack.resources.aircraftEndpoint
      }
    });

    expect(stack.testImagery).toBeDefined();
    expect(stack.testImagery.imageBucket).toBeDefined();
  });

  test("creates Lambda functions", () => {
    const stack = new IntegrationTestStack(app, "TestIntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup,
      modelEndpoint: {
        aircraftEndpoint: modelEndpointStack.resources.aircraftEndpoint
      }
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::Lambda::Function", 3);
  });

  test("creates IAM roles", () => {
    const stack = new IntegrationTestStack(app, "TestIntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup,
      modelEndpoint: {
        aircraftEndpoint: modelEndpointStack.resources.aircraftEndpoint
      }
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::IAM::Role", 3);
  });

  test("creates S3 bucket for test imagery", () => {
    const stack = new IntegrationTestStack(app, "TestIntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup,
      modelEndpoint: {
        aircraftEndpoint: modelEndpointStack.resources.aircraftEndpoint
      }
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true
      }
    });
  });
});

describe("cdk-nag Compliance Checks - IntegrationTestStack", () => {
  let app: App;
  let stack: IntegrationTestStack;

  beforeAll(() => {
    app = createTestApp();
    const deploymentConfig = createTestDeploymentConfig({
      deployIntegrationTests: true
    });

    const networkStack = new NetworkStack(app, "NetworkStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig
    });

    const modelEndpointStack = new ModelEndpointStack(
      app,
      "ModelEndpointStack",
      {
        env: createTestEnvironment(),
        deployment: deploymentConfig,
        vpc: networkStack.network.vpc,
        selectedSubnets: networkStack.network.selectedSubnets,
        securityGroup: networkStack.network.securityGroup
      }
    );

    stack = new IntegrationTestStack(app, "TestIntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup,
      modelEndpoint: {
        aircraftEndpoint: modelEndpointStack.resources.aircraftEndpoint
      }
    });

    // Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
    Aspects.of(stack).add(
      new AwsSolutionsChecks({
        verbose: true
      })
    );

    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );
    generateNagReport(stack, errors, warnings);
  });

  test("No unsuppressed Warnings", () => {
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );
    expect(warnings).toHaveLength(0);
  });

  test("No unsuppressed Errors", () => {
    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*")
    );
    expect(errors).toHaveLength(0);
  });
});
