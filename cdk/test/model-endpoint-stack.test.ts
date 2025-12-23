/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * Unit tests for ModelEndpointStack.
 */

import "source-map-support/register";

import { App, Aspects } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks } from "cdk-nag";

import { ModelEndpointStack } from "../lib/model-endpoint-stack";
import { NetworkStack } from "../lib/network-stack";
import {
  createTestApp,
  createTestDeploymentConfig,
  createTestEnvironment,
  generateNagReport
} from "./test-utils";

describe("ModelEndpointStack", () => {
  let app: App;
  let deploymentConfig: ReturnType<typeof createTestDeploymentConfig>;
  let networkStack: NetworkStack;

  beforeEach(() => {
    app = createTestApp();
    deploymentConfig = createTestDeploymentConfig();

    // Create network stack for VPC dependency
    networkStack = new NetworkStack(app, "NetworkStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig
    });
  });

  test("creates stack with correct name", () => {
    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup
    });

    expect(stack).toBeDefined();
    expect(stack.stackName).toBe("TestModelEndpointStack");
  });

  test("creates SageMaker Model", () => {
    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::SageMaker::Model", 1);
  });

  test("creates SageMaker EndpointConfig", () => {
    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::SageMaker::EndpointConfig", 1);
  });

  test("creates SageMaker Endpoint", () => {
    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::SageMaker::Endpoint", 1);
  });

  test("creates IAM role", () => {
    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::IAM::Role", 1);
  });

  test("exports model endpoint resources", () => {
    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup
    });

    expect(stack.resources).toBeDefined();
    expect(stack.resources.aircraftEndpoint).toBeDefined();
    expect(stack.resources.sagemakerRole).toBeDefined();
    expect(stack.resources.container).toBeDefined();
  });

  test("sets termination protection when prodLike is true", () => {
    const prodConfig = createTestDeploymentConfig({
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: true,
        isAdc: false
      }
    });

    const prodNetworkStack = new NetworkStack(app, "ProdNetworkStack", {
      env: createTestEnvironment(),
      deployment: prodConfig
    });

    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: prodConfig,
      vpc: prodNetworkStack.network.vpc,
      selectedSubnets: prodNetworkStack.network.selectedSubnets,
      securityGroup: prodNetworkStack.network.securityGroup
    });

    expect(stack.terminationProtection).toBe(true);
  });
});

describe("cdk-nag Compliance Checks - ModelEndpointStack", () => {
  let app: App;
  let stack: ModelEndpointStack;

  beforeAll(() => {
    app = createTestApp();
    const deploymentConfig = createTestDeploymentConfig();

    const networkStack = new NetworkStack(app, "NetworkStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig
    });

    stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup
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
