/*
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

/**
 * Unit tests for ModelEndpointStack.
 */

import "source-map-support/register";

import { App, Aspects, Stack } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { AwsSolutionsChecks } from "cdk-nag";

import { ModelEndpointStack } from "../lib/model-endpoint-stack";
import {
  createTestApp,
  createTestDeploymentConfig,
  createTestEnvironment,
  createTestVpc,
  generateNagReport,
} from "./test-utils";

describe("ModelEndpointStack", () => {
  let app: App;
  let deploymentConfig: ReturnType<typeof createTestDeploymentConfig>;
  let vpc: Vpc;
  let securityGroup: SecurityGroup;
  let sagemakerRole: Role;

  beforeEach(() => {
    app = createTestApp();
    // Set BUILD_FROM_SOURCE to false to avoid Docker builds during tests
    deploymentConfig = createTestDeploymentConfig({
      modelEndpointConfig: {
        BUILD_FROM_SOURCE: false,
        CONTAINER_URI: "test-container:latest",
      },
    });

    const vpcStack = new Stack(app, "VpcStack", {
      env: createTestEnvironment(),
    });
    vpc = createTestVpc(vpcStack);
    securityGroup = new SecurityGroup(vpcStack, "TestSecurityGroup", {
      vpc,
      description: "Test security group",
    });

    const roleStack = new Stack(app, "RoleStack", {
      env: createTestEnvironment(),
    });
    sagemakerRole = new Role(roleStack, "SageMakerRole", {
      assumedBy: new ServicePrincipal("sagemaker.amazonaws.com"),
    });
  });

  test("creates stack with correct properties", () => {
    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      sagemakerRole: sagemakerRole,
    });

    // Stack should exist and have correct termination protection
    expect(stack.terminationProtection).toBe(false);

    // VPC should be stored
    expect(stack.vpc).toBe(vpc);
  });

  test("sets termination protection when prodLike is true", () => {
    const prodDeploymentConfig = createTestDeploymentConfig({
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: true,
        isAdc: false,
      },
      modelEndpointConfig: {
        BUILD_FROM_SOURCE: false,
        CONTAINER_URI: "test-container:latest",
      },
    });

    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: prodDeploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      sagemakerRole: sagemakerRole,
    });

    expect(stack.terminationProtection).toBe(true);
  });

  test("creates dataplane construct", () => {
    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      sagemakerRole: sagemakerRole,
    });

    // Dataplane should be created
    expect(stack.resources).toBeDefined();
    expect(stack.resources.modelEndpoint).toBeDefined();

    const template = Template.fromStack(stack);

    // Stack should have resources (the dataplane creates various resources)
    // Check for SageMaker endpoint resources
    template.hasResourceProperties("AWS::SageMaker::Model", Match.anyValue());
  });

  test("uses provided VPC from network stack", () => {
    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      sagemakerRole: sagemakerRole,
    });

    // VPC should be the same instance
    expect(stack.vpc).toBe(vpc);
  });

  test("creates stack with custom dataplane config", () => {
    const dataplaneConfigPartial = {
      BUILD_FROM_SOURCE: false,
      CONTAINER_URI: "test-container:latest",
      INSTANCE_TYPE: "ml.g4dn.2xlarge",
      INITIAL_INSTANCE_COUNT: 2,
    };

    const deploymentWithConfig = createTestDeploymentConfig({
      modelEndpointConfig: dataplaneConfigPartial,
    });

    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentWithConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      sagemakerRole: sagemakerRole,
    });

    // Stack should be created successfully
    expect(stack).toBeDefined();
    expect(stack.resources).toBeDefined();
  });

  test("exports endpoint name as CloudFormation output", () => {
    const stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      sagemakerRole: sagemakerRole,
    });

    const template = Template.fromStack(stack);

    // Should export endpoint name
    template.hasOutput("EndpointName", {
      Export: {
        Name: Match.stringLikeRegexp(
          `.*${deploymentConfig.projectName}-EndpointName.*`,
        ),
      },
    });
  });
});

describe("cdk-nag Compliance Checks - ModelEndpointStack", () => {
  let app: App;
  let stack: ModelEndpointStack;
  let vpc: Vpc;
  let securityGroup: SecurityGroup;
  let sagemakerRole: Role;

  beforeAll(() => {
    app = createTestApp();

    // Set BUILD_FROM_SOURCE to false to avoid Docker builds during tests
    const deploymentConfig = createTestDeploymentConfig({
      modelEndpointConfig: {
        BUILD_FROM_SOURCE: false,
        CONTAINER_URI: "test-container:latest",
      },
    });
    const vpcStack = new Stack(app, "VpcStack", {
      env: createTestEnvironment(),
    });
    vpc = createTestVpc(vpcStack);
    securityGroup = new SecurityGroup(vpcStack, "TestSecurityGroup", {
      vpc,
      description: "Test security group",
    });

    const roleStack = new Stack(app, "RoleStack", {
      env: createTestEnvironment(),
    });
    sagemakerRole = new Role(roleStack, "SageMakerRole", {
      assumedBy: new ServicePrincipal("sagemaker.amazonaws.com"),
    });

    stack = new ModelEndpointStack(app, "TestModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      sagemakerRole: sagemakerRole,
    });

    // Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
    Aspects.of(stack).add(
      new AwsSolutionsChecks({
        verbose: true,
      }),
    );

    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    generateNagReport(stack, errors, warnings);
  });

  test("No unsuppressed Warnings", () => {
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    expect(warnings).toHaveLength(0);
  });

  test("No unsuppressed Errors", () => {
    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    expect(errors).toHaveLength(0);
  });
});
