/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * Unit tests for NetworkStack.
 */

import "source-map-support/register";

import { App, Aspects } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { AwsSolutionsChecks } from "cdk-nag";

import { NetworkStack } from "../lib/network-stack";
import {
  createTestApp,
  createTestDeploymentConfig,
  createTestEnvironment,
  generateNagReport
} from "./test-utils";

describe("NetworkStack", () => {
  let app: App;
  let deploymentConfig: ReturnType<typeof createTestDeploymentConfig>;

  beforeEach(() => {
    app = createTestApp();
    deploymentConfig = createTestDeploymentConfig();
  });

  test("creates stack with correct name", () => {
    const stack = new NetworkStack(app, "TestNetworkStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig
    });

    expect(stack).toBeDefined();
    expect(stack.stackName).toBe("TestNetworkStack");
  });

  test("creates VPC", () => {
    const stack = new NetworkStack(app, "TestNetworkStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::EC2::VPC", 1);
  });

  test("creates security group", () => {
    const stack = new NetworkStack(app, "TestNetworkStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::EC2::SecurityGroup", 1);
  });

  test("exports network resources", () => {
    const stack = new NetworkStack(app, "TestNetworkStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig
    });

    expect(stack.network).toBeDefined();
    expect(stack.network.vpc).toBeDefined();
    expect(stack.network.selectedSubnets).toBeDefined();
    expect(stack.network.securityGroup).toBeDefined();
  });

  test("uses custom account and region", () => {
    const customConfig = createTestDeploymentConfig({
      account: {
        id: "987654321098",
        region: "eu-west-1",
        prodLike: false,
        isAdc: false
      }
    });

    const stack = new NetworkStack(app, "TestNetworkStack", {
      env: {
        account: customConfig.account.id,
        region: customConfig.account.region
      },
      deployment: customConfig
    });

    expect(stack.account).toBe("987654321098");
    expect(stack.region).toBe("eu-west-1");
  });
});

describe("cdk-nag Compliance Checks - NetworkStack", () => {
  let app: App;
  let stack: NetworkStack;

  beforeAll(() => {
    app = createTestApp();
    const deploymentConfig = createTestDeploymentConfig();

    stack = new NetworkStack(app, "TestNetworkStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig
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
