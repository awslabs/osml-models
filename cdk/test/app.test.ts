/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * Unit tests for the CDK application integration.
 *
 * Tests stack dependencies and overall application structure.
 */

import { CloudAssembly } from "aws-cdk-lib/cx-api";

import { IntegrationTestStack } from "../lib/integration-test-stack";
import { ModelEndpointStack } from "../lib/model-endpoint-stack";
import { NetworkStack } from "../lib/network-stack";
import {
  createTestApp,
  createTestDeploymentConfig,
  createTestEnvironment
} from "./test-utils";

describe("CDK Application - Stack Dependencies", () => {
  let assembly: CloudAssembly;
  let networkStack: NetworkStack;
  let modelEndpointStack: ModelEndpointStack;
  let testConfig: ReturnType<typeof createTestDeploymentConfig>;

  beforeAll(() => {
    testConfig = createTestDeploymentConfig({
      projectName: "OSML-Models",
      deployIntegrationTests: false
    });

    const app = createTestApp();
    const env = createTestEnvironment();

    networkStack = new NetworkStack(app, `${testConfig.projectName}-Network`, {
      env,
      deployment: testConfig
    });

    modelEndpointStack = new ModelEndpointStack(
      app,
      `${testConfig.projectName}-Dataplane`,
      {
        env,
        deployment: testConfig,
        vpc: networkStack.network.vpc,
        selectedSubnets: networkStack.network.selectedSubnets,
        securityGroup: networkStack.network.securityGroup
      }
    );

    modelEndpointStack.addDependency(networkStack);

    assembly = app.synth();
  });

  test("Model Endpoint Stack depends on Network Stack", () => {
    const modelEndpointArtifact = assembly.getStackByName(
      modelEndpointStack.stackName
    );
    const dependencyIds = modelEndpointArtifact.dependencies.map(
      (dep) => dep.id
    );
    expect(dependencyIds).toContain(networkStack.artifactId);
  });

  test("includes both stacks in assembly", () => {
    const stackNames = assembly.stacks.map((stack) => stack.stackName);
    expect(stackNames).toContain(`${testConfig.projectName}-Network`);
    expect(stackNames).toContain(`${testConfig.projectName}-Dataplane`);
  });

  test("has exactly 2 stacks", () => {
    expect(assembly.stacks).toHaveLength(2);
  });
});

describe("CDK Application - With Integration Tests", () => {
  let assembly: CloudAssembly;
  let networkStack: NetworkStack;
  let modelEndpointStack: ModelEndpointStack;
  let integrationTestStack: IntegrationTestStack;
  let testConfig: ReturnType<typeof createTestDeploymentConfig>;

  beforeAll(() => {
    testConfig = createTestDeploymentConfig({
      projectName: "OSML-Models",
      deployIntegrationTests: true
    });

    const app = createTestApp();
    const env = createTestEnvironment();

    networkStack = new NetworkStack(app, `${testConfig.projectName}-Network`, {
      env,
      deployment: testConfig
    });

    modelEndpointStack = new ModelEndpointStack(
      app,
      `${testConfig.projectName}-Dataplane`,
      {
        env,
        deployment: testConfig,
        vpc: networkStack.network.vpc,
        selectedSubnets: networkStack.network.selectedSubnets,
        securityGroup: networkStack.network.securityGroup
      }
    );

    integrationTestStack = new IntegrationTestStack(
      app,
      `${testConfig.projectName}-IntegrationTest`,
      {
        env,
        deployment: testConfig,
        vpc: networkStack.network.vpc,
        selectedSubnets: networkStack.network.selectedSubnets,
        securityGroup: networkStack.network.securityGroup,
        modelEndpoint: {
          aircraftEndpoint: modelEndpointStack.resources.aircraftEndpoint
        }
      }
    );

    modelEndpointStack.addDependency(networkStack);
    integrationTestStack.addDependency(modelEndpointStack);

    assembly = app.synth();
  });

  test("Integration Test Stack depends on Model Endpoint Stack", () => {
    const integrationTestArtifact = assembly.getStackByName(
      integrationTestStack.stackName
    );
    const dependencyIds = integrationTestArtifact.dependencies.map(
      (dep) => dep.id
    );
    expect(dependencyIds).toContain(modelEndpointStack.artifactId);
  });

  test("includes all 3 stacks in assembly", () => {
    const stackNames = assembly.stacks.map((stack) => stack.stackName);
    expect(stackNames).toContain(`${testConfig.projectName}-Network`);
    expect(stackNames).toContain(`${testConfig.projectName}-Dataplane`);
    expect(stackNames).toContain(`${testConfig.projectName}-IntegrationTest`);
  });

  test("has exactly 3 stacks", () => {
    expect(assembly.stacks).toHaveLength(3);
  });
});

describe("CDK Application - Instantiation", () => {
  test("instantiates without errors", () => {
    expect(() => {
      const app = createTestApp();
      const env = createTestEnvironment();
      const testConfig = createTestDeploymentConfig({
        projectName: "OSML-Models"
      });

      new NetworkStack(app, `${testConfig.projectName}-Network`, {
        env,
        deployment: testConfig
      });
    }).not.toThrow();
  });

  test("synthesizes without errors", () => {
    expect(() => {
      const app = createTestApp();
      const env = createTestEnvironment();
      const testConfig = createTestDeploymentConfig({
        projectName: "OSML-Models"
      });

      const networkStack = new NetworkStack(
        app,
        `${testConfig.projectName}-Network`,
        {
          env,
          deployment: testConfig
        }
      );

      new ModelEndpointStack(app, `${testConfig.projectName}-Dataplane`, {
        env,
        deployment: testConfig,
        vpc: networkStack.network.vpc,
        selectedSubnets: networkStack.network.selectedSubnets,
        securityGroup: networkStack.network.securityGroup
      });

      app.synth();
    }).not.toThrow();
  });
});
