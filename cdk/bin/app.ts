#!/usr/bin/env node

/**
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * CDK Application entry point for OSML Models infrastructure.
 *
 * This application deploys the following stacks:
 * 1. Network Stack - VPC, subnets, and security groups
 * 2. Model Endpoint Stack - SageMaker endpoints for ML models
 * 3. Integration Test Stack - Optional test resources (if deployIntegrationTests=true)
 *
 * The stacks are deployed with proper dependencies to ensure correct deployment order.
 *
 * @packageDocumentation
 */

import { App } from "aws-cdk-lib";

import { IntegrationTestStack } from "../lib/integration-test-stack";
import { ModelEndpointStack } from "../lib/model-endpoint-stack";
import { NetworkStack } from "../lib/network-stack";
import { loadDeploymentConfig } from "./deployment/load-deployment";

/**
 * Main application entry point.
 */
function main(): void {
  // Create CDK App instance
  const app = new App();

  // Load and validate deployment configuration
  const deployment = loadDeploymentConfig();

  // Create environment configuration
  const env = {
    account: deployment.account.id,
    region: deployment.account.region
  };

  // Instantiate Network Stack
  const networkStack = new NetworkStack(
    app,
    `${deployment.projectName}-Network`,
    {
      env,
      deployment
    }
  );

  // Instantiate Model Endpoint Stack with VPC dependencies
  const modelEndpointStack = new ModelEndpointStack(
    app,
    `${deployment.projectName}-Dataplane`,
    {
      env,
      deployment,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup
    }
  );

  // Add dependency from Model Endpoint Stack to Network Stack
  modelEndpointStack.addDependency(networkStack);

  // Conditionally instantiate Integration Test Stack if deployIntegrationTests=true
  if (deployment.deployIntegrationTests) {
    const integrationTestStack = new IntegrationTestStack(
      app,
      `${deployment.projectName}-IntegrationTest`,
      {
        env,
        deployment,
        vpc: networkStack.network.vpc,
        selectedSubnets: networkStack.network.selectedSubnets,
        securityGroup: networkStack.network.securityGroup,
        modelEndpoint: {
          aircraftEndpoint: modelEndpointStack.resources.aircraftEndpoint
        }
      }
    );

    // Add dependency from Integration Test Stack to Model Endpoint Stack
    integrationTestStack.addDependency(modelEndpointStack);
  }

  // Note: CDK-Nag validation is disabled to match other OSML repos (model-runner, tile-server)
  // Suppressions remain in place for future use if Nag is re-enabled
  // To enable: Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
}

// Execute main function
main();
