#!/usr/bin/env node

/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
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

import { App, Stack } from "aws-cdk-lib";

import { SageMakerRole } from "../lib/constructs/model-endpoint/roles/sagemaker-role";
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
    region: deployment.account.region,
  };

  // -----------------------------------------------------------------------------
  // Create a dedicated stack for the SageMaker role. This is a workaround until
  // SM cleans up ENI's correctly. Once the ticket below is resolved this can be
  // removed.
  // https://github.com/aws-cloudformation/cloudformation-coverage-roadmap/issues/1327
  // -----------------------------------------------------------------------------

  const sagemakerRoleStack = new Stack(
    app,
    `${deployment.projectName}-SageMakerRole`,
    {
      env: {
        account: deployment.account.id,
        region: deployment.account.region,
      },
    },
  );
  const sagemakerRole = new SageMakerRole(
    sagemakerRoleStack,
    `${deployment.projectName}-SageMakerRole`,
    {
      account: deployment.account,
      roleName: `${deployment.projectName}-SageMakerRole`,
    },
  );

  // Instantiate Network Stack
  const networkStack = new NetworkStack(
    app,
    `${deployment.projectName}-Network`,
    {
      env,
      deployment,
    },
  );

  // -----------------------------------------------------------------------------
  // Add dependency on the SageMaker role stack. This is part of the workaround
  // mentioned above that allows ENI's to be cleaned up correctly.
  // -----------------------------------------------------------------------------

  networkStack.node.addDependency(sagemakerRoleStack);

  // Instantiate Model Endpoint Stack with VPC dependencies
  const modelEndpointStack = new ModelEndpointStack(
    app,
    `${deployment.projectName}-Dataplane`,
    {
      env,
      deployment,
      vpc: networkStack.network.vpc,
      selectedSubnets: networkStack.network.selectedSubnets,
      securityGroup: networkStack.network.securityGroup,
      sagemakerRole: sagemakerRole.role,
    },
  );

  // Add dependency from Model Endpoint Stack to Network Stack and SageMaker Role Stack
  modelEndpointStack.addDependency(networkStack);
  modelEndpointStack.addDependency(sagemakerRoleStack);

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
          modelEndpoint: modelEndpointStack.resources.modelEndpoint,
        },
      },
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
